import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities } from '../packages/dsh-tech-lead-core/src/index.js';
import { registerTools } from '../packages/dsh-tech-lead-plugin/src/tools.js';
import * as core from '../packages/dsh-tech-lead-core/src/index.js';

const makeTools = () => registerTools((d) => d, core);
const REGISTERED = makeTools().map((t) => t.name);

test('capability metadata v2 carries guidance fields with registered-only nextTools', () => {
  const caps = getCapabilities({ registeredNames: REGISTERED });
  assert.equal(caps.length, 23);
  const aggregate = caps.find((c) => c.name === 'tech_lead_gate_aggregate');
  assert.equal(aggregate.recipe, 'gate');
  assert.ok(Array.isArray(aggregate.requires) && aggregate.requires.includes('GatePlan'));
  assert.ok(aggregate.nextTools.every((n) => REGISTERED.includes(n)));
  const progress = caps.find((c) => c.name === 'tech_lead_progress_decide');
  assert.ok(typeof progress.decisionMeaning === 'string' && progress.decisionMeaning.length > 0);
});

test('unavailable nextTools are omitted rather than advertised', () => {
  const caps = getCapabilities({ registeredNames: ['tech_lead_progress_decide'] });
  const stale = caps.find((c) => c.name === 'tech_lead_evidence_lint');
  if (stale.nextTools) assert.ok(stale.nextTools.every((n) => n === 'tech_lead_progress_decide'));
});

test('discovery tool is registered and returns the bounded catalog', async () => {
  const tools = makeTools();
  const discovery = tools.find((t) => t.name === 'tech_lead_capabilities');
  assert.ok(discovery, 'tech_lead_capabilities must be a registered tool');
  const out = JSON.parse(await discovery.execute({}));
  assert.equal(out.ok, true);
  assert.equal(out.code, 'OK');
  assert.equal(out.data.capabilities.length, 23);
});

test('recipe and domain filters narrow the catalog deterministically', async () => {
  const tools = makeTools();
  const discovery = tools.find((t) => t.name === 'tech_lead_capabilities');
  const gated = JSON.parse(await discovery.execute({ recipe: 'gate' }));
  assert.ok(gated.data.capabilities.length >= 3);
  assert.ok(gated.data.capabilities.every((c) => c.recipe === 'gate'));
  const evidenceDomain = JSON.parse(await discovery.execute({ domain: 'evidence' }));
  assert.ok(evidenceDomain.data.capabilities.every((c) => c.domain === 'evidence'));
});

test('unknown filter values are BAD_INPUT at their exact path', async () => {
  const tools = makeTools();
  const discovery = tools.find((t) => t.name === 'tech_lead_capabilities');
  const badRecipe = JSON.parse(await discovery.execute({ recipe: 'nope' }));
  assert.equal(badRecipe.ok, false);
  assert.equal(badRecipe.errors[0].path, '/recipe');
});
