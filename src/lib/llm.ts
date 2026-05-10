/**
 * LLM-backed intent classifier.
 *
 * Responsibility: turn a free-form message into a structured Intent that the
 * existing deterministic handlers in src/routes/whatsapp.ts already know
 * how to execute. We deliberately do NOT let the model author user-facing
 * replies — that keeps replies idempotent, language-aware, and consistent
 * with the regex parser, and avoids the model "hallucinating" workout data.
 *
 * Today this is a fallback (called only when parseIntent() returned
 * 'unknown'). The same classifier can be promoted to a primary path later
 * by calling it before parseIntent(); the contract — message in, Intent
 * out — does not change.
 */
import type { Language } from '../domain/i18n.js';
import type { Intent } from '../domain/parser.js';

export interface LLMIntentClassifier {
  /**
   * Returns a structured Intent for `message` or `null` when the model
   * could not produce a valid one (network error, parsing error, etc.).
   * Implementations MUST NOT throw — failure should degrade gracefully
   * to the existing "could not parse" reply.
   */
  classify(message: string, language: Language): Promise<Intent | null>;
}

const SYSTEM_PROMPT = `You convert short fitness chat messages into a strict JSON intent.

Return ONLY a JSON object matching one of these shapes (no prose, no markdown):

  { "type": "start", "name": "<short label>" }
  { "type": "done" }
  { "type": "undo" }
  { "type": "summary_today" }
  { "type": "summary_week" }
  { "type": "progress", "exerciseAlias": "<alias>" }
  { "type": "weight",   "value": <number> }
  { "type": "sleep",    "value": <number> }
  { "type": "energy",   "value": <int 1..10> }
  { "type": "pain",     "note": "<text>", "score": <int 0..10> }
  { "type": "exercise_log", "alias": "<alias>", "weight": <number>, "reps": [<int>, ...] }
  { "type": "unknown" }

Exercise aliases must be one of: bench, incline bench, flys, lateral raises,
shoulder press, pulldown, row, squat, curl, hammer curl, leg curl,
leg extension, pushdown.

If the user's message is in Hebrew, translate exercise names to the English
alias above (e.g. "בנץ"->"bench", "סקוואט"->"squat"). Numbers stay numeric.

If the message clearly does not describe a workout action, return
{ "type": "unknown" }.`;

type ChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const VALID_TYPES = new Set<Intent['type']>([
  'start',
  'done',
  'undo',
  'summary_today',
  'summary_week',
  'progress',
  'weight',
  'sleep',
  'energy',
  'pain',
  'exercise_log'
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate the JSON the model returned. Anything malformed becomes null so
 * the caller can fall back to its default "could not parse" path.
 */
function coerceToIntent(raw: unknown, language: Language): Intent | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string') return null;

  switch (type) {
    case 'done':
    case 'undo':
    case 'summary_today':
    case 'summary_week':
      return { type, language } as Intent;

    case 'start':
      if (typeof obj.name !== 'string' || obj.name.length === 0 || obj.name.length > 20) return null;
      return { type, name: obj.name.toLowerCase().trim(), language };

    case 'progress':
      if (typeof obj.exerciseAlias !== 'string' || obj.exerciseAlias.length === 0) return null;
      return { type, exerciseAlias: obj.exerciseAlias.toLowerCase().trim(), language };

    case 'weight':
    case 'sleep':
      if (!isFiniteNumber(obj.value) || obj.value <= 0) return null;
      return { type, value: obj.value, language };

    case 'energy': {
      const v = obj.value;
      if (!isFiniteNumber(v) || v < 1 || v > 10 || !Number.isInteger(v)) return null;
      return { type, value: v, language };
    }

    case 'pain': {
      const score = obj.score;
      if (typeof obj.note !== 'string' || obj.note.length === 0) return null;
      if (!isFiniteNumber(score) || score < 0 || score > 10) return null;
      return { type, note: obj.note, score, language };
    }

    case 'exercise_log': {
      if (typeof obj.alias !== 'string' || obj.alias.length === 0) return null;
      if (!isFiniteNumber(obj.weight) || obj.weight <= 0) return null;
      if (!Array.isArray(obj.reps) || obj.reps.length === 0) return null;
      const reps: number[] = [];
      for (const r of obj.reps) {
        if (!isFiniteNumber(r) || r <= 0 || !Number.isInteger(r)) return null;
        reps.push(r);
      }
      return { type, alias: obj.alias.toLowerCase().trim(), weight: obj.weight, reps, language };
    }

    case 'unknown':
      return { type: 'unknown', language };

    default:
      // Any other "type" the model might emit is rejected — we never want
      // to surface an unhandled intent to the route handler.
      if (!VALID_TYPES.has(type as Intent['type'])) return null;
      return null;
  }
}

export class OpenAIIntentClassifier implements LLMIntentClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gpt-4o-mini',
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async classify(message: string, language: Language): Promise<Intent | null> {
    try {
      const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message }
          ]
        })
      });

      if (!res.ok) return null;
      const data = (await res.json()) as ChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return null;
      }
      return coerceToIntent(parsed, language);
    } catch {
      return null;
    }
  }
}

/**
 * Build a classifier from environment. Returns null when no API key is
 * configured so callers can degrade gracefully without try/catch noise.
 */
export function llmClassifierFromEnv(): LLMIntentClassifier | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  return new OpenAIIntentClassifier(apiKey, model);
}

// Exposed for unit tests.
export const __test = { coerceToIntent };
