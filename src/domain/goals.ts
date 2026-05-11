import { estimate1RM } from './pr.js';

export type GoalEntry = {
  exerciseName: string;
  targetWeight: number;
  targetReps: number;
  achievedAt: Date | null;
  createdAt: Date;
};

export type GoalProgress = {
  goal: GoalEntry;
  bestE1RM: number;
  targetE1RM: number;
  progressPct: number; // 0-100+
  achieved: boolean;
};

/**
 * Computes progress toward a goal given the user's best e1RM for that exercise.
 */
export function computeGoalProgress(
  goal: GoalEntry,
  bestE1RM: number
): GoalProgress {
  const targetE1RM = estimate1RM(goal.targetWeight, goal.targetReps);
  const progressPct = targetE1RM > 0 ? Math.round((bestE1RM / targetE1RM) * 100) : 0;
  return {
    goal,
    bestE1RM: Math.round(bestE1RM * 10) / 10,
    targetE1RM: Math.round(targetE1RM * 10) / 10,
    progressPct,
    achieved: progressPct >= 100,
  };
}

export function formatGoalProgress(p: GoalProgress, language: 'en' | 'he'): string {
  const { goal, progressPct, achieved } = p;

  if (language === 'he') {
    const status = achieved
      ? `הושג!`
      : `${progressPct}% מהיעד`;
    return `${goal.exerciseName}: ${goal.targetWeight}ק"ג x ${goal.targetReps} — ${status}`;
  }

  const status = achieved ? `achieved!` : `${progressPct}% of goal`;
  return `${goal.exerciseName}: ${goal.targetWeight}kg x ${goal.targetReps} — ${status}`;
}

export function formatGoalAchieved(exerciseName: string, weight: number, reps: number, language: 'en' | 'he'): string {
  if (language === 'he') {
    return `יעד הושג! ${exerciseName} ${weight}ק"ג x ${reps}.`;
  }
  return `Goal achieved! ${exerciseName} ${weight}kg x ${reps}.`;
}
