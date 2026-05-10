import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/domain/parser.js';

describe('parseIntent', () => {
  describe('start', () => {
    it('parses start with name', () => {
      expect(parseIntent('start A')).toEqual({ type: 'start', name: 'a' });
    });
    it('lowercases the name', () => {
      expect(parseIntent('START Push')).toEqual({ type: 'start', name: 'push' });
    });
  });

  describe('control commands', () => {
    it('done', () => {
      expect(parseIntent('done')).toEqual({ type: 'done' });
    });
    it('done with trailing punctuation', () => {
      expect(parseIntent('done.')).toEqual({ type: 'done' });
    });
    it('undo', () => {
      expect(parseIntent('undo')).toEqual({ type: 'undo' });
    });
  });

  describe('summary', () => {
    it('summary today', () => {
      expect(parseIntent('summary today')).toEqual({ type: 'summary_today' });
    });
    it('today shorthand', () => {
      expect(parseIntent('today')).toEqual({ type: 'summary_today' });
    });
    it('typo summery', () => {
      expect(parseIntent('summery today')).toEqual({ type: 'summary_today' });
    });
    it('summary alone defaults to today', () => {
      expect(parseIntent('summary')).toEqual({ type: 'summary_today' });
    });
    it('summary week', () => {
      expect(parseIntent('summary week')).toEqual({ type: 'summary_week' });
    });
    it('week shorthand', () => {
      expect(parseIntent('week')).toEqual({ type: 'summary_week' });
    });
    it('summary today with punctuation', () => {
      expect(parseIntent('Summary today.')).toEqual({ type: 'summary_today' });
    });
  });

  describe('progress', () => {
    it('parses progress with alias', () => {
      expect(parseIntent('progress bench')).toEqual({
        type: 'progress',
        exerciseAlias: 'bench'
      });
    });
    it('keeps multi-word alias', () => {
      expect(parseIntent('progress incline bench')).toEqual({
        type: 'progress',
        exerciseAlias: 'incline bench'
      });
    });
  });

  describe('weight metric', () => {
    it('integer', () => {
      expect(parseIntent('weight 92')).toEqual({ type: 'weight', value: 92 });
    });
    it('decimal', () => {
      expect(parseIntent('weight 92.4')).toEqual({ type: 'weight', value: 92.4 });
    });
    it('invalid', () => {
      expect(parseIntent('weight abc')).toEqual({ type: 'invalid_metric', metric: 'weight' });
    });
  });

  describe('sleep metric', () => {
    it('decimal', () => {
      expect(parseIntent('sleep 6.5')).toEqual({ type: 'sleep', value: 6.5 });
    });
    it('invalid', () => {
      expect(parseIntent('sleep zzz')).toEqual({ type: 'invalid_metric', metric: 'sleep' });
    });
  });

  describe('energy metric', () => {
    it('valid 1-10', () => {
      expect(parseIntent('energy 7')).toEqual({ type: 'energy', value: 7 });
      expect(parseIntent('energy 1')).toEqual({ type: 'energy', value: 1 });
      expect(parseIntent('energy 10')).toEqual({ type: 'energy', value: 10 });
    });
    it('out of range', () => {
      expect(parseIntent('energy 0')).toEqual({ type: 'invalid_energy' });
      expect(parseIntent('energy 11')).toEqual({ type: 'invalid_energy' });
    });
    it('non numeric', () => {
      expect(parseIntent('energy high')).toEqual({ type: 'invalid_energy' });
    });
  });

  describe('pain', () => {
    it('parses note + score', () => {
      expect(parseIntent('pain right shoulder 3/10')).toEqual({
        type: 'pain',
        note: 'right shoulder',
        score: 3
      });
    });
    it('invalid format', () => {
      expect(parseIntent('pain ouch')).toEqual({ type: 'invalid_pain' });
    });
  });

  describe('exercise log', () => {
    it('single rep set', () => {
      expect(parseIntent('bench 28 10')).toEqual({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10]
      });
    });
    it('multiple sets', () => {
      expect(parseIntent('bench 28 10,10,8')).toEqual({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10, 10, 8]
      });
    });
    it('tolerates spaces after commas', () => {
      expect(parseIntent('bench 28 10, 10, 8')).toEqual({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10, 10, 8]
      });
    });
    it('multi-word alias', () => {
      expect(parseIntent('incline bench 40 8,8,6')).toEqual({
        type: 'exercise_log',
        alias: 'incline bench',
        weight: 40,
        reps: [8, 8, 6]
      });
    });
    it('decimal weight', () => {
      expect(parseIntent('bench 27.5 10')).toEqual({
        type: 'exercise_log',
        alias: 'bench',
        weight: 27.5,
        reps: [10]
      });
    });
    it('rejects zero reps', () => {
      expect(parseIntent('bench 28 10,0,8')).toEqual({ type: 'invalid_exercise_log' });
    });
  });

  describe('unknown', () => {
    it('blank-ish', () => {
      expect(parseIntent('hello')).toEqual({ type: 'unknown' });
    });
  });
});
