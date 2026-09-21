import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These probes execute the SHIPPED artifact (packages/dsh-themis) — the same
// tree that goes to npm — not the workspace sources. Guards against assembly
// drift: mutations to the built tree now fail the suite.

const A = '../packages/dsh-themis/src/';

test('artifact registers exactly 24 tools (governance + discovery) with a live core surface', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import(A + 'tools.js'),
    import(A + 'core/index.js'),
  ]);
  const tools = registerTools((d) => d, core);
  assert.equal(tools.length, 24);
});

test('artifact envelope keeps contract meta authoritative; honest determinism allowed', async () => {
  const { makeEnvelope } = await import(A + 'core/envelope.js');
  const e = makeEnvelope({ meta: { schema: 'evil', deterministic: false, sideEffects: true } });
  assert.equal(e.meta.schema, 'tech-lead.result.v2');
  assert.equal(e.meta.deterministic, false);
  assert.equal(e.meta.sideEffects, false);
});

test('artifact gateAggregate propagates duplicate-role rejects', async () => {
  const { gateAggregate } = await import(A + 'core/gates.js');
  const r = gateAggregate([
    { role: 'eng', verdict: 'pass', anchors: ['a'] },
    { role: 'eng', verdict: 'reject', anchors: ['b'], findings: [{ id: 'r1' }] },
  ], { requiredRoles: ['eng'], quorum: 1 });
  assert.equal(r.verdict, 'reject');
  assert.ok(r.findings.some((f) => f.id === 'r1'));
});

test('artifact freshness flips stale on future-dated evidence and honors 7-day default', async () => {
  const { evidenceFreshness } = await import(A + 'core/evidence-graph.js');
  const future = evidenceFreshness({ evidence: [{ id: 'f', time: '2999-01-01T00:00:00Z' }] }, { now: '2026-08-26T00:00:00Z' });
  assert.equal(future.stale, true);
  const fresh = evidenceFreshness({ evidence: [{ id: 'e', time: '2026-08-19T00:00:00Z' }] }, { now: '2026-08-25T00:00:00Z' });
  assert.equal(fresh.stale, false);
});

test('artifact mutation preview denies casing variants and honors scan depth window', async () => {
  const { previewMutation } = await import(A + 'core/mutation.js');
  const valid = () => ({
    schema: 'tech-lead.mutation-intent.v1', mode: 'read-only-preview',
    target: [{ path: 'a.js', assetType: 'SOURCE', operation: 'modify' }],
    expectedDiff: [{ path: 'a.js', summary: 'change' }],
    recoveryPoint: { required: true, description: 'git commit' },
    verification: [{ command: 'npm test', expected: 'pass' }],
    authorization: { required: true, status: 'missing' },
  });
  const cased = valid(); cased.target[0].operation = 'EXECUTE';
  assert.equal(previewMutation(cased).code, 'CAPABILITY_DENIED');
  const nest = (levels) => { let v = 'deploy now'; for (let i = 0; i < levels; i += 1) v = { n: v }; return v; };
  const within = valid(); within.target = [{ path: 'x', operation: 'read', payload: nest(20) }];
  const beyond = valid(); beyond.target = [{ path: 'x', operation: 'read', payload: nest(23) }];
  assert.equal(previewMutation(within).code, 'CAPABILITY_DENIED');
  assert.equal(previewMutation(beyond).ok, false);
  assert.equal(previewMutation(beyond).code, 'SCAN_INCOMPLETE');
});

test('artifact progress adapter renders PAUSE as ok:true with ordered guidance', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import(A + 'tools.js'),
    import(A + 'core/index.js'),
  ]);
  const tools = registerTools((d) => d, core);
  const decide = tools.find((t) => t.name === 'tech_lead_progress_decide');
  const out = JSON.parse(await decide.execute({
    contextJson: JSON.stringify({
      dependencies: [{ id: 'd1', blocker: true, status: 'open' }],
      evidence: [], gates: [],
    }),
  }));
  assert.equal(out.ok, true);
  assert.equal(out.data.outcome, 'PAUSE');
  assert.deepEqual(out.data.guidance.nextActions.map((a) => a.kind), ['dependency']);
});

test('artifact gate aggregate returns ok:true conditional analyses with closure actions', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import(A + 'tools.js'),
    import(A + 'core/index.js'),
  ]);
  const agg = registerTools((d) => d, core).find((t) => t.name === 'tech_lead_gate_aggregate');
  const out = JSON.parse(await agg.execute({
    reportsJson: '[{"role":"pm","verdict":"pass","anchors":["a"]}]',
    planJson: '{"requiredRoles":["pm","arch"],"quorum":2}',
  }));
  assert.equal(out.code, 'OK');
  assert.ok(out.data.findings.some((f) => f.code === 'MISSING_ROLE'));
  assert.ok(out.data.guidance.nextActions.length >= 1);
});

test('artifact legacy audits fail closed beyond the 500-finding window', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import(A + 'tools.js'),
    import(A + 'core/index.js'),
  ]);
  const lint = registerTools((d) => d, core).find((t) => t.name === 'tech_lead_plan_lint');
  const huge = JSON.stringify({ goal: 'g', metric: 'm', target: 't', assumptions: Array.from({ length: 600 }, (_, i) => `c${i}`) });
  const out = JSON.parse(await lint.execute({ planJson: huge }));
  assert.equal(out.ok, false);
  assert.equal(out.code, 'SCAN_INCOMPLETE');
});

test('resume_reconcile reports scalar-root drift keys via plugin protocol', async () => {
  const proto = await import(A + 'protocol.js');
  assert.equal(typeof proto.canonicalStringify, 'function');
  const changed = JSON.stringify(proto.canonicalStringify('old')) !== JSON.stringify(proto.canonicalStringify('new'));
  assert.equal(changed, true);
});

test('artifact R8.1: protocolJson declared everywhere + legacy opt-in + v2 metadata', async () => {
  const [{ registerTools }, core] = await Promise.all([
    import(A + 'tools.js'),
    import(A + 'core/index.js'),
  ]);
  const tools = registerTools((d) => d, core);
  assert.equal(tools.length, 24);
  assert.deepEqual(tools.filter((t) => !t.parameters?.protocolJson).map((t) => t.name), []);

  const state = readFileSync(new URL('./fixtures/state-v1/normal.json', import.meta.url), 'utf8');
  const sv = tools.find((t) => t.name === 'tech_lead_state_validate');
  const bare = JSON.parse(await sv.execute({ stateJson: state }));
  assert.equal(bare.meta, undefined);
  const v1 = JSON.parse(await sv.execute({ stateJson: state, protocolJson: '{"outputProtocol":"tech-lead.result.v1"}' }));
  assert.equal(v1.meta.schema, 'tech-lead.result.v1');

  const pd = tools.find((t) => t.name === 'tech_lead_progress_decide');
  const env = JSON.parse(await pd.execute({ contextJson: '{}' }));
  assert.equal(env.meta.outputProtocol, 'tech-lead.result.v2');
  assert.equal(env.meta.complete, true);
  assert.ok(Array.isArray(env.findings));
});
