import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities, name, inject, apply } from '../src/index.js';

test('plugin exposes the tech-lead capability catalog without changing its entrypoint', () => {
  assert.equal(name, 'tech-lead-tools');
  assert.deepEqual(inject, ['tools']);
  assert.equal(typeof apply, 'function');
  const capabilities = getCapabilities();
  assert.equal(capabilities.length, 24);
  assert.ok(capabilities.every((item) => item.sideEffects === false));
  assert.ok(capabilities.every((item) => typeof item.recipe === 'string'));
});

test('capability catalog stays in lockstep with registered tool names', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import('../src/tools.js'),
    import('@240xu/dsh-tech-lead-core'),
  ]);
  const registered = registerTools((definition) => definition, core).map((tool) => tool.name).sort();
  const cataloged = core.getCapabilities().map((item) => item.name).sort();
  assert.deepEqual(registered, cataloged);
});
