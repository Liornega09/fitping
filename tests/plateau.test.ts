import { describe, it, expect } from 'vitest';
import { detectPlateau, formatPlateauWarning, type PlateauLogEntry } from '../src/domain/plateau.js';

const NOW = new Date('2026-05-11T12:00:00Z');

function weeksAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 7 * 24 * 60 * 60 * 1000);
}

describe('detectPlateau', () => {
  it('returns null with no logs', () => {
    expect(detectPlateau([], NOW)).toBeNull();
  });

  it('returns null with fewer than minWeeks of data', () => {
    const logs: PlateauLogEntry[] = [
      { weight: 80, reps: [5], loggedAt: weeksAgo(0) },
      { weight: 80, reps: [5], loggedAt: weeksAgo(1) },
    ];
    expect(detectPlateau(logs, NOW, 3)).toBeNull();
  });

  it('detects plateau when e1RM flat for 3 weeks', () => {
    const logs: PlateauLogEntry[] = [
      { weight: 80, reps: [5], loggedAt: weeksAgo(0) },
      { weight: 80, reps: [5], loggedAt: weeksAgo(1) },
      { weight: 80, reps: [5], loggedAt: weeksAgo(2) },
    ];
    const result = detectPlateau(logs, NOW, 3);
    expect(result).not.toBeNull();
    expect(result!.staleWeeks).toBe(3);
  });

  it('returns null when e1RM improves across weeks', () => {
    const logs: PlateauLogEntry[] = [
      { weight: 85, reps: [5], loggedAt: weeksAgo(0) },
      { weight: 82.5, reps: [5], loggedAt: weeksAgo(1) },
      { weight: 80, reps: [5], loggedAt: weeksAgo(2) },
    ];
    expect(detectPlateau(logs, NOW, 3)).toBeNull();
  });

  it('detects plateau when reps stagnate even with small weight changes', () => {
    // Same e1RM: 80x5 = 93.3, 80x5 = 93.3 (no change)
    const logs: PlateauLogEntry[] = [
      { weight: 80, reps: [5, 4, 4], loggedAt: weeksAgo(0) },
      { weight: 80, reps: [5, 5, 4], loggedAt: weeksAgo(1) },
      { weight: 80, reps: [5, 5, 5], loggedAt: weeksAgo(2) },
    ];
    const result = detectPlateau(logs, NOW, 3);
    expect(result).not.toBeNull();
  });

  it('returns null when only one week has data', () => {
    const logs: PlateauLogEntry[] = [
      { weight: 80, reps: [5], loggedAt: weeksAgo(0) },
      { weight: 80, reps: [5], loggedAt: new Date(weeksAgo(0).getTime() + 1000) },
    ];
    expect(detectPlateau(logs, NOW, 3)).toBeNull();
  });
});

describe('formatPlateauWarning', () => {
  it('formats in English', () => {
    const text = formatPlateauWarning({ staleWeeks: 3, bestE1RM: 93.3, bestWeight: 80, bestReps: 5 }, 'en');
    expect(text).toMatch(/plateau/i);
    expect(text).toMatch(/3 weeks/i);
  });

  it('formats in Hebrew', () => {
    const text = formatPlateauWarning({ staleWeeks: 3, bestE1RM: 93.3, bestWeight: 80, bestReps: 5 }, 'he');
    expect(text).toMatch(/התקדמות/);
    expect(text).toMatch(/3 שבועות/);
  });
});
