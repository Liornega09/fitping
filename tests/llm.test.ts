import { describe, expect, it, vi } from 'vitest';
import { OpenAIIntentClassifier, __test } from '../src/lib/llm.js';

const { coerceToIntent } = __test;

const okResponse = (content: string) =>
  ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] })
  }) as unknown as Response;

describe('coerceToIntent', () => {
  it('accepts a valid exercise_log shape', () => {
    const out = coerceToIntent(
      { type: 'exercise_log', alias: 'BENCH', weight: 60, reps: [5, 5] },
      'en'
    );
    expect(out).toEqual({
      type: 'exercise_log',
      alias: 'bench',
      weight: 60,
      reps: [5, 5],
      language: 'en'
    });
  });

  it('rejects exercise_log with non-positive weight', () => {
    expect(
      coerceToIntent({ type: 'exercise_log', alias: 'bench', weight: 0, reps: [5] }, 'en')
    ).toBeNull();
  });

  it('rejects exercise_log with empty reps', () => {
    expect(
      coerceToIntent({ type: 'exercise_log', alias: 'bench', weight: 60, reps: [] }, 'en')
    ).toBeNull();
  });

  it('rejects energy outside 1-10', () => {
    expect(coerceToIntent({ type: 'energy', value: 0 }, 'en')).toBeNull();
    expect(coerceToIntent({ type: 'energy', value: 11 }, 'en')).toBeNull();
  });

  it('accepts simple control intents and tags language', () => {
    expect(coerceToIntent({ type: 'done' }, 'he')).toEqual({ type: 'done', language: 'he' });
  });

  it('rejects unknown shapes', () => {
    expect(coerceToIntent({ type: 'launch_rocket' }, 'en')).toBeNull();
    expect(coerceToIntent(null, 'en')).toBeNull();
    expect(coerceToIntent('hello', 'en')).toBeNull();
  });
});

describe('OpenAIIntentClassifier.classify', () => {
  it('returns a coerced Intent on a successful response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      okResponse(
        JSON.stringify({ type: 'exercise_log', alias: 'bench', weight: 60, reps: [5, 5] })
      )
    );
    const c = new OpenAIIntentClassifier('sk-test', 'gpt-4o-mini', fakeFetch as unknown as typeof fetch);

    const out = await c.classify('I just hit bench 60 for 5 5', 'en');
    expect(out).toMatchObject({ type: 'exercise_log', alias: 'bench', weight: 60, reps: [5, 5] });

    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.model).toBe('gpt-4o-mini');
    expect(sentBody.response_format).toEqual({ type: 'json_object' });
    expect(sentBody.messages[1].content).toBe('I just hit bench 60 for 5 5');
  });

  it('returns null when the API responds non-OK', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    const c = new OpenAIIntentClassifier('sk-test', 'gpt-4o-mini', fakeFetch as unknown as typeof fetch);
    expect(await c.classify('whatever', 'en')).toBeNull();
  });

  it('returns null when content is not valid JSON', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(okResponse('not json at all'));
    const c = new OpenAIIntentClassifier('sk-test', 'gpt-4o-mini', fakeFetch as unknown as typeof fetch);
    expect(await c.classify('whatever', 'en')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const c = new OpenAIIntentClassifier('sk-test', 'gpt-4o-mini', fakeFetch as unknown as typeof fetch);
    expect(await c.classify('whatever', 'en')).toBeNull();
  });

  it('returns null when the model emits a structurally invalid intent', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      okResponse(JSON.stringify({ type: 'exercise_log', alias: 'bench' /* missing weight/reps */ }))
    );
    const c = new OpenAIIntentClassifier('sk-test', 'gpt-4o-mini', fakeFetch as unknown as typeof fetch);
    expect(await c.classify('whatever', 'en')).toBeNull();
  });
});
