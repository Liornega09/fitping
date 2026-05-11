/**
 * Per-language reply templates. Keep them as small functions so callers
 * pass strongly-typed parameters instead of building strings ad-hoc.
 *
 * Add new languages by extending each `Replies` object — the parser
 * already tags each Intent with `language`, so plumbing is in place.
 */
import type { Language } from './i18n.js';

export type ReplyKey =
  | 'started_workout'
  | 'workout_already_active'
  | 'no_active_workout'
  | 'workout_saved_empty'
  | 'workout_saved_total'
  | 'workout_saved_top_lift'
  | 'nothing_to_undo'
  | 'metric_removed'
  | 'exercise_removed'
  | 'no_logs_today'
  | 'today_summary_header'
  | 'no_logs_week'
  | 'week_summary_header'
  | 'no_logs_for_exercise'
  | 'progress_header'
  | 'metric_saved'
  | 'pain_saved'
  | 'unknown_exercise_with_suggestion'
  | 'unknown_exercise_generic'
  | 'exercise_saved'
  | 'new_pr'
  | 'next_target'
  | 'invalid_energy'
  | 'invalid_metric'
  | 'invalid_pain'
  | 'invalid_exercise_log'
  | 'could_not_parse'
  | 'missing_payload'
  | 'total_sets'
  | 'help'
  | 'rate_limited'
  | 'goal_set'
  | 'goal_achieved'
  | 'goals_header'
  | 'no_goals';

type RepliesEN = {
  help: () => string;
  suggest_unavailable: () => string;
  rate_limited: () => string;
  goal_set: (exercise: string, weight: number, reps: number) => string;
  goal_achieved: (exercise: string, weight: number, reps: number) => string;
  goals_header: () => string;
  no_goals: () => string;
  started_workout: (name: string) => string;
  workout_already_active: (name: string) => string;
  no_active_workout: () => string;
  workout_saved_empty: (name: string) => string;
  workout_saved_header: (name: string) => string;
  total_sets: (count: number) => string;
  top_lift: (label: string) => string;
  nothing_to_undo: () => string;
  metric_removed: (type: string) => string;
  exercise_removed: (name: string) => string;
  no_logs_today: () => string;
  today_summary_header: () => string;
  no_logs_week: () => string;
  week_summary_header: () => string;
  no_logs_for_exercise: (name: string) => string;
  progress_header: (name: string) => string;
  metric_saved: (type: string, value: number) => string;
  pain_saved: (note: string, score: number) => string;
  unknown_exercise_with_suggestion: (alias: string, suggestion: string) => string;
  unknown_exercise_generic: () => string;
  exercise_saved: (name: string, weight: number, repsList: number[]) => string;
  new_pr: (newKg: number, oldKg: number) => string;
  next_target: (weight: number, reps: number) => string;
  invalid_energy: () => string;
  invalid_metric: (metric: 'weight' | 'sleep') => string;
  invalid_pain: () => string;
  invalid_exercise_log: () => string;
  could_not_parse: () => string;
  missing_payload: () => string;
};

const formatKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const en: RepliesEN = {
  help: () =>
    [
      'FitPing commands:',
      '',
      'Workout',
      '  start <name>         – open a new session',
      '  done                 – close & summarize',
      '  undo                 – remove last entry',
      '',
      'Logging',
      '  <exercise> <kg> <reps[,reps...]>',
      '  e.g. bench 60 5,5,4',
      '',
      'Tracking',
      '  summary today / week',
      '  progress <exercise>',
      '  suggest              – next workout based on history',
      '  volume <muscle>      – weekly volume for a muscle group',
      '  goal <exercise> <kg> x <reps>',
      '  goals                – list your goals',
      '',,,
      'Body metrics',
      '  weight <kg>  sleep <h>  energy <1-10>',
      '  pain <note> <score>/10',
      '',
      'Exercises: bench, squat, row, pulldown,',
      '  incline bench, flys, shoulder press,',
      '  lateral raises, curl, pushdown, and more.',
    ].join('\n'),
  suggest_unavailable: () => 'No suggestion available — try logging a few workouts first.',
  rate_limited: () => 'Too many messages. Please wait a minute.',
  goal_set: (exercise, weight, reps) => `Goal set: ${exercise} ${formatKg(weight)}kg x ${reps}.`,
  goal_achieved: (exercise, weight, reps) => `Goal achieved! ${exercise} ${formatKg(weight)}kg x ${reps}.`,
  goals_header: () => 'Your goals:',
  no_goals: () => 'No goals set yet. Try: goal bench 100kg x 5',
  started_workout: (name) => `Started workout ${name}.`,
  workout_already_active: (name) => `Workout ${name} is already active. Send done first.`,
  no_active_workout: () => 'No active workout. Send: start A',
  workout_saved_empty: (name) => `Workout ${name} saved. No exercises logged.`,
  workout_saved_header: (name) => `Workout ${name} saved.`,
  total_sets: (count) => `Total: ${count} sets`,
  top_lift: (label) => `Top lift: ${label}`,
  nothing_to_undo: () => 'Nothing to undo.',
  metric_removed: (type) => `${type} removed.`,
  exercise_removed: (name) => `${name} removed.`,
  no_logs_today: () => 'No workout logs today.',
  today_summary_header: () => 'Today summary:',
  no_logs_week: () => 'No logs this week yet.',
  week_summary_header: () => 'Week summary:',
  no_logs_for_exercise: (name) => `No logs yet for ${name}.`,
  progress_header: (name) => `Progress ${name}:`,
  metric_saved: (type, value) => `${type} saved: ${value}`,
  pain_saved: (note, score) => `Pain saved: ${note} ${score}/10`,
  unknown_exercise_with_suggestion: (alias, suggestion) =>
    `I don't know "${alias}". Did you mean "${suggestion}"?`,
  unknown_exercise_generic: () =>
    'Unknown exercise alias. Try: bench, incline bench, flys, lateral raises, shoulder press, pulldown, row, squat.',
  exercise_saved: (name, weight, repsList) =>
    `${name} saved: ${formatKg(weight)}kg — ${repsList.length} sets (${repsList.join(',')}).`,
  new_pr: (newKg, oldKg) => `New 1RM est: ${formatKg(newKg)}kg (was ${formatKg(oldKg)}kg).`,
  next_target: (weight, reps) => `Next: ${formatKg(weight)}kg x ${reps}.`,
  invalid_energy: () => 'Energy must be 1-10. Example: energy 7',
  invalid_metric: (metric) =>
    `Use: ${metric} <number>. Example: ${metric} ${metric === 'sleep' ? '6.5' : '92.4'}`,
  invalid_pain: () => 'Use: pain <note> <score>/10. Example: pain right shoulder 3/10',
  invalid_exercise_log: () => 'Use: <exercise> <weight> <reps>. Example: bench 28 10,10,8',
  could_not_parse: () => 'Could not parse message. Example: bench 28 10,10,8',
  missing_payload: () => 'Missing From or Body in webhook payload.'
};

