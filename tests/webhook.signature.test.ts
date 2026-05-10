import { afterEach, beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

// Set the auth token BEFORE importing app/config so that config.ts picks it up.
const AUTH_TOKEN = 'integration_test_token';
const ORIGINAL_TOKEN = process.env.TWILIO_AUTH_TOKEN;
process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;

// Minimal in-memory prisma mock — only the user upsert is needed because
// the request never reaches the handler when the signature is invalid,
// and when it is valid we send a parseable command.
vi.mock('../src/lib/prisma.js', () => {
  const userStore = new Map<string, { id: string; whatsappNumber: string }>();
  let counter = 0;
  return {
    prisma: {
      user: {
        upsert: async ({ where, create }: any) => {
          const existing = userStore.get(where.whatsappNumber);
          if (existing) return existing;
          const created = { id: `u_${++counter}`, whatsappNumber: create.whatsappNumber };
          userStore.set(create.whatsappNumber, created);
          return created;
        }
      },
      workout: {
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 'w1', startedAt: Date.now(), ...data })
      },
      exercise: { findMany: async () => [] },
      exerciseLog: { findMany: async () => [], findFirst: async () => null },
      bodyMetric: { findFirst: async () => null }
    }
  };
});

const { buildApp } = await import('../src/app.js');
const { computeTwilioSignature } = await import('../src/lib/twilioSignature.js');

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.TWILIO_AUTH_TOKEN;
  } else {
    process.env.TWILIO_AUTH_TOKEN = ORIGINAL_TOKEN;
  }
});

const FROM = 'whatsapp:+972500000001';
const PATH = '/webhooks/whatsapp?format=json';

function formEncode(params: Record<string, string>) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

describe('whatsapp webhook signature verification', () => {
  it('rejects requests without a signature header (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: PATH,
      payload: `From=${encodeURIComponent(FROM)}&Body=${encodeURIComponent('start A')}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects requests with an invalid signature (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: PATH,
      payload: `From=${encodeURIComponent(FROM)}&Body=${encodeURIComponent('start A')}`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='
      }
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts requests with a valid signature', async () => {
    const params = { From: FROM, Body: 'start A' };
    // light-my-request defaults host to 'localhost:80' and protocol to 'http'.
    const url = `http://localhost:80${PATH}`;
    const signature = computeTwilioSignature(AUTH_TOKEN, url, params);

    const res = await app.inject({
      method: 'POST',
      url: PATH,
      payload: formEncode(params),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': signature
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { reply: string };
    expect(body.reply).toMatch(/started workout a/i);
  });
});
