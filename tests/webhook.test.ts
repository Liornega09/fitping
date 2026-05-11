import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { clearRateLimiter } from '../src/routes/whatsapp.js';

const userStore = new Map<string, { id: string; whatsappNumber: string }>();
const workoutStore: any[] = [];
const exerciseLogStore: any[] = [];
const bodyMetricStore: any[] = [];
const processedMessageStore = new Map<string, { id: string; messageSid: string; fromNumber: string; replyText: string; processedAt: number }>();
const exercises = [
  {
    id: 'ex1',
    canonicalName: 'bench press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    aliases: ['bench'],
    isActive: true
  },
  {
    id: 'ex2',
    canonicalName: 'squat',
    primaryMuscle: 'quads',
    secondaryMuscles: [],
    aliases: ['squat'],
    isActive: true
  }
];

let idCounter = 0;
const newId = () => `id_${++idCounter}`;

vi.mock('../src/lib/prisma.js', () => {
  return {
    prisma: {
      user: {
        upsert: async ({ where, create }: any) => {
          const existing = userStore.get(where.whatsappNumber);
          if (existing) return existing;
          const created = { id: newId(), whatsappNumber: create.whatsappNumber };
          userStore.set(create.whatsappNumber, created);
          return created;
        }
      },
      workout: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = workoutStore.filter((w) => w.userId === where.userId);
          if (where.status) list = list.filter((w) => w.status === where.status);
          if (orderBy?.startedAt === 'desc') {
            list = list.sort((a, b) => b.startedAt - a.startedAt);
          }
          return list[0] ?? null;
        },
        create: async ({ data }: any) => {
          const w = { id: newId(), startedAt: Date.now(), finishedAt: null, ...data };
          workoutStore.push(w);
          return w;
        },
        update: async ({ where, data }: any) => {
          const w = workoutStore.find((w) => w.id === where.id);
          Object.assign(w, data);
          return w;
        }
      },
      exercise: {
        findMany: async () => exercises
      },
      exerciseLog: {
        findFirst: async ({ where, orderBy, include }: any) => {
          let list = exerciseLogStore.filter((l) => l.userId === where.userId);
          if (orderBy?.loggedAt === 'desc') list.sort((a, b) => b.loggedAt - a.loggedAt);
          const log = list[0];
          if (!log) return null;
          if (include?.exercise) return { ...log, exercise: exercises.find((e) => e.id === log.exerciseId) };
          return log;
        },
        findMany: async ({ where, include }: any) => {
          let list = exerciseLogStore.filter((l) => {
            if (where.userId && l.userId !== where.userId) return false;
            if (where.workoutId && l.workoutId !== where.workoutId) return false;
            if (where.exerciseId && l.exerciseId !== where.exerciseId) return false;
            if (where.loggedAt?.gte && l.loggedAt < where.loggedAt.gte.getTime()) return false;
            if (where.loggedAt?.lte && l.loggedAt > where.loggedAt.lte.getTime()) return false;
            return true;
          });
          if (include?.exercise) {
            list = list.map((l) => ({ ...l, exercise: exercises.find((e) => e.id === l.exerciseId) }));
          }
          return list;
        },
        create: async ({ data }: any) => {
          const log = { id: newId(), loggedAt: Date.now(), ...data };
          exerciseLogStore.push(log);
          return log;
        },
        delete: async ({ where }: any) => {
          const i = exerciseLogStore.findIndex((l) => l.id === where.id);
          if (i >= 0) exerciseLogStore.splice(i, 1);
          return {};
        }
      },
      bodyMetric: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = bodyMetricStore.filter((m) => m.userId === where.userId);
          if (orderBy?.loggedAt === 'desc') list.sort((a, b) => b.loggedAt - a.loggedAt);
          return list[0] ?? null;
        },
        create: async ({ data }: any) => {
          const m = { id: newId(), loggedAt: Date.now(), ...data };
          bodyMetricStore.push(m);
          return m;
        },
        delete: async ({ where }: any) => {
          const i = bodyMetricStore.findIndex((m) => m.id === where.id);
          if (i >= 0) bodyMetricStore.splice(i, 1);
          return {};
        }
      },
      processedMessage: {
        findUnique: async ({ where }: any) => processedMessageStore.get(where.messageSid) ?? null,
        create: async ({ data }: any) => {
          if (processedMessageStore.has(data.messageSid)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'mock'
            });
          }
          const record = { id: newId(), processedAt: Date.now(), ...data };
          processedMessageStore.set(data.messageSid, record);
          return record;
        }
      },
      goal: {
        findUnique: async () => null,
        findMany: async () => [],
        upsert: async ({ create }: any) => ({ id: newId(), achievedAt: null, createdAt: new Date(), ...create }),
        update: async ({ data }: any) => data
      }
    }
  };
});

