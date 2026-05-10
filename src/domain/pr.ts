/**
 * Personal record (PR) detection helpers.
 *
 * We use Epley's estimated 1-rep max (e1RM) as the canonical PR metric since
 * it normalizes across different rep schemes:
 *
 *   e1RM = weight * (1 + reps / 30)
 *
 * Reference: Epley, B. (1985). Poundage Chart. Boyd Epley Workout.
 */

export type Set = { weight: number; reps: number };

/**
 * Estimate one-rep max for a single set. Returns 0 for non-positive inputs.
 */
export function estimate1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0;
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/**
 * Best e1RM across an array of sets that share the same weight (one log entry
 * in the FitPing model).
 */
export function bestE1RMForLog(weight: number, repsList: number[]): number {
  let best = 0;
  for (const reps of repsList) {
    const value = estimate1RM(weight, reps);
    if (value > best) best = value;
  }
  return best;
}

/**
 * Best e1RM across many historical logs (each with weight + reps array).
 */
export function bestE1RMAcrossLogs(
  logs: Array<{ weight: number; reps: number[] }>
): number {
  let best = 0;
  for (const log of logs) {
    const value = bestE1RMForLog(log.weight, log.reps);
    if (value > best) best = value;
  }
  return best;
}

/**
 * Round to one decimal for human-friendly display ("32.4kg").
 */
export function roundKg(value: number): number {
  return Math.round(value * 10) / 10;
}
