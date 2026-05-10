import { describe, expect, it } from 'vitest';
import {
  buildWeeklySummary,
  weekEndUTC,
  weekStartUTC,
  type SummaryHistoricalLog,
  type SummaryLog
} from '../src/domain/summary.js';

const exerciseLookup = (entries: Array<[string, string]>) =>
  new Map(entries.map(([id, name]) => [id, { canonicalName: name }]));

const log = (
  overrides: Partial<SummaryLog> & { exerciseId?: string }
): SummaryLog & { exerciseId: string } => {
  const exerciseId = overrides.exerciseId ?? 'ex1';
  return {
    weight: 50,
    reps: [10, 10],
    setsCount: 2,
    workoutId: 'w1',
    loggedAt: new Date('2026-05-04T10:00:00Z'),
    exercise: { canonicalName: 'bench press', primaryMuscle: 'chest' },
    ...overrides,
    exerciseId
  } as SummaryLog & { exerciseId: string };
};

const groupByExercise = (
  logs: Array<SummaryLog & { exerciseId: string }>
): Map<string, SummaryHistoricalLog[]> => {
  const map = new Map<string, SummaryHistoricalLog[]>();
  for (const l of logs) {
    const list = map.get(l.exerciseId) ?? [];
    list.push({ exerciseId: l.exerciseId, weight: l.weight, reps: l.reps });
    map.set(l.exerciseId, list);
  }
  return map;
};

describe('buildWeeklySummary', () => {
  it('returns a friendly nudge when there were no logs', () => {
    const out = buildWeeklySummary({
      weekLogs: [],
      historicalLogs: [],
      exerciseLookup: new Map(),
      weekLogsByExerciseId: new Map()
    });
    expect(out).toMatch(/no workouts logged/i);
  });

  it('summarizes workouts, total sets, and per-muscle breakdown sorted desc', () => {
    const week = [
      log({ exerciseId: 'ex1', workoutId: 'wA', setsCount: 3 }),
      log({
        exerciseId: 'ex2',
        workoutId: 'wB',
        setsCount: 4,
        exercise: { canonicalName: 'squat', primaryMuscle: 'quads' }
      }),
      log({ exerciseId: 'ex1', workoutId: 'wB', setsCount: 2 })
    ];
    const out = buildWeeklySummary({
      weekLogs: week,
      historicalLogs: [],
      exerciseLookup: exerciseLookup([
        ['ex1', 'bench press'],
        ['ex2', 'squat']
      ]),
      weekLogsByExerciseId: groupByExercise(week)
    });

    expect(out).toMatch(/last week: 2 workouts, 9 sets/i);
    // quads (4) sorts before chest (5)? Actually chest = 3+2 = 5, quads = 4.
    expect(out.indexOf('chest: 5')).toBeLessThan(out.indexOf('quads: 4'));
  });

  it('singularizes "workout" when count is 1', () => {
    const week = [log({ workoutId: 'wA', setsCount: 1 })];
    const out = buildWeeklySummary({
      weekLogs: week,
      historicalLogs: [],
      exerciseLookup: exerciseLookup([['ex1', 'bench press']]),
      weekLogsByExerciseId: groupByExercise(week)
    });
    expect(out).toMatch(/1 workout, 1 sets/);
  });

  it('detects a new PR when this week beats the prior best', () => {
    const week = [log({ exerciseId: 'ex1', weight: 60, reps: [5, 5] })]; // e1RM = 70
    const historical: SummaryHistoricalLog[] = [
      { exerciseId: 'ex1', weight: 50, reps: [10] } // e1RM ≈ 66.7
    ];
    const out = buildWeeklySummary({
      weekLogs: week,
      historicalLogs: historical,
      exerciseLookup: exerciseLookup([['ex1', 'bench press']]),
      weekLogsByExerciseId: groupByExercise(week)
    });
    expect(out).toMatch(/new pr: bench press 60kg x 5 \(e1rm 70kg\)/i);
  });

  it('does not announce a PR when the week is weaker than history', () => {
    const week = [log({ exerciseId: 'ex1', weight: 40, reps: [8] })]; // e1RM ≈ 50.7
    const historical: SummaryHistoricalLog[] = [
      { exerciseId: 'ex1', weight: 60, reps: [5] } // e1RM = 70
    ];
    const out = buildWeeklySummary({
      weekLogs: week,
      historicalLogs: historical,
      exerciseLookup: exerciseLookup([['ex1', 'bench press']]),
      weekLogsByExerciseId: groupByExercise(week)
    });
    expect(out).not.toMatch(/PR/i);
  });

  it('mentions extra PRs when more than one exercise improved', () => {
    const week = [
      log({ exerciseId: 'ex1', weight: 60, reps: [5] }),
      log({ exerciseId: 'ex2', weight: 80, reps: [5], exercise: { canonicalName: 'squat', primaryMuscle: 'quads' } })
    ];
    const out = buildWeeklySummary({
      weekLogs: week,
      historicalLogs: [],
      exerciseLookup: exerciseLookup([
        ['ex1', 'bench press'],
        ['ex2', 'squat']
      ]),
      weekLogsByExerciseId: groupByExercise(week)
    });
    // Heavier exercise (squat e1RM ≈ 93.3) becomes the headline; bench is "+1 more".
    expect(out).toMatch(/new pr: squat/i);
    expect(out).toMatch(/\(\+1 more PR\)/);
  });
});

describe('weekStartUTC / weekEndUTC', () => {
  it('Monday returns itself at 00:00 UTC', () => {
    const monday = new Date('2026-05-04T13:45:00Z'); // Monday afternoon
    const start = weekStartUTC(monday, 0);
    expect(start.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });

  it('Sunday rolls back 6 days to the previous Monday', () => {
    const sunday = new Date('2026-05-10T01:00:00Z'); // Sunday
    const start = weekStartUTC(sunday, 0);
    expect(start.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });

  it('weeksBack=1 returns the previous Monday relative to today', () => {
    const today = new Date('2026-05-11T12:00:00Z'); // Monday
    const start = weekStartUTC(today, 1);
    expect(start.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });

  it('weekEndUTC is exactly 7 days after weekStart', () => {
    const start = new Date('2026-05-04T00:00:00.000Z');
    const end = weekEndUTC(start);
    expect(end.toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });
});
