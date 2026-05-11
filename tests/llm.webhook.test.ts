import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMIntentClassifier } from '../src/lib/llm.js';
import type { Intent } from '../src/domain/parser.js';

// ---- mock prisma (mirrors tests/webhook.test.ts shape) ----
const userStore = new Map<string, { id: string; whatsappNumber: string }>();
const workoutStore: any[] = [];
const exerciseLogStore: any[] = [];
const bodyMetricStore: any[] = [];

const exercises = [
  {
    id: 'ex1',
    canonicalName: 'bench press',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    aliases: ['bench'],
    isActive: true
  }
];

let idCounter = 0;
const newId = () => `id_${++idCounter}`;

vi.mock('../src/lib/prisma.js', () => ({
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
        if (orderBy?.startedAt === 'desc') list = list.sort((a, b) => b.startedAt - a.startedAt);
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
    exercise: { findMany: async () => exercises },
    exerciseLog: {
      findFirst: async () => null,
      findMany: async ({ where }: any) => {
        return exerciseLogStore.filter((l) => {
          if (where?.userId && l.userId !== where.userId) return false;
          if (where?.workoutId && l.workoutId !== where.workoutId) return false;
          if (where?.exerciseId && l.exerciseId !== where.exerciseId) return false;
          return true;
        });
      },
      create: async ({ data }: any) => {
        const log = { id: newId(), loggedAt: Date.now(), ...data };
        exerciseLogStore.push(log);
        return log;
      },
      delete: async () => ({})
    },
    bodyMetric: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const m = { id: newId(), loggedAt: Date.now(), ...data };
        bodyMetricStore.push(m);
        return m;
      },
      delete: async () => ({})
    },
    processedMessage: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: newId(), processedAt: Date.now(), ...data })
    },
    goal: {
      findUnique: async () => null,
      findMany: async () => [],
      upsert: async ({ create }: any) => ({ id: newId(), achievedAt: null, createdAt: new Date(), ...create }),
      update: async ({ data }: any) => data
    }
  }
}));

const { buildApp } = await import('../src/app.js');

const FROM = 'whatsapp:+972500000001';

const send = async (
  app: Awaited<ReturnType<typeof buildApp>>,
  body: string
) => {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp?format=json',
    payload: `From=${encodeURIComponent(FROM)}&Body=${encodeURIComponent(body)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).reply as string;
};

beforeEach(() => {
  userStore.clear();
  workoutStore.length = 0;
  exerciseLogStore.length = 0;
  bodyMetricStore.length = 0;
  idCounter = 0;
});

describe('whatsapp webhook LLM fallback', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app.close();
  });

  it('does not call the LLM when the regex parser already understood the message', async () => {
    const classify = vi.fn();
    const fakeLLM: LLMIntentClassifier = { classify };
    app = await buildApp({ whatsapp: { llmClassifier: fakeLLM } });

    await send(app, 'start A');                  // parser handles it
    await send(app, 'bench 50 8,8,8');           // parser handles it
    expect(classify).not.toHaveBeenCalled();
  });

  it('falls back to the LLM when the parser returns "unknown" and uses the resulting intent', async () => {
    await (async () => {
      const passthrough: LLMIntentClassifier = { classify: vi.fn() };
      const startApp = await buildApp({ whatsapp: { llmClassifier: passthrough } });
      await send(startApp, 'start A');
      await startApp.close();
    })();

    const classify = vi.fn(async (_msg: string, language: 'en' | 'he'): Promise<Intent> => ({
      type: 'exercise_log',
      alias: 'bench',
      weight: 60,
      reps: [5, 5],
      language
    }));
    app = await buildApp({ whatsapp: { llmClassifier: { classify } } });

    const reply = await send(
      app,
      'I just hit bench for two heavy fives at sixty kilos'
    );
    expect(classify).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/bench press saved: 60kg/);
    expect(reply).toMatch(/5,5/);
  });

  it('keeps the regex error reply when the LLM also returns unknown', async () => {
    const classify = vi.fn(async (_msg, language) => ({ type: 'unknown', language } as Intent));
    app = await buildApp({ whatsapp: { llmClassifier: { classify } } });

    const reply = await send(app, 'who won the world cup');
    expect(classify).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/could not parse/i);
  });

  it('keeps the regex error reply when the LLM returns null (network/parse failure)', async () => {
    const classify = vi.fn(async () => null);
    app = await buildApp({ whatsapp: { llmClassifier: { classify } } });

    const reply = await send(app, 'who won the world cup');
    expect(classify).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/could not parse/i);
  });

  it('does not call the LLM for invalid_* intents (well-formed shape, bad arguments)', async () => {
    const classify = vi.fn();
    app = await buildApp({ whatsapp: { llmClassifier: { classify } } });

    const reply = await send(app, 'energy 99');
    expect(reply).toMatch(/energy must be 1-10/i);
    expect(classify).not.toHaveBeenCalled();
  });

  it('LLM fallback respects detected language (Hebrew → Hebrew reply)', async () => {
    const classify = vi.fn(async (_msg, language) => ({
      type: 'unknown' as const,
      language
    }));
    app = await buildApp({ whatsapp: { llmClassifier: { classify } } });

    const reply = await send(app, 'בלה בלה משהו לא הגיוני');
    expect(classify).toHaveBeenCalledWith(expect.any(String), 'he');
    expect(reply).toMatch(/לא הצלחתי להבין/);
  });
});
