import { suggestNextTarget } from './overload.js';

export type CatalogExercise = {
  canonicalName: string;
  primaryMuscle: string;
};

export type RecentLogEntry = {
  canonicalName: string;
  primaryMuscle: string;
  workoutDate: Date;
  bestSet: { weight: number; reps: number };
};

export type SuggestInput = {
  catalog: ReadonlyArray<CatalogExercise>;
  recentLogs: ReadonlyArray<RecentLogEntry>;
  now: Date;
  lookbackDays?: number;
  maxExercises?: number;
};

export type SuggestedExercise = {
  canonicalName: string;
  lastWeight?: number;
  lastReps?: number;
  nextWeight?: number;
  nextReps?: number;
  rationale?: string;
};

export type Suggestion = {
  muscle: string;
  reason: 'never_trained' | 'last_trained_days_ago' | 'fallback';
  daysSince?: number;
  exercises: SuggestedExercise[];
};

const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MAX_EXERCISES = 4;
const MIN_REST_DAYS = 1; // don't suggest a muscle trained today

function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function suggestWorkout(input: SuggestInput): Suggestion | null {
  const lookback = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const max = input.maxExercises ?? DEFAULT_MAX_EXERCISES;
  const now = input.now;

  // All muscles available in catalog
  const muscles = Array.from(new Set(input.catalog.map((e) => e.primaryMuscle)));
  if (muscles.length === 0) return null;

  // Most recent training date per muscle (within lookback)
  const lastTrainedByMuscle = new Map<string, Date>();
  for (const log of input.recentLogs) {
    const days = daysBetween(now, log.workoutDate);
    if (days < 0 || days > lookback) continue;
    const prev = lastTrainedByMuscle.get(log.primaryMuscle);
    if (!prev || log.workoutDate > prev) {
      lastTrainedByMuscle.set(log.primaryMuscle, log.workoutDate);
    }
  }

  // Pick muscle: never-trained beats any trained muscle. Among trained, oldest wins.
  // Exclude muscles trained within MIN_REST_DAYS.
  const eligible = muscles.filter((m) => {
    const last = lastTrainedByMuscle.get(m);
    if (!last) return true;
    return daysBetween(now, last) >= MIN_REST_DAYS;
  });

  if (eligible.length === 0) return null;

  const neverTrained = eligible.filter((m) => !lastTrainedByMuscle.has(m));
  let chosenMuscle: string;
  let reason: Suggestion['reason'];
  let daysSince: number | undefined;

  if (neverTrained.length > 0) {
    chosenMuscle = neverTrained[0];
    reason = 'never_trained';
  } else {
    // Pick muscle with max daysSince
    let best: { muscle: string; days: number } | null = null;
    for (const m of eligible) {
      const last = lastTrainedByMuscle.get(m);
      if (!last) continue;
      const d = daysBetween(now, last);
      if (!best || d > best.days) best = { muscle: m, days: d };
    }
    if (!best) return null;
    chosenMuscle = best.muscle;
    reason = 'last_trained_days_ago';
    daysSince = best.days;
  }

  // Build exercises for chosen muscle
  const muscleExercises = input.catalog.filter((e) => e.primaryMuscle === chosenMuscle);

  // Most recent log per canonical exercise
  const lastByExercise = new Map<string, RecentLogEntry>();
  for (const log of input.recentLogs) {
    if (log.primaryMuscle !== chosenMuscle) continue;
    const prev = lastByExercise.get(log.canonicalName);
    if (!prev || log.workoutDate > prev.workoutDate) {
      lastByExercise.set(log.canonicalName, log);
    }
  }

  const exercises: SuggestedExercise[] = muscleExercises.slice(0, max).map((ex) => {
    const last = lastByExercise.get(ex.canonicalName);
    if (!last) {
      return { canonicalName: ex.canonicalName };
    }
    const next = suggestNextTarget({ weight: last.bestSet.weight, reps: [last.bestSet.reps] });
    return {
      canonicalName: ex.canonicalName,
      lastWeight: last.bestSet.weight,
      lastReps: last.bestSet.reps,
      nextWeight: next?.weight,
      nextReps: next?.reps,
      rationale: next?.rationale,
    };
  });

  return { muscle: chosenMuscle, reason, daysSince, exercises };
}

export function formatSuggestion(s: Suggestion, language: 'en' | 'he'): string {
  if (language === 'he') {
    const header =
      s.reason === 'never_trained'
        ? `אימון מוצע — ${s.muscle} (טרם אומן)`
        : `אימון מוצע — ${s.muscle} (אומן לפני ${s.daysSince} ימים)`;
    const lines = [header, ''];
    s.exercises.forEach((ex, i) => {
      if (ex.lastWeight != null && ex.lastReps != null && ex.nextWeight != null && ex.nextReps != null) {
        lines.push(`${i + 1}. ${ex.canonicalName} — אחרון ${ex.lastWeight}ק"ג x ${ex.lastReps}. נסה ${ex.nextWeight}ק"ג x ${ex.nextReps}.`);
      } else if (ex.lastWeight != null && ex.lastReps != null) {
        lines.push(`${i + 1}. ${ex.canonicalName} — אחרון ${ex.lastWeight}ק"ג x ${ex.lastReps}.`);
      } else {
        lines.push(`${i + 1}. ${ex.canonicalName} — תרגיל חדש.`);
      }
    });
    lines.push('', `כתוב "התחל ${s.muscle}" כדי להתחיל.`);
    return lines.join('\n');
  }
  const header =
    s.reason === 'never_trained'
      ? `Suggested workout — ${s.muscle} (never trained)`
      : `Suggested workout — ${s.muscle} (last trained ${s.daysSince} days ago)`;
  const lines = [header, ''];
  s.exercises.forEach((ex, i) => {
    if (ex.lastWeight != null && ex.lastReps != null && ex.nextWeight != null && ex.nextReps != null) {
      lines.push(`${i + 1}. ${ex.canonicalName} — last ${ex.lastWeight}kg x ${ex.lastReps}. Try ${ex.nextWeight}kg x ${ex.nextReps}.`);
    } else if (ex.lastWeight != null && ex.lastReps != null) {
      lines.push(`${i + 1}. ${ex.canonicalName} — last ${ex.lastWeight}kg x ${ex.lastReps}.`);
    } else {
      lines.push(`${i + 1}. ${ex.canonicalName} — new exercise.`);
    }
  });
  lines.push('', `Reply "start ${s.muscle}" to begin.`);
  return lines.join('\n');
}
