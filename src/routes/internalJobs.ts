import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  buildWeeklySummary,
  weekEndUTC,
  weekStartUTC,
  type SummaryHistoricalLog,
  type SummaryLog
} from '../domain/summary.js';
import { prisma } from '../lib/prisma.js';
import { twilioSenderFromEnv, type TwilioSender } from '../lib/twilioClient.js';

export type WeeklySummaryResult = {
  weekStart: string;
  weekEnd: string;
  processed: Array<{
    userId: string;
    whatsappNumber: string;
    status: 'sent' | 'skipped_already_sent' | 'skipped_no_sender' | 'failed';
    body?: string;
    error?: string;
  }>;
};

/**
 * Compute & deliver the previous-week summary for every user. Idempotent on
 * (userId, weekStart) thanks to the WeeklySummary unique constraint.
 */
export async function runWeeklySummaryJob(
  now: Date = new Date(),
  sender: TwilioSender | null = twilioSenderFromEnv()
): Promise<WeeklySummaryResult> {
  const weekStart = weekStartUTC(now, 1);
  const weekEnd = weekEndUTC(weekStart);

  const users = await prisma.user.findMany();
  const processed: WeeklySummaryResult['processed'] = [];

  for (const user of users) {
    const existing = await prisma.weeklySummary.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart } }
    });
    if (existing) {
      processed.push({
        userId: user.id,
        whatsappNumber: user.whatsappNumber,
        status: 'skipped_already_sent'
      });
      continue;
    }

    const [weekLogs, historicalLogs] = await Promise.all([
      prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: weekStart, lt: weekEnd }
        },
        include: { exercise: true }
      }),
      prisma.exerciseLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { lt: weekStart }
        }
      })
    ]);

    const exerciseLookup = new Map<string, { canonicalName: string }>();
    const weekLogsByExerciseId = new Map<string, SummaryHistoricalLog[]>();
    const summaryWeekLogs: SummaryLog[] = weekLogs.map((log) => {
      const reps = Array.isArray(log.reps)
        ? (log.reps as unknown[]).map((v) => Number(v)).filter(Number.isFinite)
        : [];
      exerciseLookup.set(log.exerciseId, { canonicalName: log.exercise.canonicalName });
      const list = weekLogsByExerciseId.get(log.exerciseId) ?? [];
      list.push({ exerciseId: log.exerciseId, weight: log.weight, reps });
      weekLogsByExerciseId.set(log.exerciseId, list);
      return {
        weight: log.weight,
        reps,
        setsCount: log.setsCount,
        exercise: {
          canonicalName: log.exercise.canonicalName,
          primaryMuscle: log.exercise.primaryMuscle
        },
        workoutId: log.workoutId,
        loggedAt: log.loggedAt
      };
    });

    const historical: SummaryHistoricalLog[] = historicalLogs.map((log) => ({
      exerciseId: log.exerciseId,
      weight: log.weight,
      reps: Array.isArray(log.reps)
        ? (log.reps as unknown[]).map((v) => Number(v)).filter(Number.isFinite)
        : []
    }));

    const body = buildWeeklySummary({
      weekLogs: summaryWeekLogs,
      historicalLogs: historical,
      exerciseLookup,
      weekLogsByExerciseId
    });

    if (!sender) {
      processed.push({
        userId: user.id,
        whatsappNumber: user.whatsappNumber,
        status: 'skipped_no_sender',
        body
      });
      continue;
    }

    try {
      await sender.sendWhatsAppMessage({ to: user.whatsappNumber, body });
      await prisma.weeklySummary.create({
        data: { userId: user.id, weekStart, body }
      });
      processed.push({
        userId: user.id,
        whatsappNumber: user.whatsappNumber,
        status: 'sent',
        body
      });
    } catch (err) {
      processed.push({
        userId: user.id,
        whatsappNumber: user.whatsappNumber,
        status: 'failed',
        body,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    processed
  };
}

export async function internalJobsRoute(app: FastifyInstance) {
  app.post(
    '/internal/jobs/weekly-summary',
    async (request: FastifyRequest, reply) => {
      const expected = process.env.INTERNAL_JOBS_TOKEN;
      if (!expected) {
        request.log.error('INTERNAL_JOBS_TOKEN is not configured');
        reply.code(503);
        return { error: 'Internal jobs are not enabled.' };
      }

      const headerValue = request.headers['authorization'];
      const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      if (provided !== `Bearer ${expected}`) {
        reply.code(401);
        return { error: 'Unauthorized.' };
      }

      const result = await runWeeklySummaryJob();
      return result;
    }
  );
}
