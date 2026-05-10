import { describe, expect, it } from 'vitest';
import {
  WEIGHT_STEP_KG,
  formatSuggestion,
  suggestNextTarget
} from '../src/domain/overload.js';

describe('suggestNextTarget', () => {
  it('returns null on empty rep list', () => {
    expect(suggestNextTarget({ weight: 60, reps: [] })).toBeNull();
  });

  it('returns null when weight is non-positive', () => {
    expect(suggestNextTarget({ weight: 0, reps: [5, 5] })).toBeNull();
  });

  it('strength range (top set <= 5): adds load, keeps reps', () => {
    const out = suggestNextTarget({ weight: 100, reps: [5, 5, 4] });
    expect(out).toEqual({
      weight: 100 + WEIGHT_STEP_KG,
      reps: 5,
      rationale: 'add-load'
    });
  });

  it('hypertrophy range (mid reps): same load, +1 rep on top set', () => {
    const out = suggestNextTarget({ weight: 60, reps: [8, 7, 7] });
    expect(out).toEqual({ weight: 60, reps: 9, rationale: 'add-rep' });
  });

  it('endurance range (every set >= 10): adds load, drops target to 8', () => {
    const out = suggestNextTarget({ weight: 40, reps: [12, 11, 10] });
    expect(out).toEqual({
      weight: 40 + WEIGHT_STEP_KG,
      reps: 8,
      rationale: 'drop-reps-add-load'
    });
  });

  it('mixed reps where min < 10 stays in hypertrophy range', () => {
    const out = suggestNextTarget({ weight: 50, reps: [12, 9] });
    expect(out).toEqual({ weight: 50, reps: 13, rationale: 'add-rep' });
  });
});

describe('formatSuggestion', () => {
  it('formats integer weights without a trailing .0', () => {
    expect(
      formatSuggestion({ weight: 60, reps: 8, rationale: 'add-rep' })
    ).toBe('Next: 60kg x 8.');
  });

  it('formats fractional weights with one decimal', () => {
    expect(
      formatSuggestion({ weight: 62.5, reps: 5, rationale: 'add-load' })
    ).toBe('Next: 62.5kg x 5.');
  });
});
