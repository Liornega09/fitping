import { describe, it, expect } from 'vitest';
import { computeGoalProgress, formatGoalProgress, formatGoalAchieved } from '../src/domain/goals.js';

const BENCH_GOAL = {
  exerciseName: 'bench press',
  targetWeight: 100,
  targetReps: 5,
  achievedAt: null,
  createdAt: new Date('2026-01-01'),
};

// e1RM for 100kg x 5 = 100 * (1 + 5/30) = 116.67
const TARGET_E1RM = 100 * (1 + 5 / 30);

describe('computeGoalProgress', () => {
  it('returns 0% when bestE1RM is 0', () => {
    const p = computeGoalProgress(BENCH_GOAL, 0);
    expect(p.progressPct).toBe(0);
    expect(p.achieved).toBe(false);
  });

  it('returns ~50% when halfway to goal', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM / 2);
    expect(p.progressPct).toBe(50);
    expect(p.achieved).toBe(false);
  });

  it('returns 100% and achieved=true when at exactly target e1RM', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM);
    expect(p.progressPct).toBe(100);
    expect(p.achieved).toBe(true);
  });

  it('returns >100% when beyond target', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM * 1.1);
    expect(p.progressPct).toBeGreaterThan(100);
    expect(p.achieved).toBe(true);
  });
});

describe('formatGoalProgress', () => {
  it('shows percentage in English when not achieved', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM * 0.8);
    const text = formatGoalProgress(p, 'en');
    expect(text).toMatch(/bench press/);
    expect(text).toMatch(/100kg x 5/);
    expect(text).toMatch(/%/);
  });

  it('shows "achieved" in English', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM);
    expect(formatGoalProgress(p, 'en')).toMatch(/achieved/i);
  });

  it('shows Hebrew percentage when not achieved', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM * 0.5);
    expect(formatGoalProgress(p, 'he')).toMatch(/יעד/);
  });

  it('shows Hebrew achieved text', () => {
    const p = computeGoalProgress(BENCH_GOAL, TARGET_E1RM);
    expect(formatGoalProgress(p, 'he')).toMatch(/הושג/);
  });
});

describe('formatGoalAchieved', () => {
  it('English celebration', () => {
    expect(formatGoalAchieved('bench press', 100, 5, 'en')).toMatch(/goal achieved/i);
  });

  it('Hebrew celebration', () => {
    expect(formatGoalAchieved('bench press', 100, 5, 'he')).toMatch(/יעד הושג/);
  });
});
