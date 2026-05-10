import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userStore = new Map<string, { id: string; whatsappNumber: string }>();
const workoutStore: any[] = [];
const exerciseLogStore: any[] = [];
const bodyMetricStore: any[] = [];
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
      }
    }
  };
});

import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;
const FROM = 'whatsapp:+972500000001';

async function send(body: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp?format=json',
    payload: `From=${encodeURIComponent(FROM)}&Body=${encodeURIComponent(body)}`,
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
  idCounter = 0;
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
