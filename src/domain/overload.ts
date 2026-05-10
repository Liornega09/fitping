/**
 * Progressive overload heuristics.
 *
 * Pure functions: given the set the user just logged, suggest a sensible
 * next target. The rules are intentionally simple and conservative — we are
 * optimizing for nudging users toward steady progression, not for replacing
 * a coach.
 *
 * Step size: +2.5kg. This is the smallest meaningful jump on most barbells
 * (a pair of 1.25kg plates) and a tolerable jump on common dumbbells.
 */

export const WEIGHT_STEP_KG = 2.5;

export type LoggedSet = {
  weight: number;
  reps: number[];
};

export type OverloadSuggestion = {
  weight: number;
  reps: number;
  /** Short human label describing the rule that fired. */
  rationale: 'add-load' | 'add-rep' | 'drop-reps-add-load';
};

/**
 * Decide a target for the next session of this exercise based on the most
 * recent set. Returns `null` when there is nothing meaningful to suggest
 * (e.g. an empty rep list).
 *
 * Heuristic:
 *  - Top set <= 5 reps    → strength range. Add load, keep reps.
 *  - Min set >= 10 reps   → endurance range. Add load, drop target to ~8.
 *  - Otherwise            → hypertrophy range. Same load, add a rep.
 */
export function suggestNextTarget(latest: LoggedSet): OverloadSuggestion | null {
  if (!latest.reps || latest.reps.length === 0) {
    return null;
  }
  if (latest.weight <= 0) {
    return null;
  }

  const best = Math.max(...latest.reps);
  const min = Math.min(...latest.reps);

  if (best <= 5) {
    return {
      weight: latest.weight + WEIGHT_STEP_KG,
      reps: best,
      rationale: 'add-load'
    };
  }

  if (min >= 10) {
    return {
      weight: latest.weight + WEIGHT_STEP_KG,
      reps: 8,
      rationale: 'drop-reps-add-load'
    };
  }

  return {
    weight: latest.weight,
    reps: best + 1,
    rationale: 'add-rep'
  };
}

/** Format a suggestion as a single user-facing line. */
export function formatSuggestion(s: OverloadSuggestion): string {
  // 2.5 → "2.5", 60 → "60" (no trailing .0).
  const w = Number.isInteger(s.weight) ? String(s.weight) : s.weight.toFixed(1);
  return `Next: ${w}kg x ${s.reps}.`;
}