import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;
const FROM = 'whatsapp:+972500000001';

async function send(body: string, from: string = FROM) {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp?format=json',
    payload: `From=${encodeURIComponent(from)}&Body=${encodeURIComponent(body)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).reply as string;
}

beforeEach(async () => {
  userStore.clear();
  workoutStore.length = 0;
  exerciseLogStore.length = 0;
  bodyMetricStore.length = 0;
  processedMessageStore.clear();
  idCounter = 0;
  clearRateLimiter();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('whatsapp webhook flow', () => {
  it('full happy path: start, log, done, summary', async () => {
    expect(await send('start A')).toMatch(/started workout a/i);
    expect(await send('bench 28 10,10,8')).toMatch(/bench press saved/i);
    const doneReply = await send('done');
    expect(doneReply).toMatch(/workout a saved/i);
    expect(doneReply).toMatch(/chest: 3 sets/i);
    expect(doneReply).toMatch(/total: 3 sets/i);
    expect(doneReply).toMatch(/top lift: bench press/i);

    const summary = await send('summary today');
    expect(summary).toMatch(/today summary/i);
    expect(summary).toMatch(/chest: 3/i);
  });

  it('rejects logging without active workout', async () => {
    expect(await send('bench 28 10')).toMatch(/no active workout/i);
  });

  it('done with no logs', async () => {
    await send('start A');
    expect(await send('done')).toMatch(/no exercises logged/i);
  });

  it('unknown alias suggests/refuses gracefully', async () => {
    await send('start A');
    expect(await send('squatzilla 60 5')).toMatch(/unknown exercise|don't know/i);
  });

  it('weight metric saves and undo removes it', async () => {
    expect(await send('weight 92.4')).toMatch(/weight saved: 92.4/i);
    expect(await send('undo')).toMatch(/weight removed/i);
  });

  it('pain metric', async () => {
    expect(await send('pain right shoulder 3/10')).toMatch(/pain saved: right shoulder 3\/10/i);
  });

  it('progress for exercise with no logs', async () => {
    expect(await send('progress bench')).toMatch(/no logs yet for bench press/i);
  });

  it('invalid energy', async () => {
    expect(await send('energy 99')).toMatch(/energy must be 1-10/i);
  });

  it('unknown command', async () => {
    expect(await send('hello there')).toMatch(/could not parse/i);
  });
});

async function sendWithSid(body: string, messageSid: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp?format=json',
    payload: `From=${encodeURIComponent(FROM)}&Body=${encodeURIComponent(body)}&MessageSid=${encodeURIComponent(messageSid)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).reply as string;
}

describe('whatsapp webhook idempotency (MessageSid)', () => {
  it('returns the cached reply on duplicate MessageSid without re-processing', async () => {
    const sid = 'SM_test_duplicate_001';

    const first = await sendWithSid('start A', sid);
    expect(first).toMatch(/started workout a/i);
    expect(workoutStore).toHaveLength(1);

    // Same MessageSid → must NOT create a second workout, must return same reply.
    const second = await sendWithSid('start A', sid);
    expect(second).toBe(first);
    expect(workoutStore).toHaveLength(1);
  });

  it('different MessageSid for the same body is processed independently', async () => {
    await sendWithSid('start A', 'SM_first');
    // Second start with different sid → real handler runs and replies "already active".
    const reply = await sendWithSid('start B', 'SM_second');
    expect(reply).toMatch(/already active/i);
    // Both messages are recorded as processed.
    expect(processedMessageStore.size).toBe(2);
  });

  it('messages without MessageSid skip the idempotency cache', async () => {
    const a = await send('start A');
    expect(a).toMatch(/started workout a/i);
    expect(processedMessageStore.size).toBe(0);

    // Same body again — no sid means no caching, so handler runs and reports active.
    const b = await send('start A');
    expect(b).toMatch(/already active/i);
    expect(processedMessageStore.size).toBe(0);
  });
});

