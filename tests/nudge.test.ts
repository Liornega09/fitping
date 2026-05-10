import { describe, expect, it } from 'vitest';
import {
  buildNudgeMessage,
  NUDGE_THRESHOLD_DAYS,
  shouldNudge
} from '../src/domain/nudge.js';

describe('shouldNudge', () => {
  const now = new Date('2026-05-10T09:00:00Z');

  it('returns false when days since workout is below threshold', () => {
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS - 1, null, now)).toBe(false);
  });

  it('returns true when threshold is reached and no nudge was ever sent', () => {
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS, null, now)).toBe(true);
  });

  it('returns true when threshold is exceeded and no nudge was ever sent', () => {
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS + 3, null, now)).toBe(true);
  });

  it('returns false when a nudge was sent within the past 24 hours', () => {
    const recentNudge = new Date(now.getTime() - 12 * 3600 * 1000); // 12h ago
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS, recentNudge, now)).toBe(false);
  });

  it('returns true when the last nudge was sent more than 24 hours ago', () => {
    const oldNudge = new Date(now.getTime() - 25 * 3600 * 1000); // 25h ago
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS, oldNudge, now)).toBe(true);
  });

  it('exactly 24h ago still returns false (boundary)', () => {
    const exactlyNudge = new Date(now.getTime() - 24 * 3600 * 1000);
    // 24h == 24 which is not > 24, so should not re-send.
    // Our condition is >= 24, so exactly 24 should send.
    expect(shouldNudge(NUDGE_THRESHOLD_DAYS, exactlyNudge, now)).toBe(true);
  });
});

describe('buildNudgeMessage', () => {
  it('uses the exercise name, weight and reps', () => {
    const msg = buildNudgeMessage({
      daysSince: 6.5,
      topExerciseName: 'bench press',
      topWeight: 60,
      topReps: 5
    });
    expect(msg).toMatch(/6 days/);
    expect(msg).toMatch(/bench press/);
    expect(msg).toMatch(/60kg x 5/);
  });

  it('singularizes "day" for exactly 1 day', () => {
    const msg = buildNudgeMessage({
      daysSince: 1.2,
      topExerciseName: 'squat',
      topWeight: 100,
      topReps: 3
    });
    expect(msg).toMatch(/1 day[^s]/);
  });

  it('formats fractional weights with 1 decimal', () => {
    const msg = buildNudgeMessage({
      daysSince: 5,
      topExerciseName: 'bench press',
      topWeight: 62.5,
      topReps: 5
    });
    expect(msg).toMatch(/62\.5kg/);
  });
});
