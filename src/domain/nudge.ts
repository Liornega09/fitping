/**
 * Proactive nudge builder.
 *
 * Pure helper: given the last workout's data, produce a WhatsApp message
 * that reminds the user to train. No DB access, no side effects.
 */

export const NUDGE_THRESHOLD_DAYS = 5;

export type LastWorkoutSummary = {
  /** Days since the last completed workout (fractional days, >=0). */
  daysSince: number;
  /** Display name of the exercise with the heaviest weight in the last session. */
  topExerciseName: string;
  topWeight: number;
  topReps: number;
};

/**
 * Returns true when the user has been idle long enough to receive a nudge.
 */
export function shouldNudge(
  daysSinceWorkout: number,
  lastNudgeSentAt: Date | null,
  now: Date = new Date()
): boolean {
  if (daysSinceWorkout < NUDGE_THRESHOLD_DAYS) return false;

  if (lastNudgeSentAt === null) return true;

  // Never send more than once per day (even if the cron fires multiple times).
  const hoursSinceLastNudge =
    (now.getTime() - lastNudgeSentAt.getTime()) / 1000 / 3600;
  return hoursSinceLastNudge >= 24;
}

/**
 * Compose the nudge message (English only for now; i18n can be wired in
 * later the same way the webhook replies are, via the Language tag on User).
 */
export function buildNudgeMessage(last: LastWorkoutSummary): string {
  const days = Math.floor(last.daysSince);
  const dayWord = days === 1 ? 'day' : 'days';
  const w = Number.isInteger(last.topWeight)
    ? String(last.topWeight)
    : last.topWeight.toFixed(1);
  return `Hey, you haven't trained in ${days} ${dayWord}. Last time: ${last.topExerciseName} ${w}kg x ${last.topReps}. How about today?`;
}
