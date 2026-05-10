import { describe, expect, it } from 'vitest';
import {
  bestE1RMAcrossLogs,
  bestE1RMForLog,
  estimate1RM,
  roundKg
} from '../src/domain/pr.js';

describe('estimate1RM (Epley)', () => {
  it('returns weight when reps = 1 (since 1 + 1/30 ≈ 1.033)', () => {
    expect(estimate1RM(100, 1)).toBeCloseTo(103.333, 2);
  });

  it('matches the textbook example: 100kg x 10 -> ~133.3kg', () => {
    expect(estimate1RM(100, 10)).toBeCloseTo(133.333, 2);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(estimate1RM(0, 10)).toBe(0);
    expect(estimate1RM(50, 0)).toBe(0);
    expect(estimate1RM(-50, 5)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(estimate1RM(Number.NaN, 5)).toBe(0);
    expect(estimate1RM(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('bestE1RMForLog', () => {
  it('picks the highest-rep set when weight is fixed', () => {
    expect(bestE1RMForLog(50, [8, 10, 9])).toBeCloseTo(estimate1RM(50, 10));
  });

  it('returns 0 for an empty reps array', () => {
    expect(bestE1RMForLog(50, [])).toBe(0);
  });
});

describe('bestE1RMAcrossLogs', () => {
  it('finds the best e1RM across heterogeneous logs', () => {
    const logs = [
      { weight: 50, reps: [10, 10] }, // e1RM ≈ 66.7
      { weight: 60, reps: [5] },      // e1RM = 70
      { weight: 55, reps: [8, 8] }    // e1RM ≈ 69.7
    ];
    expect(bestE1RMAcrossLogs(logs)).toBeCloseTo(70);
  });

  it('returns 0 for an empty list', () => {
    expect(bestE1RMAcrossLogs([])).toBe(0);
  });
});

describe('roundKg', () => {
  it('rounds to one decimal', () => {
    expect(roundKg(32.444)).toBe(32.4);
    expect(roundKg(32.45)).toBe(32.5);
    expect(roundKg(32)).toBe(32);
  });
});
