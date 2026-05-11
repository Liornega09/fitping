import { MetricType, Prisma, WorkoutStatus } from '@prisma/client';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { normalizeText } from '../domain/catalog.js';
import { parseIntent } from '../domain/parser.js';
import {
  bestE1RMAcrossLogs,
  bestE1RMForLog,
  roundKg
} from '../domain/pr.js';
import { formatSuggestion, suggestNextTarget } from '../domain/overload.js';
import { suggestWorkout, formatSuggestion as formatWorkoutSuggestion, type RecentLogEntry } from '../domain/suggest.js';
import { EXERCISE_SEEDS } from '../domain/catalog.js';
import { detectPlateau, formatPlateauWarning } from '../domain/plateau.js';
import { buildVolumeHistory, formatVolumeHistory } from '../domain/volume.js';
import { computeGoalProgress, formatGoalProgress, formatGoalAchieved } from '../domain/goals.js';
import { replies } from '../domain/replies.js';
import { llmClassifierFromEnv, type LLMIntentClassifier } from '../lib/llm.js';
import { prisma } from '../lib/prisma.js';
import { validateTwilioSignature } from '../lib/twilioSignature.js';

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function toRepsArray(json: Prisma.JsonValue): number[] {
  if (!Array.isArray(json)) {
    return [];
  }
  return json.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function formatMetricType(type: MetricType) {
  return type.toLowerCase();
}

async function resolveExercise(aliasRaw: string) {
  const alias = normalizeText(aliasRaw);
  const exercises = await prisma.exercise.findMany({ where: { isActive: true } });

  for (const exercise of exercises) {
    if (normalizeText(exercise.canonicalName) === alias) {
      return { exercise, suggestion: null as string | null };
    }

    if (Array.isArray(exercise.aliases)) {
      const aliases = exercise.aliases.map((value: unknown) => normalizeText(String(value)));
      if (aliases.includes(alias)) {
        return { exercise, suggestion: null as string | null };
      }
      if (aliases.some((item: string) => item.startsWith(alias) || alias.startsWith(item))) {
        return { exercise: null, suggestion: aliases[0] ?? exercise.canonicalName };
      }
    }
  }

  return { exercise: null, suggestion: null };
}

async function getOrCreateUser(whatsappNumber: string) {
  return prisma.user.upsert({
    where: { whatsappNumber },
    update: {},
    create: { whatsappNumber }
  });
}

async function getActiveWorkout(userId: string) {
  return prisma.workout.findFirst({
    where: {
      userId,
      status: WorkoutStatus.ACTIVE
    },
    orderBy: { startedAt: 'desc' }
  });
}

function rankSetsByMuscle(entries: { muscle: string; sets: number }[]) {
  return entries.sort((a, b) => b.sets - a.sets);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toTwiml(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

// ---------------------------------------------------------------------------
// Rate limiter — 20 messages per user per 60-second window (in-memory).
// Resets automatically; no persistence needed for this threshold.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateBucket = { count: number; windowStart: number };
const rateBuckets = new Map<string, RateBucket>();

/** Exposed for tests only — clears all rate-limit state. */
export function clearRateLimiter(): void {
  rateBuckets.clear();
}

function isRateLimited(userId: string, now: number): boolean {
  const bucket = rateBuckets.get(userId);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(userId, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

type WebhookReply = { reply: string };

export type WhatsappRouteOptions = {
  /**
   * Optional LLM-based intent classifier used as a fallback when the
   * deterministic regex parser returns 'unknown'. Pass `null` (or omit)
   * to disable the LLM path entirely. Tests inject a fake classifier;
   * production reads OPENAI_API_KEY via llmClassifierFromEnv().
   */
  llmClassifier?: LLMIntentClassifier | null;
};

export async function whatsappWebhookRoute(
  app: FastifyInstance,
  opts: WhatsappRouteOptions = {}
) {
  const llm = opts.llmClassifier === undefined ? llmClassifierFromEnv() : opts.llmClassifier;
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST' || !request.url.startsWith('/webhooks/whatsapp')) {
      return;
    }

    // Read directly from process.env (instead of the validated config) so this
    // module doesn't pull in DATABASE_URL validation in environments that only
    // exercise the HTTP layer (e.g. CI test runs).
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      // No token configured — skip verification (dev/test). Warn so this is
      // visible in production logs if someone forgets to set it.
      request.log.warn(
        'TWILIO_AUTH_TOKEN is not set — skipping Twilio signature verification'
      );
      return;
    }

    const headerValue = request.headers['x-twilio-signature'];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    const url = `${request.protocol}://${request.hostname}${request.url}`;
    const params = (request.body ?? {}) as Record<string, string | undefined>;

    if (!validateTwilioSignature(authToken, signature, url, params)) {
      request.log.warn({ url }, 'Rejected request with invalid Twilio signature');
      reply.code(403);
      return reply.send({ error: 'Invalid Twilio signature' });
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/webhooks/whatsapp')) {
      return payload;
    }

    const query = request.query as { format?: string };
    if (query.format === 'json') {
      return payload;
    }

    let reply_text: string | undefined;
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload) as Partial<WebhookReply>;
        reply_text = parsed.reply;
      } catch {
        reply_text = undefined;
      }
    }

    if (!reply_text) {
      return payload;
    }

    reply.header('Content-Type', 'text/xml');
    return toTwiml(reply_text);
  });

  app.post('/webhooks/whatsapp', async (request: FastifyRequest<{ Body: Record<string, string | undefined> }>) => {
    const body = request.body;
    const from = body.From;
    const message = body.Body;
    const messageSid = body.MessageSid;

    if (!from || !message) {
      // Use English by default — we don't have an intent yet to know the
      // user's language for this corrupt payload.
      return { reply: replies('en').missing_payload() };
    }

    // Idempotency: Twilio retries the same webhook (same MessageSid) when it
    // doesn't receive a 200 in time. Return the cached reply so we don't
    // create duplicate workouts/logs/metrics.
    if (messageSid) {
      const cached = await prisma.processedMessage.findUnique({
        where: { messageSid }
      });
      if (cached) {
        request.log.info({ messageSid }, 'Returning cached reply for duplicate MessageSid');
        return { reply: cached.replyText };
      }
    }

    const intent = parseIntent(message);
    if (isRateLimited(from, Date.now())) {
      return { reply: replies(intent.language).rate_limited() };
    }

    const result = await processMessage(from, message, llm);

    if (messageSid) {
      try {
        await prisma.processedMessage.create({
          data: {
            messageSid,
            fromNumber: from,
            replyText: result.reply
          }
        });
      } catch (err) {
        // Concurrent retry won the race — fetch the cached reply and use it
        // instead of returning a second, potentially divergent response.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const cached = await prisma.processedMessage.findUnique({
            where: { messageSid }
          });
          if (cached) {
            request.log.info({ messageSid }, 'Race on MessageSid resolved from cache');
            return { reply: cached.replyText };
          }
        }
        throw err;
      }
    }

    return result;
  });
}

