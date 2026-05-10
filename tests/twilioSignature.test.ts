import { describe, expect, it } from 'vitest';
import {
  computeTwilioSignature,
  validateTwilioSignature
} from '../src/lib/twilioSignature.js';

const AUTH_TOKEN = 'test_auth_token_123';
const URL = 'https://example.com/webhooks/whatsapp';

describe('twilio signature', () => {
  it('computes a stable HMAC-SHA1 base64 signature', () => {
    const params = {
      From: 'whatsapp:+972500000001',
      To: 'whatsapp:+14155238886',
      Body: 'start A'
    };

    const sig = computeTwilioSignature(AUTH_TOKEN, URL, params);

    // base64(HMAC-SHA1(...)) is always 28 chars
    expect(sig).toHaveLength(28);
    // Same inputs => same output
    expect(computeTwilioSignature(AUTH_TOKEN, URL, params)).toBe(sig);
  });

  it('produces the same signature regardless of param insertion order', () => {
    const a = computeTwilioSignature(AUTH_TOKEN, URL, {
      From: 'whatsapp:+972500000001',
      Body: 'start A',
      To: 'whatsapp:+14155238886'
    });
    const b = computeTwilioSignature(AUTH_TOKEN, URL, {
      To: 'whatsapp:+14155238886',
      From: 'whatsapp:+972500000001',
      Body: 'start A'
    });
    expect(a).toBe(b);
  });

  it('changes when any param value changes', () => {
    const base = computeTwilioSignature(AUTH_TOKEN, URL, { Body: 'start A' });
    const tampered = computeTwilioSignature(AUTH_TOKEN, URL, { Body: 'start B' });
    expect(base).not.toBe(tampered);
  });

  it('changes when the URL changes', () => {
    const params = { Body: 'start A' };
    const a = computeTwilioSignature(AUTH_TOKEN, URL, params);
    const b = computeTwilioSignature(
      AUTH_TOKEN,
      'https://attacker.com/webhooks/whatsapp',
      params
    );
    expect(a).not.toBe(b);
  });

  it('validateTwilioSignature accepts a correct signature', () => {
    const params = { From: 'whatsapp:+972500000001', Body: 'done' };
    const sig = computeTwilioSignature(AUTH_TOKEN, URL, params);
    expect(validateTwilioSignature(AUTH_TOKEN, sig, URL, params)).toBe(true);
  });

  it('validateTwilioSignature rejects a tampered signature', () => {
    const params = { Body: 'done' };
    const sig = computeTwilioSignature(AUTH_TOKEN, URL, params);
    const tampered = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(validateTwilioSignature(AUTH_TOKEN, tampered, URL, params)).toBe(false);
  });

  it('validateTwilioSignature rejects a missing signature', () => {
    expect(validateTwilioSignature(AUTH_TOKEN, undefined, URL, { Body: 'x' })).toBe(false);
  });

  it('validateTwilioSignature rejects a signature of wrong length', () => {
    expect(validateTwilioSignature(AUTH_TOKEN, 'short', URL, { Body: 'x' })).toBe(false);
  });
});
