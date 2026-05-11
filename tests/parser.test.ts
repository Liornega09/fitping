import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/domain/parser.js';

describe('parseIntent', () => {
  describe('start', () => {
    it('parses start with name', () => {
      expect(parseIntent('start A')).toMatchObject({ type: 'start', name: 'a' });
    });
    it('lowercases the name', () => {
      expect(parseIntent('START Push')).toMatchObject({ type: 'start', name: 'push' });
    });
  });

  describe('control commands', () => {
    it('done', () => {
      expect(parseIntent('done')).toMatchObject({ type: 'done' });
    });
    it('done with trailing punctuation', () => {
      expect(parseIntent('done.')).toMatchObject({ type: 'done' });
    });
    it('undo', () => {
      expect(parseIntent('undo')).toMatchObject({ type: 'undo' });
    });
  });

  describe('summary', () => {
    it('summary today', () => {
      expect(parseIntent('summary today')).toMatchObject({ type: 'summary_today' });
    });
    it('today shorthand', () => {
      expect(parseIntent('today')).toMatchObject({ type: 'summary_today' });
    });
    it('typo summery', () => {
      expect(parseIntent('summery today')).toMatchObject({ type: 'summary_today' });
    });
    it('summary alone defaults to today', () => {
      expect(parseIntent('summary')).toMatchObject({ type: 'summary_today' });
    });
    it('summary week', () => {
      expect(parseIntent('summary week')).toMatchObject({ type: 'summary_week' });
    });
    it('week shorthand', () => {
      expect(parseIntent('week')).toMatchObject({ type: 'summary_week' });
    });
    it('summary today with punctuation', () => {
      expect(parseIntent('Summary today.')).toMatchObject({ type: 'summary_today' });
    });
  });

  describe('progress', () => {
    it('parses progress with alias', () => {
      expect(parseIntent('progress bench')).toMatchObject({
        type: 'progress',
        exerciseAlias: 'bench'
      });
    });
    it('keeps multi-word alias', () => {
      expect(parseIntent('progress incline bench')).toMatchObject({
        type: 'progress',
        exerciseAlias: 'incline bench'
      });
    });
  });

  describe('weight metric', () => {
    it('integer', () => {
      expect(parseIntent('weight 92')).toMatchObject({ type: 'weight', value: 92 });
    });
    it('decimal', () => {
      expect(parseIntent('weight 92.4')).toMatchObject({ type: 'weight', value: 92.4 });
    });
    it('invalid', () => {
      expect(parseIntent('weight abc')).toMatchObject({ type: 'invalid_metric', metric: 'weight' });
    });
  });

  describe('sleep metric', () => {
    it('decimal', () => {
      expect(parseIntent('sleep 6.5')).toMatchObject({ type: 'sleep', value: 6.5 });
    });
    it('invalid', () => {
      expect(parseIntent('sleep zzz')).toMatchObject({ type: 'invalid_metric', metric: 'sleep' });
    });
  });

  describe('energy metric', () => {
    it('valid 1-10', () => {
      expect(parseIntent('energy 7')).toMatchObject({ type: 'energy', value: 7 });
      expect(parseIntent('energy 1')).toMatchObject({ type: 'energy', value: 1 });
      expect(parseIntent('energy 10')).toMatchObject({ type: 'energy', value: 10 });
    });
    it('out of range', () => {
      expect(parseIntent('energy 0')).toMatchObject({ type: 'invalid_energy' });
      expect(parseIntent('energy 11')).toMatchObject({ type: 'invalid_energy' });
    });
    it('non numeric', () => {
      expect(parseIntent('energy high')).toMatchObject({ type: 'invalid_energy' });
    });
  });

  describe('pain', () => {
    it('parses note + score', () => {
      expect(parseIntent('pain right shoulder 3/10')).toMatchObject({
        type: 'pain',
        note: 'right shoulder',
        score: 3
      });
    });
    it('invalid format', () => {
      expect(parseIntent('pain ouch')).toMatchObject({ type: 'invalid_pain' });
    });
  });

  describe('exercise log', () => {
    it('single rep set', () => {
      expect(parseIntent('bench 28 10')).toMatchObject({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10]
      });
    });
    it('multiple sets', () => {
      expect(parseIntent('bench 28 10,10,8')).toMatchObject({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10, 10, 8]
      });
    });
    it('tolerates spaces after commas', () => {
      expect(parseIntent('bench 28 10, 10, 8')).toMatchObject({
        type: 'exercise_log',
        alias: 'bench',
        weight: 28,
        reps: [10, 10, 8]
      });
    });
    it('multi-word alias', () => {
      expect(parseIntent('incline bench 40 8,8,6')).toMatchObject({
        type: 'exercise_log',
        alias: 'incline bench',
        weight: 40,
        reps: [8, 8, 6]
      });
    });
    it('decimal weight', () => {
      expect(parseIntent('bench 27.5 10')).toMatchObject({
        type: 'exercise_log',
        alias: 'bench',
        weight: 27.5,
        reps: [10]
      });
    });
    it('rejects zero reps', () => {
      expect(parseIntent('bench 28 10,0,8')).toMatchObject({ type: 'invalid_exercise_log' });
    });
  });

  describe('unknown', () => {
    it('blank-ish', () => {
      expect(parseIntent('hello')).toMatchObject({ type: 'unknown' });
    });
  });

  describe('parser flexibility (round 3)', () => {
    it('weight accepts kg suffix', () => {
      expect(parseIntent('weight 92kg')).toMatchObject({ type: 'weight', value: 92 });
      expect(parseIntent('weight 92 kg')).toMatchObject({ type: 'weight', value: 92 });
    });
    it('sleep accepts h suffix', () => {
      expect(parseIntent('sleep 6.5h')).toMatchObject({ type: 'sleep', value: 6.5 });
      expect(parseIntent('sleep 7 h')).toMatchObject({ type: 'sleep', value: 7 });
    });
    it('progress without name returns overview', () => {
      expect(parseIntent('progress')).toMatchObject({ type: 'progress_overview' });
    });
    it('goal without reps returns invalid_goal_format', () => {
      expect(parseIntent('goal bench 100')).toMatchObject({ type: 'invalid_goal_format' });
    });
    it('goal alone returns invalid_goal_format', () => {
      expect(parseIntent('goal')).toMatchObject({ type: 'invalid_goal_format' });
    });
    it('valid goal still parses', () => {
      expect(parseIntent('goal bench 100 5')).toMatchObject({
        type: 'set_goal',
        exerciseAlias: 'bench',
        weight: 100,
        reps: 5
      });
    });
  });
});