async function processMessage(
  from: string,
  message: string,
  llm: LLMIntentClassifier | null
): Promise<{ reply: string }> {
  const user = await getOrCreateUser(from);
  let intent = parseIntent(message);

  // LLM fallback: when our regex parser couldn't make sense of the message,
  // ask the model for a structured Intent and re-dispatch. We deliberately
  // do NOT consult the LLM for 'invalid_*' results — those mean the user
  // typed a recognizable command shape with bad arguments, and we want the
  // existing helpful error message instead of a model guess.
  if (intent.type === 'unknown' && llm) {
    const llmIntent = await llm.classify(message, intent.language);
    if (llmIntent && llmIntent.type !== 'unknown') {
      intent = llmIntent;
    }
  }

  const t = replies(intent.language);

    if (intent.type === 'start') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (activeWorkout) {
        return { reply: t.workout_already_active(activeWorkout.name) };
      }

      const workout = await prisma.workout.create({
        data: {
          userId: user.id,
          name: intent.name,
          status: WorkoutStatus.ACTIVE
        }
      });

      return { reply: t.started_workout(workout.name) };
    }

    if (intent.type === 'done') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (!activeWorkout) {
        return { reply: t.no_active_workout() };
      }

      const logs = await prisma.exerciseLog.findMany({
        where: { workoutId: activeWorkout.id },
        include: { exercise: true }
      });

      if (logs.length === 0) {
        await prisma.workout.update({
          where: { id: activeWorkout.id },
          data: {
            status: WorkoutStatus.DONE,
            finishedAt: new Date(),
            totalSets: 0,
            setsPerMuscleJson: {}
          }
        });
        return { reply: t.workout_saved_empty(activeWorkout.name) };
      }

      const setsPerMuscle: Record<string, number> = {};
      let totalSets = 0;
      let topLiftLabel = '';
      let topLiftWeight = -1;
      let topLiftReps = 0;

      for (const log of logs) {
        const muscle = log.exercise.primaryMuscle;
        setsPerMuscle[muscle] = (setsPerMuscle[muscle] ?? 0) + log.setsCount;
        totalSets += log.setsCount;

        const reps = toRepsArray(log.reps);
        const maxReps = reps.length ? Math.max(...reps) : 0;
        if (log.weight > topLiftWeight || (log.weight === topLiftWeight && maxReps > topLiftReps)) {
          topLiftWeight = log.weight;
          topLiftReps = maxReps;
          topLiftLabel = `${log.exercise.canonicalName} — ${log.weight}kg x ${maxReps}`;
        }
      }

      await prisma.workout.update({
        where: { id: activeWorkout.id },
        data: {
          status: WorkoutStatus.DONE,
          finishedAt: new Date(),
          totalSets,
          setsPerMuscleJson: setsPerMuscle
        }
      });

      const ranked = rankSetsByMuscle(
        Object.entries(setsPerMuscle).map(([muscle, sets]) => ({ muscle, sets }))
      );

      const lines = [
        t.workout_saved_header(activeWorkout.name),
        ...ranked.map((item) => `${item.muscle}: ${item.sets} sets`),
        t.total_sets(totalSets),
        t.top_lift(topLiftLabel)
      ];

      return { reply: lines.join('\n') };
    }

    if (intent.type === 'undo') {
      const [lastLog, lastMetric] = await Promise.all([
        prisma.exerciseLog.findFirst({
          where: { userId: user.id },
          orderBy: { loggedAt: 'desc' },
          include: { exercise: true }
        }),
        prisma.bodyMetric.findFirst({
          where: { userId: user.id },
          orderBy: { loggedAt: 'desc' }
        })
      ]);

      if (!lastLog && !lastMetric) {
        return { reply: t.nothing_to_undo() };
      }

      if (lastMetric && (!lastLog || lastMetric.loggedAt > lastLog.loggedAt)) {
        await prisma.bodyMetric.delete({ where: { id: lastMetric.id } });
        return { reply: t.metric_removed(formatMetricType(lastMetric.type)) };
      }

      if (lastLog) {
        await prisma.exerciseLog.delete({ where: { id: lastLog.id } });
        return { reply: t.exercise_removed(lastLog.exercise.canonicalName) };
      }
    }

    if (intent.type === 'summary_today') {
      const since = startOfToday();
      const logs = await prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: since }
        },
        include: { exercise: true }
      });

      if (logs.length === 0) {
        return { reply: t.no_logs_today() };
      }

      const byMuscle: Record<string, number> = {};
      let totalSets = 0;
      for (const log of logs) {
        byMuscle[log.exercise.primaryMuscle] = (byMuscle[log.exercise.primaryMuscle] ?? 0) + log.setsCount;
        totalSets += log.setsCount;
      }

      const ranked = rankSetsByMuscle(
        Object.entries(byMuscle).map(([muscle, sets]) => ({ muscle, sets }))
      );
      const lines = [t.today_summary_header(), ...ranked.map((item) => `${item.muscle}: ${item.sets}`), t.total_sets(totalSets)];
      return { reply: lines.join('\n') };
    }

    if (intent.type === 'summary_week') {
      const weekStart = startOfWeek();
      const weekEnd = endOfWeek(weekStart);
      const logs = await prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: weekStart, lte: weekEnd }
        },
        include: { exercise: true }
      });

      if (logs.length === 0) {
        return { reply: t.no_logs_week() };
      }

      const byMuscle: Record<string, number> = {};
      let totalSets = 0;
      for (const log of logs) {
        byMuscle[log.exercise.primaryMuscle] = (byMuscle[log.exercise.primaryMuscle] ?? 0) + log.setsCount;
        totalSets += log.setsCount;
      }

      const ranked = rankSetsByMuscle(
        Object.entries(byMuscle).map(([muscle, sets]) => ({ muscle, sets }))
      );
      const lines = [t.week_summary_header(), ...ranked.map((item) => `${item.muscle}: ${item.sets}`), t.total_sets(totalSets)];
      return { reply: lines.join('\n') };
    }

    if (intent.type === 'progress') {
      const resolved = await resolveExercise(intent.exerciseAlias);
      if (!resolved.exercise) {
        if (resolved.suggestion) {
          return { reply: t.unknown_exercise_with_suggestion(intent.exerciseAlias, resolved.suggestion) };
        }
        return { reply: t.unknown_exercise_with_suggestion(intent.exerciseAlias, intent.exerciseAlias) };
      }

      const logs = await prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          exerciseId: resolved.exercise.id
        },
        orderBy: { loggedAt: 'desc' },
        take: 30
      });

      if (logs.length === 0) {
        return { reply: t.no_logs_for_exercise(resolved.exercise.canonicalName) };
      }

      const lines = [t.progress_header(resolved.exercise.canonicalName)];
      for (const log of logs.slice(0, 5)) {
        const reps = toRepsArray(log.reps);
        const bestReps = reps.length ? Math.max(...reps) : 0;
        const date = log.loggedAt.toISOString().slice(0, 10);
        lines.push(`${date}: ${log.weight}kg x ${bestReps}`);
      }

      const plateauResult = detectPlateau(
        logs.map((l) => ({ weight: l.weight, reps: toRepsArray(l.reps), loggedAt: l.loggedAt })),
        new Date()
      );
      if (plateauResult) {
        lines.push('');
        lines.push(formatPlateauWarning(plateauResult, intent.language));
      }

      return { reply: lines.join('\n') };
    }

    if (intent.type === 'weight' || intent.type === 'sleep' || intent.type === 'energy') {
      const type =
        intent.type === 'weight'
          ? MetricType.WEIGHT
          : intent.type === 'sleep'
            ? MetricType.SLEEP
            : MetricType.ENERGY;

      await prisma.bodyMetric.create({
        data: {
          userId: user.id,
          type,
          valueNum: intent.value
        }
      });

      return { reply: t.metric_saved(intent.type, intent.value) };
    }

    if (intent.type === 'pain') {
      await prisma.bodyMetric.create({
        data: {
          userId: user.id,
          type: MetricType.PAIN,
          valueText: intent.note,
          painScore: intent.score
        }
      });

      return { reply: t.pain_saved(intent.note, intent.score) };
    }

    if (intent.type === 'exercise_log') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (!activeWorkout) {
        return { reply: t.no_active_workout() };
      }

      const resolved = await resolveExercise(intent.alias);
      if (!resolved.exercise) {
        if (resolved.suggestion) {
          return { reply: t.unknown_exercise_with_suggestion(intent.alias, resolved.suggestion) };
        }
        return { reply: t.unknown_exercise_generic() };
      }

      // Fetch prior logs (BEFORE creating the new one) so we can decide if
      // this entry sets a new estimated 1RM personal record.
      const priorLogs = await prisma.exerciseLog.findMany({
        where: { userId: user.id, exerciseId: resolved.exercise.id }
      });
      const priorBest = bestE1RMAcrossLogs(
        priorLogs.map((log) => ({ weight: log.weight, reps: toRepsArray(log.reps) }))
      );
      const newBest = bestE1RMForLog(intent.weight, intent.reps);

      const volume = intent.weight * intent.reps.reduce((sum, value) => sum + value, 0);

      await prisma.exerciseLog.create({
        data: {
          userId: user.id,
          workoutId: activeWorkout.id,
          exerciseId: resolved.exercise.id,
          rawAlias: intent.alias,
          weight: intent.weight,
          reps: intent.reps,
          setsCount: intent.reps.length,
          volume
        }
      });

      const lines = [t.exercise_saved(resolved.exercise.canonicalName, intent.weight, intent.reps)];

      // Only celebrate a PR if there was prior history AND we actually beat
      // it. First-ever log of an exercise is not announced (every first set
      // would trivially "beat" zero, which feels noisy).
      if (priorLogs.length > 0 && newBest > priorBest) {
        lines.push(t.new_pr(roundKg(newBest), roundKg(priorBest)));
      }

      // Progressive-overload nudge — only after the user has at least one
      // prior log for this exercise, so brand-new lifters aren't pushed
      // before they've established a baseline.
      if (priorLogs.length > 0) {
        const suggestion = suggestNextTarget({ weight: intent.weight, reps: intent.reps });
        if (suggestion) {
          lines.push(t.next_target(suggestion.weight, suggestion.reps));
        }
      }

      // Goal check — if the user has a goal for this exercise, check if it's now achieved.
      const goal = await prisma.goal.findUnique({
        where: { userId_exerciseId: { userId: user.id, exerciseId: resolved.exercise.id } },
        include: { exercise: true }
      });
      if (goal && !goal.achievedAt) {
        const currentE1RM = newBest;
        const targetE1RM = goal.targetWeight * (1 + goal.targetReps / 30);
        if (currentE1RM >= targetE1RM) {
          await prisma.goal.update({
            where: { userId_exerciseId: { userId: user.id, exerciseId: resolved.exercise.id } },
            data: { achievedAt: new Date() }
          });
          lines.push(formatGoalAchieved(goal.exercise.canonicalName, goal.targetWeight, goal.targetReps, intent.language));
        }
      }

      return { reply: lines.join('\n') };
    }

    if (intent.type === 'invalid_energy') {
      return { reply: t.invalid_energy() };
    }

    if (intent.type === 'help') {
      return { reply: t.help() };
    }

    if (intent.type === 'suggest') {
      const lookbackDays = 14;
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const logs = await prisma.exerciseLog.findMany({
        where: { userId: user.id, loggedAt: { gte: since } },
        include: { exercise: true },
        orderBy: { loggedAt: 'desc' }
      });

      const recentLogs: RecentLogEntry[] = logs.map((log) => {
        const reps = toRepsArray(log.reps);
        const topReps = reps.length > 0 ? Math.max(...reps) : 0;
        return {
          canonicalName: log.exercise.canonicalName,
          primaryMuscle: log.exercise.primaryMuscle,
          workoutDate: log.loggedAt,
          bestSet: { weight: log.weight, reps: topReps }
        };
      });

      const suggestion = suggestWorkout({
        catalog: EXERCISE_SEEDS.map((e) => ({
          canonicalName: e.canonicalName,
          primaryMuscle: e.primaryMuscle
        })),
        recentLogs,
        now: new Date()
      });

      if (!suggestion) {
        return { reply: t.suggest_unavailable() };
      }
      return { reply: formatWorkoutSuggestion(suggestion, intent.language) };
    }

    if (intent.type === 'volume') {
      const weeksBack = 4;
      const since = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);
      const logs = await prisma.exerciseLog.findMany({
        where: { userId: user.id, loggedAt: { gte: since } },
        include: { exercise: true },
        orderBy: { loggedAt: 'asc' }
      });

      const volumeLogs = logs.map((log) => ({
        weight: log.weight,
        reps: toRepsArray(log.reps),
        loggedAt: log.loggedAt,
        primaryMuscle: log.exercise.primaryMuscle
      }));

      const weeks = buildVolumeHistory(volumeLogs, intent.muscle, new Date(), weeksBack);
      return { reply: formatVolumeHistory(intent.muscle, weeks, intent.language) };
    }

    if (intent.type === 'set_goal') {
      const resolved = await resolveExercise(intent.exerciseAlias);
      if (!resolved.exercise) {
        if (resolved.suggestion) {
          return { reply: t.unknown_exercise_with_suggestion(intent.exerciseAlias, resolved.suggestion) };
        }
        return { reply: t.unknown_exercise_generic() };
      }

      await prisma.goal.upsert({
        where: { userId_exerciseId: { userId: user.id, exerciseId: resolved.exercise.id } },
        update: { targetWeight: intent.weight, targetReps: intent.reps, achievedAt: null },
        create: { userId: user.id, exerciseId: resolved.exercise.id, targetWeight: intent.weight, targetReps: intent.reps }
      });

      return { reply: t.goal_set(resolved.exercise.canonicalName, intent.weight, intent.reps) };
    }

    if (intent.type === 'goals') {
      const goals = await prisma.goal.findMany({
        where: { userId: user.id },
        include: { exercise: true },
        orderBy: { createdAt: 'asc' }
      });

      if (goals.length === 0) {
        return { reply: t.no_goals() };
      }

      const lines = [t.goals_header()];
      for (const goal of goals) {
        const logs = await prisma.exerciseLog.findMany({
          where: { userId: user.id, exerciseId: goal.exerciseId }
        });
        const bestE1RM = logs.reduce((best, log) => {
          const reps = toRepsArray(log.reps);
          const e1rm = Math.max(...reps.map((r) => (log.weight * (1 + r / 30))));
          return e1rm > best ? e1rm : best;
        }, 0);

        const progress = computeGoalProgress(
          {
            exerciseName: goal.exercise.canonicalName,
            targetWeight: goal.targetWeight,
            targetReps: goal.targetReps,
            achievedAt: goal.achievedAt,
            createdAt: goal.createdAt
          },
          bestE1RM
        );
        lines.push(formatGoalProgress(progress, intent.language));
      }

      return { reply: lines.join('\n') };
    }

    if (intent.type === 'invalid_metric') {
      return { reply: t.invalid_metric(intent.metric) };
    }

    if (intent.type === 'invalid_pain') {
      return { reply: t.invalid_pain() };
    }

    if (intent.type === 'invalid_exercise_log') {
      return { reply: t.invalid_exercise_log() };
    }

    return { reply: t.could_not_parse() };
}
