import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCheck } from '../src/index.js';

const CLEAN_STATE = { updated_at: '2026-09-21T00:00:00Z', done: [{ id: 'd1', anchor: 'commit abc' }] };
const ALL_TRUE = {
  buildPassed: true,
  verificationGreen: true,
  debugArtifactsClean: true,
  startupPathUsable: true,
};

test('all checks true with persisted state is EXIT_CLEAN', () => {
  const r = exitCheck(CLEAN_STATE, ALL_TRUE);
  assert.equal(r.verdict, 'EXIT_CLEAN');
  assert.deepEqual(r.unmet, []);
  assert.equal(r.conditions.every((c) => c.status === 'pass'), true);
});

test('unknown check results fail closed as EXIT_DIRTY', () => {
  const r = exitCheck(CLEAN_STATE, {});
  assert.equal(r.verdict, 'EXIT_DIRTY');
  assert.ok(r.unmet.includes('build'));
  assert.ok(r.unmet.includes('verification'));
  assert.ok(r.unmet.includes('artifacts_clean'));
  assert.ok(r.unmet.includes('startup_path'));
  const build = r.conditions.find((c) => c.id === 'build');
  assert.equal(build.status, 'unknown');
});

test('explicit false check is fail, not unknown', () => {
  const r = exitCheck(CLEAN_STATE, { ...ALL_TRUE, verificationGreen: false });
  assert.equal(r.verdict, 'EXIT_DIRTY');
  const v = r.conditions.find((c) => c.id === 'verification');
  assert.equal(v.status, 'fail');
});

test('empty updated_at fails progress_persisted', () => {
  const r = exitCheck({ updated_at: '' }, ALL_TRUE);
  const p = r.conditions.find((c) => c.id === 'progress_persisted');
  assert.equal(p.status, 'fail');
  assert.ok(r.unmet.includes('progress_persisted'));
});

test('non-object state fails progress and warns without throwing', () => {
  const r = exitCheck(null, ALL_TRUE);
  assert.equal(r.verdict, 'EXIT_DIRTY');
  assert.ok(r.warnings.some((w) => /state/.test(w)));
  assert.equal(r.conditions.find((c) => c.id === 'progress_persisted').status, 'fail');
});

test('applicable list exempts conditions from the verdict', () => {
  const r = exitCheck(CLEAN_STATE, ALL_TRUE, { applicable: [] });
  assert.equal(r.verdict, 'EXIT_CLEAN');
  const r2 = exitCheck(CLEAN_STATE, {}, { applicable: ['build', 'verification', 'artifacts_clean', 'startup_path'] });
  assert.equal(r2.verdict, 'EXIT_CLEAN');
  assert.equal(r2.conditions.find((c) => c.id === 'build').status, 'not-applicable');
});

test('exactly five conditions in stable order', () => {
  const r = exitCheck(CLEAN_STATE, ALL_TRUE);
  assert.deepEqual(r.conditions.map((c) => c.id), [
    'build', 'verification', 'progress_persisted', 'artifacts_clean', 'startup_path',
  ]);
});

test('pure function: repeated calls give identical results', () => {
  const a = exitCheck(CLEAN_STATE, ALL_TRUE);
  const b = exitCheck(CLEAN_STATE, ALL_TRUE);
  assert.deepEqual(a, b);
});

test('garbage checks container degrades to all-unknown without throwing', () => {
  const r = exitCheck(CLEAN_STATE, 'nope');
  assert.equal(r.verdict, 'EXIT_DIRTY');
  assert.ok(r.warnings.length >= 1);
});