const he: RepliesEN = {
  help: () =>
    [
      'פקודות FitPing:',
      '',
      'אימון',
      '  התחל <שם>             – פתיחת סשן חדש',
      '  סיימתי                – סגירה וסיכום',
      '  בטל                   – ביטול הרישום האחרון',
      '',
      'רישום תרגיל',
      '  <תרגיל> <ק"ג> <חזרות[,חזרות...]>',
      '  לדוגמה: בנץ 60 5,5,4',
      '',
      'מעקב',
      '  סיכום היום / שבוע',
      '  התקדמות <תרגיל>',
      '  הצע               – אימון מוצע לפי היסטוריה',
      '  נפח <שריר>        – נפח שבועי לקבוצת שריר',
      '  יעד <תרגיל> <ק"ג> <חזרות>',
      '  יעדים             – רשימת היעדים',
      '',
      'מדדי גוף',
      '  משקל <ק"ג>  שינה <שעות>  אנרגיה <1-10>',
      '  כאב <תיאור> <ציון>/10',
      '',
      'תרגילים: בנץ, סקוואט, חתירה, פולי,',
      '  משופע, פרפר, כתפיים,',
      '  הרחקות, קרל, פושדאון ועוד.',
    ].join('\n'),
  suggest_unavailable: () => 'אין הצעה זמינה עדיין — נסה/י לרשום כמה אימונים קודם.',
  rate_limited: () => 'יותר מדי הודעות. המתן/י דקה.',
  goal_set: (exercise, weight, reps) => `יעד נקבע: ${exercise} ${formatKg(weight)}ק"ג x ${reps}.`,
  goal_achieved: (exercise, weight, reps) => `יעד הושג! ${exercise} ${formatKg(weight)}ק"ג x ${reps}.`,
  goals_header: () => 'היעדים שלך:',
  no_goals: () => 'אין יעדים עדיין. נסה/י: יעד בנץ 100 5',
  started_workout: (name) => `התחלתי אימון ${name}.`,
  workout_already_active: (name) => `אימון ${name} כבר פעיל. שלח/י קודם "סיימתי".`,
  no_active_workout: () => 'אין אימון פעיל. שלח/י: התחל A',
  workout_saved_empty: (name) => `אימון ${name} נשמר. לא נרשמו תרגילים.`,
  workout_saved_header: (name) => `אימון ${name} נשמר.`,
  total_sets: (count) => `סה"כ: ${count} סטים`,
  top_lift: (label) => `הרמה הכי כבדה: ${label}`,
  nothing_to_undo: () => 'אין מה לבטל.',
  metric_removed: (type) => `${type} נמחק.`,
  exercise_removed: (name) => `${name} נמחק.`,
  no_logs_today: () => 'אין אימונים שנרשמו היום.',
  today_summary_header: () => 'סיכום היום:',
  no_logs_week: () => 'אין אימונים השבוע עדיין.',
  week_summary_header: () => 'סיכום השבוע:',
  no_logs_for_exercise: (name) => `אין עדיין רישומים ל-${name}.`,
  progress_header: (name) => `התקדמות ${name}:`,
  metric_saved: (type, value) => `${type} נשמר: ${value}`,
  pain_saved: (note, score) => `כאב נשמר: ${note} ${score}/10`,
  unknown_exercise_with_suggestion: (alias, suggestion) =>
    `לא מכיר "${alias}". התכוונת ל-"${suggestion}"?`,
  unknown_exercise_generic: () =>
    'תרגיל לא מוכר. נסה: בנץ, משופע, פרפר, הרחקות, כתפיים, פולי, חתירה, סקוואט.',
  exercise_saved: (name, weight, repsList) =>
    `${name} נשמר: ${formatKg(weight)}ק"ג — ${repsList.length} סטים (${repsList.join(',')}).`,
  new_pr: (newKg, oldKg) => `שיא חדש: 1RM משוער ${formatKg(newKg)}ק"ג (קודם ${formatKg(oldKg)}ק"ג).`,
  next_target: (weight, reps) => `הבא: ${formatKg(weight)}ק"ג x ${reps}.`,
  invalid_energy: () => 'אנרגיה חייבת להיות 1-10. דוגמה: אנרגיה 7',
  invalid_metric: (metric) => {
    const heMetric = metric === 'sleep' ? 'שינה' : 'משקל';
    const example = metric === 'sleep' ? '6.5' : '92.4';
    return `שימוש: ${heMetric} <מספר>. דוגמה: ${heMetric} ${example}`;
  },
  invalid_pain: () => 'שימוש: כאב <תיאור> <ציון>/10. דוגמה: כאב כתף ימין 3/10',
  invalid_exercise_log: () => 'שימוש: <תרגיל> <משקל> <חזרות>. דוגמה: בנץ 28 10,10,8',
  could_not_parse: () => 'לא הצלחתי להבין. דוגמה: בנץ 28 10,10,8',
  missing_payload: () => 'חסר From או Body ב-webhook.'
};

const REPLIES: Record<Language, RepliesEN> = { en, he };

export function replies(language: Language): RepliesEN {
  return REPLIES[language] ?? REPLIES.en;
}
