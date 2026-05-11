export type VolumeLogEntry = {
  weight: number;
  reps: number[];
  loggedAt: Date;
  primaryMuscle: string;
};

export type WeekVolume = {
  weekLabel: string; // e.g. "May 5"
  sets: number;
  totalReps: number;
  totalKg: number; // sum of weight * reps across all sets
};

function weekStartMonday(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatWeekLabel(monday: Date): string {
  return monday.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * Builds a volume-per-week history for a given muscle group.
 * Returns up to `weeksBack` weeks sorted newest first.
 */
export function buildVolumeHistory(
  logs: VolumeLogEntry[],
  muscle: string,
  now: Date,
  weeksBack = 4
): WeekVolume[] {
  const normalizedMuscle = muscle.toLowerCase().trim();

  const buckets = new Map<string, { monday: Date; sets: number; totalReps: number; totalKg: number }>();

  const cutoff = new Date(now.getTime() - weeksBack * 7 * 24 * 60 * 60 * 1000);

  for (const log of logs) {
    if (log.primaryMuscle.toLowerCase() !== normalizedMuscle) continue;
    if (log.loggedAt < cutoff) continue;

    const monday = weekStartMonday(log.loggedAt);
    const key = monday.toISOString();

    const bucket = buckets.get(key) ?? { monday, sets: 0, totalReps: 0, totalKg: 0 };
    bucket.sets += log.reps.length;
    for (const r of log.reps) {
      bucket.totalReps += r;
      bucket.totalKg += log.weight * r;
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.monday.getTime() - a.monday.getTime())
    .slice(0, weeksBack)
    .map((b) => ({
      weekLabel: formatWeekLabel(b.monday),
      sets: b.sets,
      totalReps: b.totalReps,
      totalKg: Math.round(b.totalKg),
    }));
}

export function formatVolumeHistory(
  muscle: string,
  weeks: WeekVolume[],
  language: 'en' | 'he'
): string {
  if (weeks.length === 0) {
    return language === 'he'
      ? `אין נתוני נפח עבור ${muscle} ב-4 השבועות האחרונים.`
      : `No volume data for ${muscle} in the last 4 weeks.`;
  }

  if (language === 'he') {
    const lines = [`נפח — ${muscle}:`, ''];
    for (const w of weeks) {
      lines.push(`${w.weekLabel}: ${w.sets} סטים, ${w.totalReps} חזרות, ${w.totalKg}ק"ג נפח`);
    }
    return lines.join('\n');
  }

  const lines = [`Volume — ${muscle}:`, ''];
  for (const w of weeks) {
    lines.push(`${w.weekLabel}: ${w.sets} sets, ${w.totalReps} reps, ${w.totalKg}kg volume`);
  }
  return lines.join('\n');
}
