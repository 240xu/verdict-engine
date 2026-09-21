import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTools } from '../src/tools.js';
import * as core from '@240xu/dsh-tech-lead-core';

const tool = (name) => registerTools((definition) => definition, core).find((item) => item.name === name);

test('progress tools are registered', () => {
  for (const name of ['tech_lead_progress_decide', 'tech_lead_critical_path', 'tech_lead_change_impact', 'tech_lead_resume_reconcile']) assert.ok(tool(name));
});

test('progress decision reports a blocked pause', async () => {
  const result = JSON.parse(await tool('tech_lead_progress_decide').execute({ contextJson: JSON.stringify({ dependencies: [{ id: 'd1', blocker: true, status: 'open' }] }) }));
  assert.equal(result.data.outcome, 'PAUSE');
});

test('critical path tool returns graph findings', async () => {
  const result = JSON.parse(await tool('tech_lead_critical_path').execute({ tasksJson: JSON.stringify([{ id: 'a' }]), dependenciesJson: '[]' }));
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.data.parallelWindows));
});

test('progress decision rejects malformed optional options instead of throwing', async () => {
  const result = JSON.parse(await tool('tech_lead_progress_decide').execute({ contextJson: '{}', optionsJson: '{' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_INPUT');
});

test('progress decide declares its optional options parameter', () => {
  const tools = registerTools((d) => d, core);
  const tool = tools.find((t) => t.name === 'tech_lead_progress_decide');
  assert.ok(tool.parameters.optionsJson);
});

test('resume reconcile ignores key order when snapshots match semantically', async () => {
  const tools = registerTools((d) => d, core);
  const tool = tools.find((t) => t.name === 'tech_lead_resume_reconcile');
  const result = JSON.parse(await tool.execute({
    previousJson: '{"a":1,"b":2}',
    currentJson: '{"b":2,"a":1}',
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.drift, false);
});

test('critical path rejects non-array graph inputs and surfaces cycles as errors', async () => {
  const tools = registerTools((d) => d, core);
  const badType = JSON.parse(await tools.find((t) => t.name === 'tech_lead_critical_path').execute({
    tasksJson: '"str"', dependenciesJson: '[]',
  }));
  assert.equal(badType.code, 'BAD_INPUT');
  const cycled = JSON.parse(await tools.find((t) => t.name === 'tech_lead_critical_path').execute({
    tasksJson: '[{"id":"a"},{"id":"b"}]', dependenciesJson: '[{"from":"a","to":"b"},{"from":"b","to":"a"}]',
  }));
  assert.equal(cycled.code, 'SCHEMA_INVALID');
  assert.ok(cycled.errors.some((e) => e.code === 'CYCLE'));
});

test('resume reconcile names the differing top-level keys', async () => {
  const result = JSON.parse(await registerTools((d) => d, core).find((t) => t.name === 'tech_lead_resume_reconcile').execute({
    previousJson: '{"a":1,"keep":true}', currentJson: '{"a":2,"keep":true}',
  }));
  assert.equal(result.data.changedKeys.includes('a'), true);
});

test('scalar-root drift reports an explicit root key', async () => {
  const r = JSON.parse(await registerTools((d) => d, core).find((t) => t.name === 'tech_lead_resume_reconcile').execute({
    previousJson: '"old"', currentJson: '"new"',
  }));
  assert.deepEqual(r.data.changedKeys, ['<root>']);
});

test('exit check tool is registered', () => {
  assert.ok(tool('tech_lead_exit_check'));
});

test('exit check returns EXIT_CLEAN for a persisted state with all checks true', async () => {
  const result = JSON.parse(await tool('tech_lead_exit_check').execute({
    stateJson: JSON.stringify({ updated_at: '2026-09-21T00:00:00Z' }),
    checksJson: JSON.stringify({ buildPassed: true, verificationGreen: true, debugArtifactsClean: true, startupPathUsable: true }),
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.verdict, 'EXIT_CLEAN');
});

test('exit check fails closed on unreported checks and carries guidance', async () => {
  const result = JSON.parse(await tool('tech_lead_exit_check').execute({
    stateJson: JSON.stringify({ updated_at: '2026-09-21T00:00:00Z' }),
    checksJson: JSON.stringify({ buildPassed: true }),
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.verdict, 'EXIT_DIRTY');
  assert.ok(result.data.guidance.nextActions.length >= 3);
  assert.ok(result.data.guidance.nextActions.every((a) => typeof a.doneWhen === 'string'));
});

test('exit check rejects malformed checks json instead of throwing', async () => {
  const result = JSON.parse(await tool('tech_lead_exit_check').execute({ stateJson: '{}', checksJson: '{' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_INPUT');
});
