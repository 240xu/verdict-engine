// R7 capability metadata v2: descriptive guidance fields only. Metadata can
// never alter computation; nextTools are validated against the actually
// registered tool set by getCapabilities({registeredNames}).

const RAW = [
  ['tech_lead_classify', 'classification', 'primitive+csv', 'medium', 'starter', [], ['Tier'], ['tech_lead_context_validate'], 'T0/T1/T2 is a routing hint, not a verdict.'],
  ['tech_lead_state_validate', 'state', 'json-string', 'medium', 'planning', ['StateV1'], ['ValidationReport'], ['tech_lead_resume_card'], 'Invalid state means the snapshot cannot be trusted, not that the tool failed.'],
  ['tech_lead_transition_check', 'state', 'json-string+primitive', 'high', 'planning', ['StateV1'], ['TransitionVerdict'], [], 'A denied outcome lists requiredStateChanges instead of blocking silently.'],
  ['tech_lead_plan_lint', 'planning', 'json-string', 'medium', 'planning', ['PlanDraft'], ['Findings'], [], 'Lint findings are advisory; fix them before freezing milestones.'],
  ['tech_lead_evidence_lint', 'evidence', 'json-string+primitive', 'high', 'evidence', ['Evidence[]'], ['Findings'], ['tech_lead_evidence_freshness'], 'Missing provenance makes an E-claim unusable as gate support.'],
  ['tech_lead_gate_precheck', 'gates', 'json-string', 'high', 'gate', ['GateInput'], ['GatePrecheck'], ['tech_lead_gate_aggregate'], 'ok:true with pass:false is a governance answer, not a tool error.'],
  ['tech_lead_release_audit', 'release', 'json-string+csv', 'high', 'release', ['FileInventory'], ['AuditFindings'], [], 'A truncated audit fails closed; partial output never certifies a release.'],
  ['tech_lead_install_audit', 'installation', 'json-string+csv', 'high', 'release', ['Manifest'], ['InstallAudit'], [], 'Unmanaged files drift silently unless audited against the manifest.'],
  ['tech_lead_resume_card', 'reconcile', 'json-string+primitive', 'medium', 'resume', ['StateV1'], ['ResumeCard'], ['tech_lead_progress_decide'], 'Without nowIso the card runs on the runtime clock and says so.'],
  ['tech_lead_exit_check', 'reconcile', 'json-string', 'medium', 'exit', ['StateV1', 'ExitChecks'], ['ExitCheckReport'], ['tech_lead_state_validate'], 'Unknown check results fail closed; a clean exit is proven, not assumed.'],
  ['tech_lead_context_validate', 'context', 'json-string', 'medium', 'starter', ['ContextSnapshot'], ['ValidationReport'], ['tech_lead_evidence_graph_lint'], 'The validated inline snapshot stays the single source of truth.'],
  ['tech_lead_evidence_graph_lint', 'evidence', 'json-string', 'high', 'evidence', ['ContextSnapshot'], ['GraphReport'], ['tech_lead_evidence_freshness'], 'Broken references poison every downstream freshness verdict.'],
  ['tech_lead_evidence_freshness', 'evidence', 'json-string', 'high', 'evidence', ['ContextSnapshot'], ['FreshnessReport'], ['tech_lead_progress_decide'], 'Stale evidence pauses progress until refreshed against the fingerprint.'],
  ['tech_lead_assumption_register', 'context', 'json-string', 'medium', 'evidence', ['ContextSnapshot'], ['AssumptionItems'], ['tech_lead_progress_decide'], 'Assumptions without verification methods are quarantined, not trusted.'],
  ['tech_lead_progress_decide', 'progress', 'json-string', 'high', 'starter', ['ContextSnapshot'], ['LifecycleOutcome', 'Guidance'], ['tech_lead_gate_plan'], 'PAUSE/PIVOT are valid analyses with ordered doneWhen actions.'],
  ['tech_lead_critical_path', 'progress', 'json-string', 'high', 'planning', ['Tasks', 'Edges'], ['ReadinessWaves'], [], 'Topological readiness only — not duration-weighted CPM.'],
  ['tech_lead_change_impact', 'impact', 'json-string', 'high', 'gate', ['Change', 'ContextSnapshot'], ['ImpactReport'], ['tech_lead_gate_plan'], 'High impact reopens gates; triggeredBy shows which rule fired.'],
  ['tech_lead_resume_reconcile', 'reconcile', 'json-string', 'high', 'resume', ['Snapshot', 'Snapshot'], ['DriftReport'], ['tech_lead_progress_decide'], 'Drift is information, not failure; changedKeys localize it.'],
  ['tech_lead_gate_plan', 'gates', 'json-string', 'high', 'gate', ['Impact', 'ContextSnapshot'], ['GatePlan'], ['tech_lead_gate_aggregate'], 'closurePlan.passWhen states exactly what a passing round looks like.'],
  ['tech_lead_gate_aggregate', 'gates', 'json-string', 'high', 'gate', ['Reports', 'GatePlan'], ['GateVerdict', 'Guidance'], ['tech_lead_gate_reopen', 'tech_lead_progress_decide'], 'conditional/reject verdicts block the gate; closure actions say how to unblock.'],
  ['tech_lead_gate_reopen', 'gates', 'json-string', 'high', 'gate', ['Fingerprints', 'Fingerprints'], ['ReopenReport'], ['tech_lead_gate_plan'], 'Fingerprint drift reopens previously passed gates.'],
  ['tech_lead_mutation_preview', 'mutation', 'json-string', 'high', 'mutation-preview', ['MutationIntent'], ['PreviewReport'], ['tech_lead_change_impact'], 'Preview-only forever: execution modes are denied and over-budget scans fail closed.'],
  ['tech_lead_capabilities', 'discovery', 'primitive', 'low', 'discovery', [], ['CapabilityCatalog'], [], 'Returns only descriptors for tools registered in this very bundle.'],
].map(([name, domain, inputMode, risk, recipe, requires, produces, nextTools, decisionMeaning]) => Object.freeze({
  name,
  version: '2',
  domain,
  sideEffects: false,
  inputMode,
  risk,
  recommendedWhen: [],
  requires,
  produces,
  nextTools,
  recipe,
  decisionMeaning,
}));

const RECIPES = [...new Set(RAW.map((entry) => entry.recipe))].sort();
const DOMAINS = [...new Set(RAW.map((entry) => entry.domain))].sort();

export function capabilityFilterValues() {
  return { recipes: RECIPES.slice(), domains: DOMAINS.slice() };
}

export function getCapabilities({ registeredNames } = {}) {
  const allowed = Array.isArray(registeredNames) ? new Set(registeredNames) : null;
  return RAW.map((capability) => {
    const copy = { ...capability };
    if (allowed) {
      const reachable = copy.nextTools.filter((name) => allowed.has(name));
      if (reachable.length) copy.nextTools = reachable;
      else delete copy.nextTools;
    }
    return copy;
  });
}
