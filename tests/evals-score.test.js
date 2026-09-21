import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreTranscript, scoreAllEvals } from '../evals/score-core.mjs';

test('mustMatch passes when the pattern is present in the transcript', () => {
  const checks = [{ type: 'mustMatch', pattern: 'EXIT_CLEAN', label: 'reports clean verdict' }];
  const r = scoreTranscript('data.verdict = EXIT_CLEAN', checks);
  assert.equal(r.passed, true);
  assert.equal(r.results[0].ok, true);
});

test('mustMatch fails and reports which check failed when the pattern is absent', () => {
  const checks = [{ type: 'mustMatch', pattern: 'EXIT_CLEAN', label: 'reports clean verdict' }];
  const r = scoreTranscript('nothing relevant here', checks);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].label, 'reports clean verdict');
});

test('mustNotMatch fails when the forbidden pattern is present', () => {
  const checks = [{ type: 'mustNotMatch', pattern: '^Test failed$', flags: 'm', label: 'no bare failure message' }];
  const r = scoreTranscript('Something\nTest failed\nmore', checks);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].ok, false);
});

test('mustNotMatch passes when the forbidden pattern is absent', () => {
  const checks = [{ type: 'mustNotMatch', pattern: '^Test failed$', flags: 'm', label: 'no bare failure message' }];
  const r = scoreTranscript('Test failed: reason, fix', checks);
  assert.equal(r.passed, true);
});

test('all checks must pass for the eval to pass (AND semantics)', () => {
  const checks = [
    { type: 'mustMatch', pattern: 'sprint-contract', label: 'uses template' },
    { type: 'mustMatch', pattern: 'Deviation record', label: 'has deviation field' },
  ];
  const r = scoreTranscript('used sprint-contract.md but no deviation section', checks);
  assert.equal(r.passed, false);
  assert.equal(r.results.filter((x) => x.ok).length, 1);
  assert.equal(r.results.filter((x) => !x.ok).length, 1);
});

test('empty or missing checks array is a scorable no-op that passes', () => {
  const r1 = scoreTranscript('anything', []);
  assert.equal(r1.passed, true);
  assert.deepEqual(r1.results, []);
  const r2 = scoreTranscript('anything', undefined);
  assert.equal(r2.passed, true);
});

test('invalid regex in a check produces an error result instead of throwing', () => {
  const checks = [{ type: 'mustMatch', pattern: '(unclosed', label: 'broken pattern' }];
  const r = scoreTranscript('anything', checks);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].error, 'INVALID_PATTERN');
});

test('unknown check type produces an error result instead of throwing', () => {
  const checks = [{ type: 'mustFrobnicate', pattern: 'x', label: 'nonsense' }];
  const r = scoreTranscript('anything', checks);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].error, 'UNKNOWN_CHECK_TYPE');
});

test('non-string transcript is a scoring error, not a throw', () => {
  const checks = [{ type: 'mustMatch', pattern: 'x', label: 'x' }];
  const r = scoreTranscript(null, checks);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].error, 'INVALID_TRANSCRIPT');
});

test('scoreAllEvals scores each eval id against its own transcript and is order-stable', () => {
  const evalsDoc = {
    evals: [
      { id: 1, checks: [{ type: 'mustMatch', pattern: 'alpha', label: 'has alpha' }] },
      { id: 2, checks: [{ type: 'mustMatch', pattern: 'beta', label: 'has beta' }] },
    ],
  };
  const transcripts = { 1: 'alpha present', 2: 'no match here' };
  const report = scoreAllEvals(evalsDoc, transcripts);
  assert.equal(report.total, 2);
  assert.equal(report.passedCount, 1);
  assert.deepEqual(report.results.map((r) => r.id), [1, 2]);
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[1].passed, false);
});

test('scoreAllEvals reports a missing transcript as an error result, not a crash', () => {
  const evalsDoc = { evals: [{ id: 1, checks: [{ type: 'mustMatch', pattern: 'x', label: 'x' }] }] };
  const report = scoreAllEvals(evalsDoc, {});
  assert.equal(report.results[0].passed, false);
  assert.equal(report.results[0].error, 'MISSING_TRANSCRIPT');
});

test('scoreAllEvals treats an eval with no checks as skipped-pass, distinct from a scored pass', () => {
  const evalsDoc = { evals: [{ id: 5, expected_output: 'human-reviewed only' }] };
  const report = scoreAllEvals(evalsDoc, { 5: 'anything' });
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[0].skipped, true);
});

test('every check pattern in evals/evals.json compiles as a valid JS RegExp', () => {
  const doc = JSON.parse(readFileSync(new URL('../evals/evals.json', import.meta.url), 'utf8'));
  const bad = [];
  for (const ev of doc.evals) {
    for (const check of ev.checks ?? []) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(check.pattern, check.flags ?? '');
      } catch (e) {
        bad.push({ id: ev.id, pattern: check.pattern, message: e.message });
      }
    }
  }
  assert.deepEqual(bad, [], `invalid regex patterns found: ${JSON.stringify(bad)}`);
});

test('every eval in evals/evals.json is either machine-scorable or explicitly human-review-only', () => {
  const doc = JSON.parse(readFileSync(new URL('../evals/evals.json', import.meta.url), 'utf8'));
  for (const ev of doc.evals) {
    const hasChecks = Array.isArray(ev.checks) && ev.checks.length > 0;
    const hasExpectedOutput = typeof ev.expected_output === 'string' && ev.expected_output.trim().length > 0;
    assert.ok(hasChecks || hasExpectedOutput, `eval id=${ev.id} has neither checks nor expected_output`);
  }
});
