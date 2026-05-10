import { afterEach, beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

// --- env setup BEFORE app import ---
const ORIGINAL_TOKEN = process.env.INTERNAL_JOBS_TOKEN;
const TOKEN = 'jobs_token_for_tests';
process.env.INTERNAL_JOBS_TOKEN = TOKEN;
// Make sure the production sender is not used; we'll inject a mock by env-removal.
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_WHATSAPP_NUMBER;
const ORIGINAL_AUTH = process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_AUTH_TOKEN;

type ExerciseLogRow = {
  id: string;
  userId: string;
  workoutId: string;
  exerciseId: string;
  weight: number;
  reps: number[];
  setsCount: number;
  loggedAt: Date;
};

const userStore = [
  { id: 'u1', whatsappNumber: 'whatsapp:+972500000001' },
  { id: 'u2', whatsappNumber: 'whatsapp:+972500000002' }
];
const exerciseStore = [
  { id: 'ex1', canonicalName: 'bench press', primaryMuscle: 'chest' },
  { id: 'ex2', canonicalName: 'squat', primaryMuscle: 'quads' }
];
const exerciseLogStore: ExerciseLogRow[] = [];
const weeklySummaryStore: Array<{ id: string; userId: string; weekStart: Date; body: string; sentAt: Date }> = [];

vi.mock('../src/lib/prisma.js', () => {
  let counter = 0;
  const newId = () => `id_${++counter}`;
  return {
    prisma: {
      user: {
        findMany: async () => userStore.slice()
      },
      exerciseLog: {
        findMany: async ({ where, include }: any) => {
          let list = exerciseLogStore.filter((l) => l.userId === where.userId);
          if (where.loggedAt?.gte) list = list.filter((l) => l.loggedAt >= where.loggedAt.gte);
          if (where.loggedAt?.lt) list = list.filter((l) => l.loggedAt < where.loggedAt.lt);
          if (include?.exercise) {
            return list.map((l) => ({
              ...l,
              exercise: exerciseStore.find((e) => e.id === l.exerciseId)
            }));
          }
          return list;
        }
      },
      weeklySummary: {
        findUnique: async ({ where }: any) => {
          const key = where.userId_weekStart;
          return (
            weeklySummaryStore.find(
              (s) => s.userId === key.userId && s.weekStart.getTime() === key.weekStart.getTime()
            ) ?? null
          );
        },
        create: async ({ data }: any) => {
          const row = { id: newId(), sentAt: new Date(), ...data };
          weeklySummaryStore.push(row);
          return row;
        }
      }
    }
  };
});

const { buildApp } = await import('../src/app.js');
const { runWeeklySummaryJob } = await import('../src/routes/internalJobs.js');

let app: Awaited<ReturnType<typeof buildApp>>;
let sentMessages: Array<{ to: string; body: string }> = [];

const fakeSender = {
  sendWhatsAppMessage: async ({ to, body }: { to: string; body: string }) => {
    sentMessages.push({ to, body });
    return { sid: 'SM_fake_' + sentMessages.length };
  }
};

beforeEach(async () => {
  exerciseLogStore.length = 0;
  weeklySummaryStore.length = 0;
  sentMessages = [];
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.INTERNAL_JOBS_TOKEN;
  else process.env.INTERNAL_JOBS_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_AUTH !== undefined) process.env.TWILIO_AUTH_TOKEN = ORIGINAL_AUTH;
});

describe('POST /internal/jobs/weekly-summary auth', () => {
  it('rejects requests without a bearer token (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/jobs/weekly-summary' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with the wrong bearer token (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/jobs/weekly-summary',
      headers: { authorization: 'Bearer wrong' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts requests with the correct bearer token (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/jobs/weekly-summary',
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { processed: unknown[] };
    expect(Array.isArray(body.processed)).toBe(true);
  });
});

describe('runWeeklySummaryJob', () => {
  // Pick a Monday so weekStartUTC(now, 1) lands on the previous Monday.
  const now = new Date('2026-05-11T08:00:00Z'); // Monday
  // Previous week is 2026-05-04 .. 2026-05-11.
  const inWeek = new Date('2026-05-06T10:00:00Z');
  const beforeWeek = new Date('2026-04-20T10:00:00Z');

  it('skips users with no activity by sending the no-activity nudge', async () => {
    const result = await runWeeklySummaryJob(now, fakeSender);
    expect(result.processed).toHaveLength(2);
    expect(result.processed.every((p) => p.status === 'sent')).toBe(true);
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0].body).toMatch(/no workouts logged/i);
  });

  it('summarizes a user with activity and announces a PR', async () => {
    exerciseLogStore.push(
      // Historical: bench 50x10 (e1RM ≈ 66.7)
      {
        id: 'l0',
        userId: 'u1',
        workoutId: 'w0',
        exerciseId: 'ex1',
        weight: 50,
        reps: [10],
        setsCount: 1,
        loggedAt: beforeWeek
      },
      // This week: bench 60x5 (e1RM = 70 → PR)
      {
        id: 'l1',
        userId: 'u1',
        workoutId: 'w1',
        exerciseId: 'ex1',
        weight: 60,
        reps: [5, 5],
        setsCount: 2,
        loggedAt: inWeek
      }
    );

    const result = await runWeeklySummaryJob(now, fakeSender);
    const u1 = result.processed.find((p) => p.userId === 'u1');
    expect(u1?.status).toBe('sent');
    expect(u1?.body).toMatch(/last week: 1 workout, 2 sets/i);
    expect(u1?.body).toMatch(/chest: 2/);
    expect(u1?.body).toMatch(/new pr: bench press 60kg x 5/i);
  });

  it('is idempotent — second run for the same week sends nothing new', async () => {
    exerciseLogStore.push({
      id: 'l1',
      userId: 'u1',
      workoutId: 'w1',
      exerciseId: 'ex1',
      weight: 60,
      reps: [5, 5],
      setsCount: 2,
      loggedAt: inWeek
    });

    await runWeeklySummaryJob(now, fakeSender);
    expect(sentMessages).toHaveLength(2); // u1 + u2 (no activity)

    const second = await runWeeklySummaryJob(now, fakeSender);
    expect(second.processed.every((p) => p.status === 'skipped_already_sent')).toBe(true);
    expect(sentMessages).toHaveLength(2); // unchanged
  });

  it('reports skipped_no_sender when no sender is configured', async () => {
    const result = await runWeeklySummaryJob(now, null);
    expect(result.processed.every((p) => p.status === 'skipped_no_sender')).toBe(true);
    expect(weeklySummaryStore).toHaveLength(0);
  });
});
