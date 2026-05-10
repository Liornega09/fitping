import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_TOKEN = process.env.INTERNAL_JOBS_TOKEN;
const TOKEN = 'nudge_test_token';
process.env.INTERNAL_JOBS_TOKEN = TOKEN;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_WHATSAPP_NUMBER;
delete process.env.TWILIO_AUTH_TOKEN;

// ---- stores ----
type UserRow = {
  id: string;
  whatsappNumber: string;
  lastNudgeSentAt: Date | null;
};
type WorkoutRow = {
  id: string;
  userId: string;
  status: string;
  finishedAt: Date | null;
};
type LogRow = {
  id: string;
  userId: string;
  workoutId: string;
  exerciseId: string;
  weight: number;
  reps: number[];
  setsCount: number;
};

const userStore: UserRow[] = [];
const workoutStore: WorkoutRow[] = [];
const logStore: LogRow[] = [];

const exercises = [
  { id: 'ex1', canonicalName: 'bench press', primaryMuscle: 'chest' }
];

let counter = 0;
const newId = () => `id_${++counter}`;

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findMany: async () => userStore.slice(),
      update: async ({ where, data }: any) => {
        const u = userStore.find((u) => u.id === where.id)!;
        Object.assign(u, data);
        return u;
      }
    },
    workout: {
      findFirst: async ({ where, orderBy }: any) => {
        let list = workoutStore.filter((w) => {
          if (w.userId !== where.userId) return false;
          if (where.status && w.status !== where.status) return false;
          return true;
        });
        if (orderBy?.finishedAt === 'desc') {
          list = list.sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0));
        }
        return list[0] ?? null;
      }
    },
    exerciseLog: {
      findMany: async ({ where, include, orderBy }: any) => {
        let list = logStore.filter((l) => {
          if (where?.userId && l.userId !== where.userId) return false;
          if (where?.workoutId && l.workoutId !== where.workoutId) return false;
          return true;
        });
        if (orderBy?.weight === 'desc') list = list.sort((a, b) => b.weight - a.weight);
        if (include?.exercise) {
          return list.map((l) => ({
            ...l,
            exercise: exercises.find((e) => e.id === l.exerciseId)
          }));
        }
        return list;
      }
    },
    // needed for weekly-summary route registered on the same app
    weeklySummary: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: newId(), ...data })
    }
  }
}));

const { buildApp } = await import('../src/app.js');
const { runNudgeJob } = await import('../src/routes/internalJobs.js');

let app: Awaited<ReturnType<typeof buildApp>>;
let sentMessages: Array<{ to: string; body: string }> = [];
const fakeSender = {
  sendWhatsAppMessage: async ({ to, body }: { to: string; body: string }) => {
    sentMessages.push({ to, body });
    return { sid: 'SM_nudge_' + sentMessages.length };
  }
};

const now = new Date('2026-05-10T09:00:00Z');
// last workout was 6 days ago — over the 5-day threshold
const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
// last workout was 2 days ago — below threshold
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);

beforeEach(async () => {
  // Re-set the token before each test in case another test file cleared it.
  process.env.INTERNAL_JOBS_TOKEN = TOKEN;
  userStore.length = 0;
  workoutStore.length = 0;
  logStore.length = 0;
  sentMessages = [];
  counter = 0;
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('POST /internal/jobs/nudge auth', () => {
  it('rejects missing token (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/jobs/nudge' });
    expect(res.statusCode).toBe(401);
  });

  it('accepts correct token (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/jobs/nudge',
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { thresholdDays: number; processed: unknown[] };
    expect(body.thresholdDays).toBe(5);
    expect(Array.isArray(body.processed)).toBe(true);
  });
});

describe('runNudgeJob', () => {
  it('skips users with no completed workouts', async () => {
    userStore.push({ id: 'u1', whatsappNumber: 'whatsapp:+1', lastNudgeSentAt: null });
    const result = await runNudgeJob(now, fakeSender);
    expect(result.processed[0].status).toBe('skipped_no_workout');
    expect(sentMessages).toHaveLength(0);
  });

  it('skips users whose last workout is within the threshold', async () => {
    userStore.push({ id: 'u1', whatsappNumber: 'whatsapp:+1', lastNudgeSentAt: null });
    workoutStore.push({ id: 'w1', userId: 'u1', status: 'DONE', finishedAt: twoDaysAgo });
    const result = await runNudgeJob(now, fakeSender);
    expect(result.processed[0].status).toBe('skipped_recent');
    expect(sentMessages).toHaveLength(0);
  });

  it('sends a nudge when the user has been idle >= threshold days', async () => {
    userStore.push({ id: 'u1', whatsappNumber: 'whatsapp:+1', lastNudgeSentAt: null });
    workoutStore.push({ id: 'w1', userId: 'u1', status: 'DONE', finishedAt: sixDaysAgo });
    logStore.push({
      id: 'l1',
      userId: 'u1',
      workoutId: 'w1',
      exerciseId: 'ex1',
      weight: 60,
      reps: [5, 5],
      setsCount: 2
    });

    const result = await runNudgeJob(now, fakeSender);
    const u1 = result.processed.find((p) => p.userId === 'u1');
    expect(u1?.status).toBe('sent');
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].body).toMatch(/6 days/);
    expect(sentMessages[0].body).toMatch(/bench press 60kg x 5/);
    // lastNudgeSentAt should be updated
    expect(userStore[0].lastNudgeSentAt).toEqual(now);
  });

  it('skips_no_sender when sender is null', async () => {
    userStore.push({ id: 'u1', whatsappNumber: 'whatsapp:+1', lastNudgeSentAt: null });
    workoutStore.push({ id: 'w1', userId: 'u1', status: 'DONE', finishedAt: sixDaysAgo });
    const result = await runNudgeJob(now, null);
    expect(result.processed[0].status).toBe('skipped_no_sender');
    expect(sentMessages).toHaveLength(0);
  });

  it('is idempotent within 24 hours — does not send twice', async () => {
    const recentNudge = new Date(now.getTime() - 6 * 3600 * 1000); // 6h ago
    userStore.push({ id: 'u1', whatsappNumber: 'whatsapp:+1', lastNudgeSentAt: recentNudge });
    workoutStore.push({ id: 'w1', userId: 'u1', status: 'DONE', finishedAt: sixDaysAgo });

    const result = await runNudgeJob(now, fakeSender);
    expect(result.processed[0].status).toBe('skipped_recent');
    expect(sentMessages).toHaveLength(0);
  });
});

afterEach(() => {
  // restore env
  if (ORIGINAL_TOKEN === undefined) delete process.env.INTERNAL_JOBS_TOKEN;
  else process.env.INTERNAL_JOBS_TOKEN = ORIGINAL_TOKEN;
});
