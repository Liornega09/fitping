import { describe, it, expect } from 'vitest';
import { suggestWorkout, formatSuggestion, type CatalogExercise, type RecentLogEntry } from '../src/domain/suggest.js';

const CATALOG: CatalogExercise[] = [
  { canonicalName: 'bench press', primaryMuscle: 'chest' },
  { canonicalName: 'dumbbell fly', primaryMuscle: 'chest' },
  { canonicalName: 'squat', primaryMuscle: 'quads' },
  { canonicalName: 'row', primaryMuscle: 'upper back' },
];

const NOW = new Date('2026-05-11T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe('suggestWorkout', () => {
  it('returns never_trained muscle when no logs exist', () => {
    const result = suggestWorkout({ catalog: CATALOG, recentLogs: [], now: NOW });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('never_trained');
  });

  it('picks the muscle trained longest ago', () => {
    const logs: RecentLogEntry[] = [
      { canonicalName: 'bench press', primaryMuscle: 'chest', workoutDate: daysAgo(2), bestSet: { weight: 80, reps: 5 } },
      { canonicalName: 'squat', primaryMuscle: 'quads', workoutDate: daysAgo(7), bestSet: { weight: 100, reps: 5 } },
      { canonicalName: 'row', primaryMuscle: 'upper back', workoutDate: daysAgo(3), bestSet: { weight: 70, reps: 8 } },
    ];
    const result = suggestWorkout({ catalog: CATALOG, recentLogs: logs, now: NOW });
    // upper back 3 days, never = never_trained wins, but quads was longest among trained (7 days)
    // However 'upper back' was logged but 'chest' is 2 days, 'quads' is 7 days, 'upper back' is 3 days
    // Never-trained: dumbbell fly's muscle 'chest' IS trained. row 'upper back' IS trained. squat 'quads' IS trained.
    // So never_trained muscle is... none of these muscles is never-trained. upper back == row muscle.
    // Wait: all 3 muscles appear in logs, but CATALOG has chest, quads, upper back —
    // all 3 are in logs so no never_trained. Should pick quads (7 days).
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('last_trained_days_ago');
    expect(result!.muscle).toBe('quads');
    expect(result!.daysSince).toBe(7);
  });

  it('excludes muscles trained today', () => {
    const logs: RecentLogEntry[] = [
      { canonicalName: 'bench press', primaryMuscle: 'chest', workoutDate: daysAgo(0), bestSet: { weight: 80, reps: 5 } },
      { canonicalName: 'squat', primaryMuscle: 'quads', workoutDate: daysAgo(3), bestSet: { weight: 100, reps: 5 } },
      { canonicalName: 'row', primaryMuscle: 'upper back', workoutDate: daysAgo(4), bestSet: { weight: 70, reps: 8 } },
    ];
    const result = suggestWorkout({ catalog: CATALOG, recentLogs: logs, now: NOW });
    expect(result).not.toBeNull();
    expect(result!.muscle).not.toBe('chest');
  });

  it('includes last weight/reps for chosen muscle exercises', () => {
    // All muscles have logs so no never_trained; chest (5d) is oldest
    const logs: RecentLogEntry[] = [
      { canonicalName: 'bench press', primaryMuscle: 'chest', workoutDate: daysAgo(5), bestSet: { weight: 80, reps: 5 } },
      { canonicalName: 'squat', primaryMuscle: 'quads', workoutDate: daysAgo(2), bestSet: { weight: 100, reps: 5 } },
      { canonicalName: 'row', primaryMuscle: 'upper back', workoutDate: daysAgo(3), bestSet: { weight: 70, reps: 8 } },
    ];
    const result = suggestWorkout({ catalog: CATALOG, recentLogs: logs, now: NOW });
    expect(result).not.toBeNull();
    expect(result!.muscle).toBe('chest');
    const bench = result!.exercises.find((e) => e.canonicalName === 'bench press');
    expect(bench?.lastWeight).toBe(80);
    expect(bench?.lastReps).toBe(5);
  });

  it('returns null when all muscles trained today', () => {
    const logs: RecentLogEntry[] = CATALOG.map((ex) => ({
      canonicalName: ex.canonicalName,
      primaryMuscle: ex.primaryMuscle,
      workoutDate: daysAgo(0),
      bestSet: { weight: 60, reps: 5 },
    }));
    const result = suggestWorkout({ catalog: CATALOG, recentLogs: logs, now: NOW });
    expect(result).toBeNull();
  });
});

describe('formatSuggestion', () => {
  it('formats never_trained in English', () => {
    const s = suggestWorkout({ catalog: CATALOG, recentLogs: [], now: NOW })!;
    const text = formatSuggestion(s, 'en');
    expect(text).toContain('never trained');
    expect(text).toContain('new exercise');
  });

  it('formats last_trained_days_ago in Hebrew with next target', () => {
    const logs: RecentLogEntry[] = [
      { canonicalName: 'bench press', primaryMuscle: 'chest', workoutDate: daysAgo(5), bestSet: { weight: 80, reps: 5 } },
      { canonicalName: 'squat', primaryMuscle: 'quads', workoutDate: daysAgo(2), bestSet: { weight: 100, reps: 8 } },
      { canonicalName: 'row', primaryMuscle: 'upper back', workoutDate: daysAgo(3), bestSet: { weight: 70, reps: 8 } },
    ];
    const s = suggestWorkout({ catalog: CATALOG, recentLogs: logs, now: NOW })!;
    const text = formatSuggestion(s, 'he');
    expect(text).toContain('אימון מוצע');
    expect(text).toContain('התחל');
  });
});
