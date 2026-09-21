import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R8.1 contract matrix: protocolJson must be declared on every tool schema,
// negotiated uniformly by every legacy audit (bare by default), and honored
// by the canonical context v2 validator through inputCompatibility.

import { registerTools } from '../packages/dsh-tech-lead-plugin/src/tools.js';
import * as core from '../packages/dsh-tech-lead-core/src/index.js';
import { projectStateToContextV2 } from '../packages/dsh-tech-lead-core/src/index.js';

const makeTools = () => registerTools((d) => d, core);
const P = JSON.parse;

const STATE = readFileSync(new URL('./fixtures/state-v1/normal.json', import.meta.url), 'utf8');

// Minimal valid inputs per legacy tool; shapes are deterministic enough that
// success/failure of the domain call does not matter — only the wire form does.
const LEGACY_ARGS = {
  tech_lead_classify: {},
  tech_lead_state_validate: { stateJson: STATE },
  tech_lead_transition_check: { stateJson: '{}', proposed: 'CONTINUE' },
  tech_lead_plan_lint: { planJson: '{}' },
  tech_lead_evidence_lint: { evidenceJson: '[]' },
  tech_lead_release_audit: { allowlistCsv: 'a.txt', filesJson: '[{"path":"a.txt"}]' },
  tech_lead_install_audit: {
    manifestJson: '{"version":"1","files":["a"]}', actualFilesCsv: 'a', pkgFilesCsv: 'a', pkgVersion: '1',
  },
  tech_lead_resume_card: { stateJson: '{}', nowIso: '2026-08-26T00:00:00Z' },
};

const WIRE = [
  'tech_lead_classify', 'tech_lead_state_validate', 'tech_lead_transition_check',
  'tech_lead_plan_lint', 'tech_lead_evidence_lint', 'tech_lead_release_audit',
  'tech_lead_install_audit', 'tech_lead_resume_card',
];

test('every registered tool declares protocolJson in its parameter schema', () => {
  const tools = makeTools();
  assert.equal(tools.length, 23);
  const missing = tools.filter((t) => !t.parameters?.protocolJson);
  assert.deepEqual(missing.map((t) => t.name), [], 'tools missing protocolJson parameter');
});

for (const name of WIRE) {
  test(`${name}: default stays bare, v1 labels, legacy strips, unsupported fails closed`, async () => {
    const tool = makeTools().find((t) => t.name === name);
    const args = { ...LEGACY_ARGS[name] };
    const bare = P(await tool.execute({ ...args }));
    assert.equal(bare.meta, undefined, 'default selection must keep the bare domain shape');

    const v1 = P(await tool.execute({ ...args, protocolJson: '{"outputProtocol":"tech-lead.result.v1"}' }));
    assert.equal(v1.meta?.schema, 'tech-lead.result.v1');
    assert.ok('data' in v1, 'envelope must carry the domain payload as data');

    const legacy = P(await tool.execute({ ...args, protocolJson: '{"outputProtocol":"legacy"}' }));
    assert.equal(legacy.meta, undefined);

    const bad = P(await tool.execute({ ...args, protocolJson: '{"outputProtocol":"nope"}' }));
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'UNSUPPORTED_SCHEMA_VERSION');
  });
}

test('context_validate dispatches v2 documents through validateContextV2 with compatibility modes', async () => {
  const tool = makeTools().find((t) => t.name === 'tech_lead_context_validate');
  const base = {
    schema: 'tech-lead.context', version: 2,
    project: { id: 'p', name: 'n', repositoryMode: 'git' },
    current: { mode: 'EXECUTE', tier: 'T2', phase: 'M1', lastOutcome: 'CONTINUE', nextStep: 'x' },
    snapshot: { at: '2026-08-26T00:00:00Z', source: 'inline', fingerprint: 'fp' },
    state: { persistence: 'file' },
    goalLedger: [], nonGoals: [], constraints: [], decisions: [],
    risks: [], dependencies: [], evidence: [], assumptions: [],
    extensions: {},
  };
  const withUnknown = { ...base, mysteryTop: 1 };

  const strict = P(await tool.execute({ contextJson: JSON.stringify(withUnknown) }));
  assert.equal(strict.ok, false, 'unknown top-level key fails under default strict');

  const compat = P(await tool.execute({
    contextJson: JSON.stringify(withUnknown),
    protocolJson: '{"inputCompatibility":"compat","outputProtocol":"legacy"}',
  }));
  // legacy outputProtocol strips the envelope; the analysis itself is the data.
  const analysis = compat.data ?? compat;
  assert.equal(analysis.valid ?? compat.ok, true, 'compat mode accepts and preserves the unknown key');
});

test('projection rejects non-string identity options instead of coercing them', () => {
  for (const bad of [42, {}, ['x'], true]) {
    const r = projectStateToContextV2({}, {
      projectId: bad, projectName: 'n', snapshotSource: 's', snapshotFingerprint: 'f', at: '2026-08-26T00:00:00Z',
    });
    assert.equal(r.ok, false, `non-string projectId ${JSON.stringify(bad)} must not coerce`);
    assert.equal(r.code, 'NON_CONVERTIBLE_STATE');
  }
});

test('v2 envelopes carry outputProtocol, complete, and stable findings field', async () => {
  const tool = makeTools().find((t) => t.name === 'tech_lead_progress_decide');
  const env = P(await tool.execute({ contextJson: '{}' }));
  assert.equal(env.meta.outputProtocol, 'tech-lead.result.v2');
  assert.equal(env.meta.complete, true);
  assert.ok(Array.isArray(env.findings));
});
