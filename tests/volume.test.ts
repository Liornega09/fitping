import { describe, it, expect } from 'vitest';
import { buildVolumeHistory, formatVolumeHistory, type VolumeLogEntry } from '../src/domain/volume.js';

const NOW = new Date('2026-05-11T12:00:00Z'); // Monday

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

const LOGS: VolumeLogEntry[] = [
  // This week (week of May 11)
  { weight: 80, reps: [5, 5, 5], loggedAt: daysAgo(0), primaryMuscle: 'chest' },
  { weight: 80, reps: [5, 5], loggedAt: daysAgo(1), primaryMuscle: 'chest' },
  // Last week (week of May 4)
  { weight: 77.5, reps: [5, 5, 5, 5], loggedAt: daysAgo(7), primaryMuscle: 'chest' },
  // 2 weeks ago (week of Apr 27)
  { weight: 75, reps: [5, 5, 5], loggedAt: daysAgo(14), primaryMuscle: 'chest' },
  // Different muscle — should be excluded
  { weight: 100, reps: [5, 5, 5], loggedAt: daysAgo(0), primaryMuscle: 'quads' },
];

describe('buildVolumeHistory', () => {
  it('returns empty when no matching logs', () => {
    expect(buildVolumeHistory(LOGS, 'lats', NOW, 4)).toHaveLength(0);
  });

  it('returns correct number of weeks', () => {
    const result = buildVolumeHistory(LOGS, 'chest', NOW, 4);
    expect(result.length).toBe(3); // 3 weeks have data
  });

  it('sorts newest week first', () => {
    const result = buildVolumeHistory(LOGS, 'chest', NOW, 4);
    // Week of May 11 (Mon): only daysAgo(0) → 3 sets
    expect(result[0].sets).toBe(3);
  });

  it('counts sets correctly', () => {
    const result = buildVolumeHistory(LOGS, 'chest', NOW, 4);
    // Week of May 11: daysAgo(0) = [5,5,5] → 3 sets
    expect(result[0].sets).toBe(3);
    // Week of May 4: daysAgo(1)=Sun May10=[5,5] + daysAgo(7)=Mon May4=[5,5,5,5] → 6 sets
    expect(result[1].sets).toBe(6);
    // Week of Apr 27: daysAgo(14) = [5,5,5] → 3 sets
    expect(result[2].sets).toBe(3);
  });

  it('excludes logs from other muscles', () => {
    const result = buildVolumeHistory(LOGS, 'quads', NOW, 4);
    expect(result[0].sets).toBe(3); // only the quads log
  });

  it('respects weeksBack cutoff', () => {
    const result = buildVolumeHistory(LOGS, 'chest', NOW, 1);
    expect(result.length).toBe(1);
  });
});

describe('formatVolumeHistory', () => {
  it('shows no-data message when empty', () => {
    expect(formatVolumeHistory('lats', [], 'en')).toMatch(/no volume data/i);
    expect(formatVolumeHistory('lats', [], 'he')).toMatch(/אין נתוני נפח/);
  });

  it('formats English output with sets and kg', () => {
    const weeks = buildVolumeHistory(LOGS, 'chest', NOW, 4);
    const text = formatVolumeHistory('chest', weeks, 'en');
    expect(text).toMatch(/Volume — chest/);
    expect(text).toMatch(/sets/);
    expect(text).toMatch(/kg volume/);
  });

  it('formats Hebrew output', () => {
    const weeks = buildVolumeHistory(LOGS, 'chest', NOW, 4);
    const text = formatVolumeHistory('chest', weeks, 'he');
    expect(text).toMatch(/נפח — chest/);
    expect(text).toMatch(/סטים/);
  });
});
