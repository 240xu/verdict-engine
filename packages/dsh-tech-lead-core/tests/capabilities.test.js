import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities } from '../src/capabilities.js';

test('capability catalog is unique and explicitly read-only', () => {
  const capabilities = getCapabilities();
  assert.equal(capabilities.length, 24);
  assert.equal(new Set(capabilities.map((item) => item.name)).size, 24);
  for (const item of capabilities) {
    assert.equal(item.sideEffects, false);
    assert.equal(typeof item.version, 'string');
    assert.equal(typeof item.domain, 'string');
    assert.equal(typeof item.inputMode, 'string');
    assert.equal(typeof item.risk, 'string');
  }
});

test('capability catalog returns a defensive copy', () => {
  const first = getCapabilities();
  first[0].name = 'mutated';
  first.push({ name: 'extra' });
  const second = getCapabilities();
  assert.equal(second.length, 24);
  assert.notEqual(second[0].name, 'mutated');
});
