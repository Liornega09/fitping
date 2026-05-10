import { describe, expect, it } from 'vitest';
import { detectLanguage, translateHebrewToCanonical } from '../src/domain/i18n.js';
import { parseIntent } from '../src/domain/parser.js';

describe('detectLanguage', () => {
  it('returns "he" when any Hebrew character is present', () => {
    expect(detectLanguage('בנץ 60 5,5')).toBe('he');
    expect(detectLanguage('hello שלום')).toBe('he');
  });
  it('returns "en" otherwise', () => {
    expect(detectLanguage('bench 60 5,5')).toBe('en');
    expect(detectLanguage('1234')).toBe('en');
  });
});

describe('translateHebrewToCanonical', () => {
  it('translates known commands', () => {
    expect(translateHebrewToCanonical('סיימתי')).toBe('done');
    expect(translateHebrewToCanonical('סיכום שבוע')).toBe('summary week');
  });
  it('translates exercise + numbers stay intact', () => {
    expect(translateHebrewToCanonical('בנץ 60 5,5')).toBe('bench 60 5,5');
  });
  it('prefers longer phrases over shorter constituents', () => {
    expect(translateHebrewToCanonical('לחיצת חזה 80 5')).toBe('bench 80 5');
  });
  it('leaves unknown words alone', () => {
    expect(translateHebrewToCanonical('משהו 60 5')).toBe('משהו 60 5');
  });
});

describe('parseIntent — Hebrew', () => {
  it('tags language=he and parses start', () => {
    expect(parseIntent('התחל A')).toMatchObject({
      type: 'start',
      name: 'a',
      language: 'he'
    });
  });

  it('parses done', () => {
    expect(parseIntent('סיימתי')).toMatchObject({ type: 'done', language: 'he' });
  });

  it('parses summary week', () => {
    expect(parseIntent('סיכום שבוע')).toMatchObject({
      type: 'summary_week',
      language: 'he'
    });
  });

  it('parses an exercise log written in Hebrew', () => {
    expect(parseIntent('בנץ 60 5,5')).toMatchObject({
      type: 'exercise_log',
      alias: 'bench',
      weight: 60,
      reps: [5, 5],
      language: 'he'
    });
  });

  it('parses progress with a Hebrew exercise alias', () => {
    expect(parseIntent('התקדמות בנץ')).toMatchObject({
      type: 'progress',
      exerciseAlias: 'bench',
      language: 'he'
    });
  });

  it('English messages keep language=en', () => {
    expect(parseIntent('bench 60 5,5')).toMatchObject({
      type: 'exercise_log',
      language: 'en'
    });
  });
});
