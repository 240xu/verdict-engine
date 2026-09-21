import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'

const validState = {
  schema_version: 1,
  mode: 'EXECUTE',
  tier: 'T2',
  phase: 'M1',
  repository_mode: 'git',
  done: [{ item: 'core validators', anchor: 'commit:5b2c622' }],
  evidence: [{
    id: 'E-1', level: 'E2', source: 'node --test',
    time: '2026-08-25T00:00:00Z', scope: 'core', repro: 'cd packages/dsh-tech-lead-core && node --test tests/',
  }],
  last_outcome: 'CONTINUE',
  next_step: 'composition test',
  updated_at: '2026-08-25T00:00:00Z',
}

interface Case {
  tool: string
  args: Record<string, unknown>
  expect: (result: any) => boolean
}

const cases: Case[] = [
  {
    tool: 'tech_lead_classify',
    args: { touchesMultipleModules: true },
    expect: (r) => r.tier === 'T2',
  },
  {
    tool: 'tech_lead_state_validate',
    args: { stateJson: JSON.stringify(validState) },
    expect: (r) => r.valid === true,
  },
  {
    tool: 'tech_lead_transition_check',
    args: {
      stateJson: JSON.stringify({ decisions: [], goal_ledger: [], risks: [], done: [], degraded_reason: '' }),
      proposed: 'PIVOT',
    },
    expect: (r) => r.allowed === false,
  },
  {
    tool: 'tech_lead_plan_lint',
    args: { planJson: JSON.stringify({ goal: 'g', assumptions: [] }) },
    expect: (r) => Array.isArray(r) && r.some((f: any) => f.path === 'metric'),
  },
  {
    tool: 'tech_lead_evidence_lint',
    args: {
      evidenceJson: JSON.stringify([{
        id: 'A', level: 'E2', source: 's', time: 't', scope: 'sc', repro: 'r',
      }]),
      highRiskChange: true,
    },
    expect: (r) => Array.isArray(r) && r.some((f: any) => f.severity === 'error'),
  },
  {
    tool: 'tech_lead_gate_precheck',
    args: { inputJson: JSON.stringify({ solo: true, destructiveScope: ['prod-db'] }) },
    expect: (r) => r.ok === true && r.data.pass === false && r.data.violations.some((v: any) => v.type === 'SOLO_FORBIDDEN'),
  },
  {
    tool: 'tech_lead_release_audit',
    args: { allowlistCsv: 'README.md', filesJson: JSON.stringify([{ path: 'extra.txt' }]) },
    expect: (r) => Array.isArray(r) && r[0]?.type === 'EXTRA_FILE',
  },
  {
    tool: 'tech_lead_install_audit',
    args: {
      manifestJson: JSON.stringify({ version: '5.4.0', files: ['SKILL.md'] }),
      actualFilesCsv: 'user-notes.txt',
      pkgFilesCsv: 'SKILL.md',
      pkgVersion: '5.4.0',
    },
    expect: (r) => r.unmanaged.includes('user-notes.txt') && !r.versionMismatch,
  },
  {
    tool: 'tech_lead_resume_card',
    args: { stateJson: JSON.stringify(validState), nowIso: '2026-08-25T01:00:00Z' },
    expect: (r) => r.position.includes('M1') && r.nextStep === 'composition test',
  },
  {
    tool: 'tech_lead_context_validate',
    args: { contextJson: JSON.stringify({
      schema: 'tech-lead.context.v1',
      project: { id: 'p1', name: 'composition', repositoryMode: 'git' },
      goalLedger: [{ id: 'g1', goal: 'green', metric: 'tests', target: 'pass' }],
      nonGoals: [], constraints: [], assets: [], assumptions: [], decisions: [], risks: [], dependencies: [], evidence: [], gates: [],
      current: { mode: 'EXECUTE', tier: 'T1', phase: 'M1', lastOutcome: '', nextStep: 'evidence' },
      snapshot: { at: '2026-08-25T00:00:00Z', source: 'inline', fingerprint: 'p1' },
    }) },
    expect: (r) => r.ok === true && r.code === 'OK' && r.data.valid === true,
  },
  {
    tool: 'tech_lead_evidence_graph_lint',
    args: { contextJson: JSON.stringify({ goalLedger: [{ id: 'g1' }], evidence: [{ id: 'e1', supports: ['g1'] }] }) },
    expect: (r) => r.ok === true && r.data.graph.edges.length === 1,
  },
  {
    tool: 'tech_lead_evidence_freshness',
    args: {
      contextJson: JSON.stringify({ evidence: [{ id: 'e1', time: '2026-08-01T00:00:00Z' }] }),
      optionsJson: JSON.stringify({ now: '2026-08-25T00:00:00Z', maxAgeDays: 7 }),
    },
    expect: (r) => r.ok === true && r.data.stale === true,
  },
  {
    tool: 'tech_lead_assumption_register',
    args: { contextJson: JSON.stringify({ assumptions: [{ id: 'a1', verification: 'run test' }] }) },
    expect: (r) => r.ok === true && r.data.items[0].status === 'verifiable',
  },
  {
    tool: 'tech_lead_progress_decide',
    args: { contextJson: JSON.stringify({ dependencies: [], evidence: [], gates: [] }) },
    expect: (r) => r.ok === true && r.data.outcome === 'CONTINUE',
  },
  {
    tool: 'tech_lead_critical_path',
    args: { tasksJson: JSON.stringify([{ id: 'a' }, { id: 'b' }]), dependenciesJson: JSON.stringify([{ from: 'b', to: 'a' }]) },
    expect: (r) => r.ok === true && r.data.criticalPath.includes('a'),
  },
  {
    tool: 'tech_lead_change_impact',
    args: { changeJson: JSON.stringify({ modules: ['a', 'b'], assets: ['CONFIG'], irreversible: true }), contextJson: JSON.stringify({ gates: [{ id: 'g1' }] }) },
    expect: (r) => r.ok === true && r.data.tier === 'T2' && r.data.reopenGates.includes('g1'),
  },
  {
    tool: 'tech_lead_resume_reconcile',
    args: { previousJson: JSON.stringify({ fingerprint: 'old' }), currentJson: JSON.stringify({ fingerprint: 'new' }) },
    expect: (r) => r.ok === true && r.data.drift === true && r.data.changedKeys.includes('fingerprint'),
  },
  {
    tool: 'tech_lead_gate_plan',
    args: { impactJson: JSON.stringify({ tier: 'T2', destructive: true }), contextJson: JSON.stringify({}) },
    expect: (r) => r.ok === true && r.data.quorum === 4,
  },
  {
    tool: 'tech_lead_gate_aggregate',
    args: { reportsJson: JSON.stringify([{ role: 'pm', verdict: 'pass', anchors: ['a'] }]), planJson: JSON.stringify({ requiredRoles: ['pm', 'arch'], quorum: 2 }) },
    expect: (r) => r.ok === true && r.data.pass === false && r.data.verdict === 'conditional',
  },
  {
    tool: 'tech_lead_gate_reopen',
    args: { previousJson: JSON.stringify({ contextFingerprint: 'old' }), currentJson: JSON.stringify({ contextFingerprint: 'new' }) },
    expect: (r) => r.ok === true && r.data.reopen === true,
  },
  {
    tool: 'tech_lead_mutation_preview',
    args: { intentJson: JSON.stringify({ mode: 'apply' }) },
    expect: (r) => r.ok === false && r.code === 'CAPABILITY_DENIED',
  },
  {
    tool: 'tech_lead_capabilities',
    args: {},
    expect: (r) => r.ok === true && r.data.capabilities.length === 23,
  },
]

