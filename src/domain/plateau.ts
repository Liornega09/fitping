import { estimate1RM } from './pr.js';

export type PlateauLogEntry = {
  weight: number;
  reps: number[];
  loggedAt: Date;
};

export type PlateauResult = {
  staleWeeks: number;
  bestE1RM: number;
  bestWeight: number;
  bestReps: number;
};

const DEFAULT_MIN_WEEKS = 3;

/**
 * Detects a strength plateau for a single exercise.
 *
 * Returns a PlateauResult when the best estimated 1RM has not improved across
 * `minWeeks` consecutive calendar weeks that all contain at least one log.
 * Returns null when there is not enough data or when progress is being made.
 */
export function detectPlateau(
  logs: PlateauLogEntry[],
  now: Date,
  minWeeks = DEFAULT_MIN_WEEKS
): PlateauResult | null {
  if (logs.length === 0) return null;

  // Build a map of weekIndex → best e1RM for that week.
  // weekIndex 0 = current week, 1 = last week, etc.
  const weekBests = new Map<number, { e1rm: number; weight: number; reps: number }>();

  for (const log of logs) {
    const msAgo = now.getTime() - log.loggedAt.getTime();
    if (msAgo < 0) continue; // future dates — skip
    const weekIndex = Math.floor(msAgo / (7 * 24 * 60 * 60 * 1000));

    for (const reps of log.reps) {
      const e1rm = estimate1RM(log.weight, reps);
      const prev = weekBests.get(weekIndex);
      if (!prev || e1rm > prev.e1rm) {
        weekBests.set(weekIndex, { e1rm, weight: log.weight, reps });
      }
    }
  }

  if (weekBests.size < minWeeks) return null;

  // Find the most recent `minWeeks` consecutive weeks that all have data.
  const sortedWeeks = Array.from(weekBests.keys()).sort((a, b) => a - b);

  // Try to find a consecutive run of minWeeks starting from the earliest
  // available week index.
  for (let start = 0; start <= sortedWeeks[sortedWeeks.length - 1] - (minWeeks - 1); start++) {
    const window: number[] = [];
    for (let w = start; w < start + minWeeks; w++) {
      if (weekBests.has(w)) window.push(w);
    }
    if (window.length < minWeeks) continue;

    // Check: is the best e1RM in the newest week ≤ best in the oldest week?
    const oldest = weekBests.get(window[window.length - 1])!;
    const newest = weekBests.get(window[0])!;

    if (newest.e1rm <= oldest.e1rm) {
      return {
        staleWeeks: minWeeks,
        bestE1RM: Math.round(newest.e1rm * 10) / 10,
        bestWeight: newest.weight,
        bestReps: newest.reps,
      };
    }
  }

  return null;
}

export function formatPlateauWarning(result: PlateauResult, language: 'en' | 'he'): string {
  if (language === 'he') {
    return `אזהרה: לא נרשמה התקדמות במשך ${result.staleWeeks} שבועות. שקול/י שבוע deload או שינוי בתכנית.`;
  }
  return `Plateau: no progress for ${result.staleWeeks} weeks. Consider a deload week or changing the stimulus.`;
}
