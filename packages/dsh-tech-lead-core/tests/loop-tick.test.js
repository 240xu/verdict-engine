import test from 'node:test';
import assert from 'node:assert/strict';
import { loopTick } from '../src/loop-tick.js';

const FRESH = { iteration: 0, sameFailureClassCount: 0, lastFailureClass: null };

test('success stops the loop as goal achieved', () => {
  const r = loopTick({}, FRESH, { success: true });
  assert.equal(r.decision, 'STOP');
  assert.equal(r.reason, 'goal achieved');
  assert.equal(r.updatedLoopState.iteration, 1);
});

test('a failing tick under budget with no repeated class continues', () => {
  const r = loopTick({ maxIterations: 20 }, FRESH, { success: false, failureClass: 'network' });
  assert.equal(r.decision, 'CONTINUE');
  assert.equal(r.updatedLoopState.iteration, 1);
  assert.equal(r.updatedLoopState.sameFailureClassCount, 1);
  assert.equal(r.updatedLoopState.lastFailureClass, 'network');
});

test('exceeding maxIterations stops on budget exhaustion even without repeated failures', () => {
  const state = { iteration: 20, sameFailureClassCount: 1, lastFailureClass: 'network' };
  const r = loopTick({ maxIterations: 20 }, state, { success: false, failureClass: 'timeout' });
  assert.equal(r.decision, 'STOP');
  assert.equal(r.reason, 'iteration budget exhausted');
  assert.equal(r.updatedLoopState.iteration, 21);
});

test('default maxIterations is 20 when the spec omits it (fail closed, not unbounded)', () => {
  const state = { iteration: 20, sameFailureClassCount: 1, lastFailureClass: 'x' };
  const r = loopTick({}, state, { success: false, failureClass: 'y' });
  assert.equal(r.decision, 'STOP');
  assert.equal(r.reason, 'iteration budget exhausted');
});

test('same failure class three times running escalates instead of retrying silently', () => {
  let state = FRESH;
  let r = loopTick({}, state, { success: false, failureClass: 'auth' });
  assert.equal(r.decision, 'CONTINUE');
  r = loopTick({}, r.updatedLoopState, { success: false, failureClass: 'auth' });
  assert.equal(r.decision, 'CONTINUE');
  assert.equal(r.updatedLoopState.sameFailureClassCount, 2);
  r = loopTick({}, r.updatedLoopState, { success: false, failureClass: 'auth' });
  assert.equal(r.decision, 'ESCALATE');
  assert.equal(r.updatedLoopState.sameFailureClassCount, 3);
  assert.match(r.reason, /same failure class three times/);
});

test('a different failure class resets the same-class counter instead of accumulating', () => {
  let state = FRESH;
  let r = loopTick({}, state, { success: false, failureClass: 'auth' });
  r = loopTick({}, r.updatedLoopState, { success: false, failureClass: 'auth' });
  assert.equal(r.updatedLoopState.sameFailureClassCount, 2);
  r = loopTick({}, r.updatedLoopState, { success: false, failureClass: 'timeout' });
  assert.equal(r.decision, 'CONTINUE');
  assert.equal(r.updatedLoopState.sameFailureClassCount, 1);
  assert.equal(r.updatedLoopState.lastFailureClass, 'timeout');
});

test('missing loopState defaults to a fresh loop instead of throwing', () => {
  const r = loopTick({}, undefined, { success: false, failureClass: 'x' });
  assert.equal(r.decision, 'CONTINUE');
  assert.equal(r.updatedLoopState.iteration, 1);
});

test('missing observation is a scoring-safe fail-closed CONTINUE-with-warning, not a throw', () => {
  const r = loopTick({}, FRESH, undefined);
  assert.equal(r.decision, 'CONTINUE');
  assert.ok(r.warnings.some((w) => /observation/.test(w)));
});

test('malformed loopSpec.maxIterations falls back to the default instead of throwing', () => {
  const r = loopTick({ maxIterations: 'not-a-number' }, FRESH, { success: false, failureClass: 'x' });
  assert.equal(r.decision, 'CONTINUE');
  assert.ok(r.warnings.some((w) => /maxIterations/.test(w)));
});

test('pure function: identical inputs give identical outputs across repeated calls', () => {
  const a = loopTick({ maxIterations: 5 }, FRESH, { success: false, failureClass: 'x' });
  const b = loopTick({ maxIterations: 5 }, FRESH, { success: false, failureClass: 'x' });
  assert.deepEqual(a, b);
});
