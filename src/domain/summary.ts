import { bestE1RMAcrossLogs, bestE1RMForLog, roundKg } from './pr.js';

export type SummaryLog = {
  weight: number;
  reps: number[];
  setsCount: number;
  exercise: { canonicalName: string; primaryMuscle: string };
  workoutId: string;
  loggedAt: Date;
};

export type SummaryHistoricalLog = {
  exerciseId: string;
  weight: number;
  reps: number[];
};

export type WeeklySummaryInput = {
  weekLogs: SummaryLog[];
  /** All logs strictly BEFORE the week, used to detect new weekly PRs. */
  historicalLogs: SummaryHistoricalLog[];
  /** Map of exerciseId -> info; only canonicalName is needed for messaging. */
  exerciseLookup: Map<string, { canonicalName: string }>;
  /** Logs of the current week, with exerciseId, used for PR detection. */
  weekLogsByExerciseId: Map<string, SummaryHistoricalLog[]>;
};

const NO_ACTIVITY = 'No workouts logged last week. Send "start A" to begin.';

/**
 * Pure function that turns a week of activity into a short WhatsApp-friendly
 * summary string. Empty input yields a gentle nudge instead of an empty body.
 */
export function buildWeeklySummary(input: WeeklySummaryInput): string {
  const { weekLogs, historicalLogs, exerciseLookup, weekLogsByExerciseId } = input;

  if (weekLogs.length === 0) {
    return NO_ACTIVITY;
  }

  const workoutIds = new Set<string>();
  const setsByMuscle: Record<string, number> = {};
  let totalSets = 0;

  for (const log of weekLogs) {
    workoutIds.add(log.workoutId);
    setsByMuscle[log.exercise.primaryMuscle] =
      (setsByMuscle[log.exercise.primaryMuscle] ?? 0) + log.setsCount;
    totalSets += log.setsCount;
  }

  // Per-exercise PR detection: compare the best e1RM achieved THIS week
  // against the best e1RM ever achieved BEFORE this week.
  const historicalByExercise = new Map<string, SummaryHistoricalLog[]>();
  for (const log of historicalLogs) {
    const list = historicalByExercise.get(log.exerciseId) ?? [];
    list.push(log);
    historicalByExercise.set(log.exerciseId, list);
  }

  type WeeklyPR = {
    canonicalName: string;
    weeklyBest: number;
    priorBest: number;
    /** Source set that produced the weekly best (for nicer formatting). */
    sourceWeight: number;
    sourceReps: number;
  };

  const prs: WeeklyPR[] = [];
  for (const [exerciseId, weekLogsForEx] of weekLogsByExerciseId) {
    const exerciseInfo = exerciseLookup.get(exerciseId);
    if (!exerciseInfo) continue;

    const priorBest = bestE1RMAcrossLogs(historicalByExercise.get(exerciseId) ?? []);

    let weeklyBest = 0;
    let sourceWeight = 0;
    let sourceReps = 0;
    for (const log of weekLogsForEx) {
      const candidate = bestE1RMForLog(log.weight, log.reps);
      if (candidate > weeklyBest) {
        weeklyBest = candidate;
        sourceWeight = log.weight;
        // The reps value that drove the best e1RM = the max in the log.
        sourceReps = log.reps.length ? Math.max(...log.reps) : 0;
      }
    }

    if (weeklyBest > priorBest && weeklyBest > 0) {
      prs.push({
        canonicalName: exerciseInfo.canonicalName,
        weeklyBest,
        priorBest,
        sourceWeight,
        sourceReps
      });
    }
  }

  prs.sort((a, b) => b.weeklyBest - a.weeklyBest);

  const muscleLines = Object.entries(setsByMuscle)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, sets]) => `${muscle}: ${sets}`);

  const lines: string[] = [
    `Last week: ${workoutIds.size} workout${workoutIds.size === 1 ? '' : 's'}, ${totalSets} sets.`,
    ...muscleLines
  ];

  if (prs.length > 0) {
    const top = prs[0];
    lines.push(
      `New PR: ${top.canonicalName} ${top.sourceWeight}kg x ${top.sourceReps} (e1RM ${roundKg(top.weeklyBest)}kg)`
    );
    if (prs.length > 1) {
      lines.push(`(+${prs.length - 1} more PR${prs.length - 1 === 1 ? '' : 's'})`);
    }
  }

  return lines.join('\n');
}

/**
 * Returns the Monday 00:00:00.000 UTC of the week that contains `now`,
 * shifted back by `weeksBack` whole weeks. With weeksBack=1 this gives the
 * start of the previous week — which is what we summarize.
 */
export function weekStartUTC(now: Date, weeksBack = 0): Date {
  const utc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  // getUTCDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const day = utc.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday - weeksBack * 7);
  return utc;
}

/**
 * End-exclusive: weekEndUTC(weekStart) === weekStart + 7 days.
 */
export function weekEndUTC(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}