const bad = (tool: string, args: Record<string, unknown>): Case => ({
  tool,
  args,
  expect: (r) => r.ok === false && r.code === 'BAD_INPUT',
})

const negCases: Case[] = [
  bad('tech_lead_context_validate', { contextJson: '{' }),
  bad('tech_lead_evidence_graph_lint', { contextJson: '{' }),
  bad('tech_lead_evidence_freshness', { contextJson: '{' }),
  bad('tech_lead_assumption_register', { contextJson: '{' }),
  bad('tech_lead_progress_decide', { contextJson: '{}', optionsJson: '{' }),
  bad('tech_lead_critical_path', { tasksJson: '{', dependenciesJson: '[' }),
  bad('tech_lead_change_impact', { changeJson: '{', contextJson: '{' }),
  bad('tech_lead_resume_reconcile', { previousJson: '{', currentJson: '{' }),
  bad('tech_lead_gate_plan', { impactJson: '{', contextJson: '}' }),
  bad('tech_lead_gate_aggregate', { reportsJson: '{}', planJson: '{}' }),
  bad('tech_lead_gate_reopen', { previousJson: '{', currentJson: '{' }),
  bad('tech_lead_mutation_preview', { intentJson: '{' }),
]
// Discovery filter rejection is a structured BAD_INPUT at the exact path.
const negCasesExtra: Case[] = [
  { tool: 'tech_lead_capabilities', args: { recipe: 'nope' }, expect: (r) => r.ok === false && r.errors[0].path === '/recipe' },
];

export const name = 'tech-lead-composition-driver'
export const inject = ['tools']

export function apply(ctx: Context) {
  void (async () => {
    let pass = 0
    let negPass = 0
    const failures: string[] = []
    const execute = async (c: Case): Promise<any> => {
      const result = await ctx.tools.execute({
        callId: CallId(`drv-${c.tool}`),
        name: c.tool,
        arguments: c.args,
        signal: new AbortController().signal,
      })
      const text = result.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('')
      try { return JSON.parse(text) } catch { return text }
    }
    for (const c of cases) {
      try {
        const raw = await execute(c)
        if (c.expect(raw)) { pass++; console.log(`PASS ${c.tool}`) }
        else { failures.push(`pos:${c.tool}`); console.log(`FAIL ${c.tool}: ${JSON.stringify(raw).slice(0, 240)}`) }
      } catch (err) { failures.push(`pos:${c.tool}`); console.log(`FAIL ${c.tool}: threw ${(err as Error).message}`) }
    }
    const allNeg = [...negCases, ...negCasesExtra];
    for (const c of allNeg) {
      try {
        const rawNeg = await execute(c)
        if (c.expect(rawNeg)) { negPass++; console.log(`NEG-PASS ${c.tool}`) }
        else { failures.push(`neg:${c.tool}`); console.log(`NEG-FAIL ${c.tool}: ${JSON.stringify(rawNeg).slice(0, 240)}`) }
      } catch (err) { failures.push(`neg:${c.tool}`); console.log(`NEG-FAIL ${c.tool}: threw ${(err as Error).message}`) }
    }
    console.log(`TLT-PASS ${pass}/${cases.length}`)
    console.log(`TLT-NEG ${negPass}/${allNeg.length}`)
    if (failures.length) console.log('TLT-FAILURES ' + failures.join(','))
    setTimeout(() => process.exit(failures.length ? 1 : 0), 50)
  })()
}