describe('whatsapp webhook PR detection', () => {
  it('does not announce a PR on the first-ever log of an exercise', async () => {
    await send('start A');
    const reply = await send('bench 50 8,8,8');
    expect(reply).toMatch(/bench press saved/i);
    expect(reply).not.toMatch(/1RM/i);
  });

  it('announces a new estimated 1RM when the user beats their best', async () => {
    await send('start A');
    await send('bench 50 8,8,8'); // e1RM ≈ 63.3
    const reply = await send('bench 60 5,5'); // e1RM = 70 → PR
    expect(reply).toMatch(/bench press saved/i);
    expect(reply).toMatch(/new 1rm est: 70kg \(was 63\.3kg\)/i);
  });

  it('does NOT announce when the new entry is weaker than history', async () => {
    await send('start A');
    await send('bench 60 5,5'); // e1RM = 70
    const reply = await send('bench 50 8,8'); // e1RM ≈ 63.3 → no PR
    expect(reply).toMatch(/bench press saved/i);
    expect(reply).not.toMatch(/1RM/i);
  });

  it('PRs are tracked per exercise (heavy bench does not block first squat)', async () => {
    await send('start A');
    await send('bench 100 5');
    const squat = await send('squat 60 5');
    // First squat ever → no PR line, even though bench is heavy.
    expect(squat).not.toMatch(/1RM/i);
  });
});

describe('whatsapp webhook progressive overload', () => {
  it('does not nudge on the first-ever log of an exercise', async () => {
    await send('start A');
    const reply = await send('bench 50 8,8,8');
    expect(reply).not.toMatch(/next:/i);
  });

  it('suggests +1 rep at the same weight in the hypertrophy range', async () => {
    await send('start A');
    await send('bench 50 8,8,8');           // baseline
    const reply = await send('bench 50 8,7,7'); // top set 8 → suggest 9
    expect(reply).toMatch(/next: 50kg x 9\./i);
  });

  it('adds load and drops reps to 8 when every set hit double digits', async () => {
    await send('start A');
    await send('bench 40 12');              // baseline
    const reply = await send('bench 40 12,11,10'); // min >= 10 → +2.5kg, 8 reps
    expect(reply).toMatch(/next: 42\.5kg x 8\./i);
  });

  it('adds load and keeps reps in the strength range', async () => {
    await send('start A');
    await send('bench 100 5');              // baseline
    const reply = await send('bench 100 5,5,4'); // top set 5 → +2.5kg, 5 reps
    expect(reply).toMatch(/next: 102\.5kg x 5\./i);
  });
});

describe('whatsapp webhook Hebrew', () => {
  it('replies in Hebrew when the user sends Hebrew', async () => {
    expect(await send('התחל A')).toMatch(/התחלתי אימון/);
  });

  it('parses a Hebrew exercise log and replies in Hebrew', async () => {
    await send('התחל A');
    const reply = await send('בנץ 50 8,8,8');
    expect(reply).toMatch(/bench press נשמר/);
    expect(reply).toMatch(/8,8,8/);
  });

  it('Hebrew "סיימתי" closes the workout', async () => {
    await send('התחל A');
    await send('בנץ 50 8');
    const reply = await send('סיימתי');
    expect(reply).toMatch(/אימון a נשמר/i);
    expect(reply).toMatch(/סה"כ/);
  });

  it('Hebrew unknown command falls back to a Hebrew error', async () => {
    expect(await send('שלום')).toMatch(/לא הצלחתי להבין/);
  });

  it('English messages still reply in English', async () => {
    expect(await send('start A')).toMatch(/started workout/i);
  });
});

describe('rate limiting', () => {
  it('allows up to 20 messages per minute', async () => {
    for (let i = 0; i < 20; i++) {
      const reply = await send('help');
      expect(reply).not.toMatch(/too many|wait a minute|יותר מדי/i);
    }
  });

  it('blocks the 21st message in the same window', async () => {
    for (let i = 0; i < 20; i++) {
      await send('help');
    }
    const reply = await send('help');
    expect(reply).toMatch(/too many|wait a minute/i);
  });

  it('replies in Hebrew when rate-limited from a Hebrew message', async () => {
    for (let i = 0; i < 20; i++) {
      await send('עזרה');
    }
    const reply = await send('עזרה');
    expect(reply).toMatch(/יותר מדי/i);
  });

  it('does not affect a different sender', async () => {
    for (let i = 0; i < 21; i++) {
      await send('help', 'whatsapp:+972500000001');
    }
    // Different number — should not be rate-limited
    const reply = await send('help', 'whatsapp:+972500000002');
    expect(reply).not.toMatch(/too many|wait a minute/i);
  });
});
