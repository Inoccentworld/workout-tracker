import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendWorkout, normalizeWorkoutDate } from '../.test-build/workout-recommendations.js';
import { DUMBBELL_LOADS_LB, EXERCISE_RULES } from '../.test-build/workout-rules.js';

const CHEST = 'ダンベルチェストプレス';
const options = { asOf: '2026-09-10' };
const record = (date, patch = {}) => ({
  id: `${date}-${patch.load ?? 50}-${patch.reps ?? 12}-${patch.sets ?? 3}`,
  date, exercise: CHEST, load: 50, reps: 12, sets: 3, weight: 60, ...patch,
});
const recommend = (rows, opts = {}, exercise = CHEST) =>
  recommendWorkout(exercise, rows, { ...options, ...opts });

test('the configured equipment list follows the user formula', () => {
  assert.deepEqual(DUMBBELL_LOADS_LB.slice(0, 6), [15, 17.5, 20, 25, 27.5, 30]);
  assert.equal(DUMBBELL_LOADS_LB.at(-1), 80);
  assert.equal(DUMBBELL_LOADS_LB.includes(22.5), false);
  assert.equal(EXERCISE_RULES.length, 8);
  assert.equal(EXERCISE_RULES.find(r => r.exercise === 'ダンベルデッドリフト').reps[1], 8);
});

test('normal records are treated as near-limit work without requiring RIR input', () => {
  const result = recommend([record('2026-09-04'), record('2026-09-08')]);
  assert.equal(result.status, 'increase-load');
  assert.equal(result.plan[0].loadLb, 55);
});

test('light sessions count toward volume but do not change or interrupt the recommendation', () => {
  const rows = [
    record('2026-09-01'),
    record('2026-09-05', { id: 'light', load: 15, reps: 5, sets: 1, recommendationMode: 'light' }),
    record('2026-09-08'),
  ];
  const result = recommend(rows);
  assert.equal(result.status, 'increase-load');
  assert.equal(result.lastActivityDate, '2026-09-08');
  assert.equal(result.lastProgressionDate, '2026-09-08');
  assert.equal(result.recent7.lightSessions, 1);
  assert.equal(result.recent7.volumeLb, 3750);
});

test('a light session after normal work leaves the previous menu intact', () => {
  const result = recommend([
    record('2026-09-04', { reps: 10 }),
    record('2026-09-09', { id: 'light', load: 15, reps: 4, sets: 1, recommendationMode: 'light' }),
  ]);
  assert.equal(result.status, 'increase-reps');
  assert.equal(result.plan[0].loadLb, 50);
  assert.equal(result.lastActivityDate, '2026-09-09');
  assert.equal(result.lastProgressionDate, '2026-09-04');
});

test('light sessions do not postpone reassessment after a long gap', () => {
  const result = recommend([
    record('2026-08-01', { reps: 10 }),
    record('2026-09-09', { id: 'light', recommendationMode: 'light' }),
  ]);
  assert.equal(result.status, 'reassess');
  assert.equal(result.daysSinceLastProgression, 40);
});

test('extra normal sets contribute volume but do not inflate the planned set count', () => {
  const result = recommend([
    record('2026-09-04', { sets: 4 }),
    record('2026-09-08', { id: 'second', sets: 4 }),
  ]);
  assert.equal(result.status, 'increase-load');
  assert.equal(result.plan[0].sets, 3);
  assert.equal(result.recent7.sets, 8);
});

test('keeping the heavier load for all sets is accepted as actual performance', () => {
  const result = recommend([
    record('2026-09-04', { load: 25, reps: 12 }),
    record('2026-09-08', { id: 'second', load: 25, reps: 12 }),
  ]);
  assert.equal(result.status, 'increase-load');
  assert.equal(result.plan[0].loadLb, 27.5);
});

test('a large equipment jump starts with one heavy set and backoff work', () => {
  const result = recommend([
    record('2026-09-04', { load: 20 }),
    record('2026-09-08', { id: 'second', load: 20 }),
  ]);
  assert.equal(result.status, 'transition');
  assert.deepEqual(result.plan.map(p => [p.loadLb, p.sets]), [[25, 1], [20, 2]]);
});

test('completed transition work advances a heavy set while preserving total planned sets', () => {
  const rows = [
    record('2026-09-08', { id: 'heavy', load: 25, reps: 8, sets: 1 }),
    record('2026-09-08', { id: 'backoff', load: 20, reps: 11, sets: 2 }),
  ];
  const result = recommend(rows);
  assert.equal(result.status, 'transition');
  assert.deepEqual(result.plan.map(p => [p.loadLb, p.sets]), [[25, 2], [20, 1]]);
});

test('below-range reps, bad form and breathlessness do not trigger progression', () => {
  assert.equal(recommend([record('2026-09-08', { reps: 7 })]).status, 'repeat');
  assert.equal(recommend([record('2026-09-08', { formConfirmed: false })]).status, 'repeat');
  const deadlift = 'ダンベルデッドリフト';
  const result = recommend([
    record('2026-09-08', { exercise: deadlift, load: 60, reps: 8, sets: 2, stoppedBy: 'breathing' }),
  ], {}, deadlift);
  assert.equal(result.status, 'repeat');
});

test('unilateral work only blocks progression when a side failure is explicitly recorded', () => {
  const exercise = 'インクラインサイドレイズ(左右)';
  const rows = [
    record('2026-09-04', { exercise, load: 15, reps: 20 }),
    record('2026-09-08', { id: 'second', exercise, load: 15, reps: 20 }),
  ];
  assert.equal(recommend(rows, {}, exercise).status, 'transition');
  assert.equal(recommend(rows.map(r => ({ ...r, bothSidesConfirmed: false })), {}, exercise).status, 'repeat');
});

test('pull-up uses recorded body weight and needs an explicit added-load list', () => {
  const exercise = '懸垂';
  const rows = [
    record('2026-09-04', { exercise, load: 0, reps: 10 }),
    record('2026-09-08', { id: 'second', exercise, load: 0, reps: 10 }),
  ];
  assert.equal(recommend(rows, {}, exercise).status, 'confirm-equipment');
  const result = recommend(rows, { pullupAddedLoadsLb: [0, 5] }, exercise);
  assert.equal(result.status, 'increase-load');
  assert.equal(result.plan[0].loadLb, 5);
});

test('ab wheel requires a difficulty review instead of inventing a weight', () => {
  const exercise = 'アブローラー(膝コロ)';
  const rows = [
    record('2026-09-04', { exercise, load: 0, reps: 15, sets: 2 }),
    record('2026-09-08', { id: 'second', exercise, load: 0, reps: 15, sets: 2 }),
  ];
  assert.equal(recommend(rows, {}, exercise).status, 'review-difficulty');
});

test('calendar summaries normalize separators and exclude future records', () => {
  const result = recommend([
    record('2026/9/10', { reps: 10 }),
    record('2026.9.4', { id: 'older', reps: 10 }),
    record('2026-09-11', { id: 'future' }),
  ]);
  assert.equal(result.recent7.sessions, 2);
  assert.equal(result.issues.length, 1);
  assert.equal(normalizeWorkoutDate('2026/2/29'), null);
  assert.equal(normalizeWorkoutDate('2024/2/29'), '2024-02-29');
});

test('invalid data blocks recommendations and input records are never mutated', () => {
  const rows = [record('2026-09-08'), record('2026-09-08', { load: Number.NaN })];
  const before = JSON.stringify(rows);
  assert.equal(recommend(rows).status, 'invalid-history');
  assert.equal(JSON.stringify(rows), before);
});
