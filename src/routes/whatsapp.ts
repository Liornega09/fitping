import { MetricType, Prisma, WorkoutStatus } from '@prisma/client';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { normalizeText } from '../domain/catalog.js';
import { parseIntent } from '../domain/parser.js';
import { prisma } from '../lib/prisma.js';

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

type WebhookReply = { reply: string };

export async function whatsappWebhookRoute(app: FastifyInstance) {
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

    if (!from || !message) {
      return { reply: 'Missing From or Body in webhook payload.' };
    }

    const user = await getOrCreateUser(from);
    const intent = parseIntent(message);

    if (intent.type === 'start') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (activeWorkout) {
        return { reply: `Workout ${activeWorkout.name} is already active. Send done first.` };
      }

      const workout = await prisma.workout.create({
        data: {
          userId: user.id,
          name: intent.name,
          status: WorkoutStatus.ACTIVE
        }
      });

      return { reply: `Started workout ${workout.name}.` };
    }

    if (intent.type === 'done') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (!activeWorkout) {
        return { reply: 'No active workout. Send: start A' };
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
        return { reply: `Workout ${activeWorkout.name} saved. No exercises logged.` };
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
        `Workout ${activeWorkout.name} saved.`,
        ...ranked.map((item) => `${item.muscle}: ${item.sets} sets`),
        `Total: ${totalSets} sets`,
        `Top lift: ${topLiftLabel}`
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
        return { reply: 'Nothing to undo.' };
      }

      if (lastMetric && (!lastLog || lastMetric.loggedAt > lastLog.loggedAt)) {
        await prisma.bodyMetric.delete({ where: { id: lastMetric.id } });
        return { reply: `${formatMetricType(lastMetric.type)} removed.` };
      }

      if (lastLog) {
        await prisma.exerciseLog.delete({ where: { id: lastLog.id } });
        return { reply: `${lastLog.exercise.canonicalName} removed.` };
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
        return { reply: 'No workout logs today.' };
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
      const lines = ['Today summary:', ...ranked.map((item) => `${item.muscle}: ${item.sets}`), `Total sets: ${totalSets}`];
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
        return { reply: 'No logs this week yet.' };
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
      const lines = ['Week summary:', ...ranked.map((item) => `${item.muscle}: ${item.sets}`), `Total sets: ${totalSets}`];
      return { reply: lines.join('\n') };
    }

    if (intent.type === 'progress') {
      const resolved = await resolveExercise(intent.exerciseAlias);
      if (!resolved.exercise) {
        if (resolved.suggestion) {
          return { reply: `I don't know "${intent.exerciseAlias}". Did you mean "${resolved.suggestion}"?` };
        }
        return { reply: `I don't know "${intent.exerciseAlias}".` };
      }

      const logs = await prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          exerciseId: resolved.exercise.id
        },
        orderBy: { loggedAt: 'desc' },
        take: 5
      });

      if (logs.length === 0) {
        return { reply: `No logs yet for ${resolved.exercise.canonicalName}.` };
      }

      const lines = [`Progress ${resolved.exercise.canonicalName}:`];
      for (const log of logs) {
        const reps = toRepsArray(log.reps);
        const bestReps = reps.length ? Math.max(...reps) : 0;
        const date = log.loggedAt.toISOString().slice(0, 10);
        lines.push(`${date}: ${log.weight}kg x ${bestReps}`);
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

      return { reply: `${intent.type} saved: ${intent.value}` };
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

      return { reply: `Pain saved: ${intent.note} ${intent.score}/10` };
    }

    if (intent.type === 'exercise_log') {
      const activeWorkout = await getActiveWorkout(user.id);
      if (!activeWorkout) {
        return { reply: 'No active workout. Send: start A' };
      }

      const resolved = await resolveExercise(intent.alias);
      if (!resolved.exercise) {
        if (resolved.suggestion) {
          return { reply: `I don't know "${intent.alias}". Did you mean "${resolved.suggestion}"?` };
        }
        return {
          reply:
            'Unknown exercise alias. Try: bench, incline bench, flys, lateral raises, shoulder press, pulldown, row, squat.'
        };
      }

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

      return {
        reply: `${resolved.exercise.canonicalName} saved: ${intent.weight}kg — ${intent.reps.length} sets (${intent.reps.join(',')}).`
      };
    }

    if (intent.type === 'invalid_energy') {
      return { reply: 'Energy must be 1-10. Example: energy 7' };
    }

    if (intent.type === 'invalid_metric') {
      return { reply: `Use: ${intent.metric} <number>. Example: ${intent.metric} ${intent.metric === 'sleep' ? '6.5' : '92.4'}` };
    }

    if (intent.type === 'invalid_pain') {
      return { reply: 'Use: pain <note> <score>/10. Example: pain right shoulder 3/10' };
    }

    if (intent.type === 'invalid_exercise_log') {
      return { reply: 'Use: <exercise> <weight> <reps>. Example: bench 28 10,10,8' };
    }

    return {
      reply: 'Could not parse message. Example: bench 28 10,10,8'
    };
  });
}
