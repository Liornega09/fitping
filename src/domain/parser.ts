import { normalizeText } from './catalog.js';
import { detectLanguage, translateHebrewToCanonical, type Language } from './i18n.js';

type IntentBody =
  | { type: 'start'; name: string }
  | { type: 'done' }
  | { type: 'undo' }
  | { type: 'summary_today' }
  | { type: 'summary_week' }
  | { type: 'progress'; exerciseAlias: string }
  | { type: 'weight'; value: number }
  | { type: 'sleep'; value: number }
  | { type: 'energy'; value: number }
  | { type: 'pain'; note: string; score: number }
  | { type: 'exercise_log'; alias: string; weight: number; reps: number[] }
  | { type: 'invalid_energy' }
  | { type: 'invalid_metric'; metric: 'weight' | 'sleep' }
  | { type: 'invalid_pain' }
  | { type: 'invalid_exercise_log' }
  | { type: 'help' }
  | { type: 'suggest' }
  | { type: 'volume'; muscle: string }
  | { type: 'unknown' };

export type Intent = IntentBody & { language: Language };

const numberRegex = /^\d+(\.\d+)?$/;
const repsRegex = /^\d+(,\d+)*$/;

export function parseIntent(inputRaw: string): Intent {
  const language = detectLanguage(inputRaw);
  const preprocessed =
    language === 'he' ? translateHebrewToCanonical(inputRaw) : inputRaw;

  const input = normalizeText(preprocessed)
    .replace(/[.!?]+$/g, '')
    .replace(/,\s+/g, ',');

  const body = parseEnglish(input);
  return { ...body, language } as Intent;
}

function parseEnglish(input: string): IntentBody {
  const startMatch = input.match(/^start\s+(.{1,20})$/);
  if (startMatch) {
    return { type: 'start', name: startMatch[1] };
  }

  if (input === 'done') {
    return { type: 'done' };
  }

  if (input === 'help' || input === 'עזרה') {
    return { type: 'help' };
  }

  if (input === 'suggest' || input === 'suggestion' || input === 'recommend') {
    return { type: 'suggest' };
  }

  const volumeMatch = input.match(/^volume\s+(.+)$/);
  if (volumeMatch) {
    return { type: 'volume', muscle: volumeMatch[1] };
  }

  if (input === 'undo') {
    return { type: 'undo' };
  }

  if (/^(summary|summery|sumary)(\s+today)?$/.test(input) || input === 'today') {
    return { type: 'summary_today' };
  }

  if (/^(summary|summery|sumary)\s+week$/.test(input) || input === 'week') {
    return { type: 'summary_week' };
  }

  const progressMatch = input.match(/^progress\s+(.+)$/);
  if (progressMatch) {
    return { type: 'progress', exerciseAlias: progressMatch[1] };
  }

  const weightMatch = input.match(/^weight\s+(\d+(\.\d+)?)$/);
  if (weightMatch) {
    return { type: 'weight', value: Number(weightMatch[1]) };
  }

  if (input.startsWith('weight ')) {
    return { type: 'invalid_metric', metric: 'weight' };
  }

  const sleepMatch = input.match(/^sleep\s+(\d+(\.\d+)?)$/);
  if (sleepMatch) {
    return { type: 'sleep', value: Number(sleepMatch[1]) };
  }

  if (input.startsWith('sleep ')) {
    return { type: 'invalid_metric', metric: 'sleep' };
  }

  const energyMatch = input.match(/^energy\s+(\d{1,2})$/);
  if (energyMatch) {
    const value = Number(energyMatch[1]);
    if (value >= 1 && value <= 10) {
      return { type: 'energy', value };
    }
    return { type: 'invalid_energy' };
  }

  if (input.startsWith('energy ')) {
    return { type: 'invalid_energy' };
  }

  const painMatch = input.match(/^pain\s+(.+)\s+(\d{1,2})\/10$/);
  if (painMatch) {
    const score = Number(painMatch[2]);
    if (score >= 0 && score <= 10) {
      return { type: 'pain', note: painMatch[1], score };
    }
    return { type: 'invalid_pain' };
  }

  if (input.startsWith('pain ')) {
    return { type: 'invalid_pain' };
  }

  const parts = input.split(' ');
  if (parts.length >= 3) {
    const repsToken = parts[parts.length - 1];
    const weightToken = parts[parts.length - 2];
    const alias = parts.slice(0, parts.length - 2).join(' ');

    if (repsRegex.test(repsToken) && numberRegex.test(weightToken) && alias.length > 0) {
      const reps = repsToken.split(',').map(Number);
      if (reps.every((value) => value > 0)) {
        return {
          type: 'exercise_log',
          alias,
          weight: Number(weightToken),
          reps
        };
      }
    }

    const maybeHasWeight = numberRegex.test(weightToken);
    if (maybeHasWeight || repsToken.includes(',')) {
      return { type: 'invalid_exercise_log' };
    }
  }

  return { type: 'unknown' };
}
