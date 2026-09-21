import { registerContextTools } from './tools/context.js';
import { registerProgressTools } from './tools/progress.js';
import { registerGateTools } from './tools/gates.js';
import { registerMutationTools } from './tools/mutation.js';
import { registerDiscoveryTools } from './tools/discovery.js';
import { errorEnvelope, okEnvelope } from './core/index.js';
import { applyProtocol, parseBoundedJson, renderEnvelope } from './protocol.js';

/**
 * Tool definitions for the tech-lead read-only surface.
 *
 * Every tool computes over caller-supplied primitives/JSON strings:
 * - composite inputs arrive as JSON strings (parsed defensively),
 * - list inputs arrive as comma-separated values,
 * - outputs are pretty-printed JSON strings (uniform string schema); malformed inputs yield structured BAD_INPUT/invalid results instead of throws.
 * - Legacy tools return BARE domain shapes except tech_lead_gate_precheck, which projects onto a tech-lead.result.v1 envelope preserving data.pass/data.violations. Bare top-level finding arrays slice silently at 500 entries (shape preserved, no warning field exists).
 * - All rendered output is clamped: finding/error arrays are capped at 500 entries (FINDINGS_TRUNCATED warning appended), oversized caller-echo arrays collapse into {truncated,total}, and payloads above 256KB switch to compact serialization.
 *
 * No tool touches the filesystem, spawns processes, or performs network I/O.
 *
 * @param {Function} defineTool harness tool factory
 * @param {Record<string, Function>} core pure validators (inlined under src/core in the published artifact)
 */
export function registerTools(defineTool, core) {
  // Registered tool names feed capability discovery so nextTools never
  // advertises an entry point this bundle does not actually carry.
  // Legacy bare-shape helper: same {ok,error:string} contract, now bounded.
  // Budget failures surface their message inside the existing domain-invalid shapes.
  const json = (field, str, profile = 'default') => {
    const r = parseBoundedJson(field, str, profile);
    return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error.message };
  };
  const csv = (str) =>
    String(str ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = (value) => renderEnvelope(value);

  // Legacy audits cannot carry completeness metadata in their bare-array shape,
  // so an over-window result fails closed instead of being silently sliced.
  const AUDIT_WINDOW = 500;
  const auditWindow = (findings, operation) => {
    if (!Array.isArray(findings) || findings.length <= AUDIT_WINDOW) return findings;
    return errorEnvelope(operation, 'SCAN_INCOMPLETE', [{
      code: 'SCAN_INCOMPLETE',
      path: '/',
      message: `${findings.length} findings exceed the ${AUDIT_WINDOW}-entry audit window; result is not certifiable`,
      details: { observed: findings.length, limit: AUDIT_WINDOW },
    }], { legacy: findings.slice(0, AUDIT_WINDOW) });
  };

  // Every tool advertises protocolJson so schema-driven harnesses can discover
  // result negotiation; the wire default stays per-tool-class (see applyProtocol).
  const PROTOCOL_PARAM = {
    type: 'string',
    description: 'Result wire protocol: legacy | tech-lead.result.v1 | tech-lead.result.v2 (default per tool class)',
  };
  const def = (spec) => defineTool({
    ...spec,
    parameters: { ...(spec.parameters || {}), protocolJson: PROTOCOL_PARAM },
  });
  // Fail-closed envelopes (auditWindow SCAN_INCOMPLETE) pass through untouched;
  // domain payloads negotiate per protocolJson with a bare legacy default.
  const legacyOut = (payload, args, op) =>
    payload && typeof payload === 'object' && payload.meta && payload.ok === false
      ? payload
      : applyProtocol(payload, args, op, { defaultSelection: 'legacy' });

  /** @type {ReturnType<defineTool>[]} */
  const tools = [];

  tools.push(def({
    name: 'tech_lead_classify',
    description:
      'Classify a task into tech-lead tiers T0/T1/T2 with reasons. T2 involves multi-module work, irreversible ops, protected assets (user data/secrets/runtime), or public interfaces. Use before planning.',
    parameters: {
      touchesMultipleModules: { type: 'boolean', description: 'change spans ≥2 modules' },
      estimatedDays: { type: 'number', description: 'rough duration in days' },
      irreversibleOps: { type: 'string', description: 'comma-separated irreversible operations' },
      protectedAssetTypes: { type: 'string', description: 'comma-separated among SOURCE,USER_DATA,CONFIG,SECRET,RUNTIME,GENERATED' },
      publicInterfaceChange: { type: 'boolean', description: 'changes public API/contract' },
      uncertainRisk: { type: 'boolean', description: 'risk level cannot be determined yet' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const provided = [args.touchesMultipleModules, args.estimatedDays, args.irreversibleOps, args.protectedAssetTypes, args.publicInterfaceChange, args.uncertainRisk];
      const input = provided.every((v) => v === undefined || v === '')
        ? {}
        : {
            touchesMultipleModules: args.touchesMultipleModules,
            estimatedDays: args.estimatedDays,
            irreversibleOps: csv(args.irreversibleOps),
            protectedAssetTypes: csv(args.protectedAssetTypes),
            publicInterfaceChange: args.publicInterfaceChange,
            uncertainRisk: args.uncertainRisk,
          };
      return out(legacyOut(core.classify(input), args, 'classify'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_state_validate',
    description:
      'Validate a tech-lead project state.json (schema v1): enum fields, non-empty anchors on done items, full evidence provenance (id/level E0-E4/source/time/scope/repro). Unknown fields preserved as warnings. Returns pretty-printed JSON string.',
    parameters: {
      stateJson: { type: 'string', required: true, description: 'state.json SERIALIZED AS A STRING — pass the JSON text itself, never a nested object' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('stateJson', args.stateJson, 'state');
      if (!parsed.ok) return out(applyProtocol({ valid: false, errors: [{ path: 'stateJson', message: parsed.error }], warnings: [], unknownFields: [] }, args, 'state_validate', { defaultSelection: 'legacy' }));
      return out(applyProtocol(core.validateState(parsed.value), args, 'state_validate', { defaultSelection: 'legacy' }));
    },
  }));

  tools.push(def({
    name: 'tech_lead_transition_check',
    description:
      'Check whether a proposed outcome transition (CONTINUE/PAUSE/SCOPE-DOWN/PIVOT/STOP) is mechanically justified by the given state. PIVOT needs recorded decisions; SCOPE-DOWN needs goal ledger + risks; STOP needs anchored done items or degraded_reason. Returns pretty-printed JSON string.',
    parameters: {
      stateJson: { type: 'string', required: true, description: 'current state object SERIALIZED AS A STRING (JSON text, not an object)' },
      proposed: { type: 'string', required: true, description: 'one of CONTINUE,PAUSE,SCOPE-DOWN,PIVOT,STOP' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('stateJson', args.stateJson, 'state');
      if (!parsed.ok) return out(legacyOut({ allowed: false, reason: parsed.error }, args, 'transition_check'));
      return out(legacyOut(core.transitionCheck(parsed.value, args.proposed), args, 'transition_check'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_plan_lint',
    description:
      'Lint a plan for the tech-lead minimum contracts: goal+metric+target ledger, assumption verification methods, decision alternatives+reasons, risk impacts+mitigations, dependency blockers, rollback for irreversible ops. Returns pretty-printed JSON array of findings.',
    parameters: {
      planJson: { type: 'string', required: true, description: 'plan object SERIALIZED AS A STRING (JSON text, not an object)' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('planJson', args.planJson);
      if (!parsed.ok) return out(legacyOut([{ severity: 'error', path: 'planJson', message: parsed.error }], args, 'plan_lint'));
      return out(legacyOut(auditWindow(core.planLint(parsed.value), 'plan_lint'), args, 'plan_lint'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_evidence_lint',
    description:
      'Lint evidence entries for complete provenance (id/level E0-E4/source/time/scope/repro). With highRiskChange=true, requires at least one E3+ evidence item. Returns pretty-printed JSON findings array.',
    parameters: {
      evidenceJson: { type: 'string', required: true, description: 'evidence array SERIALIZED AS A STRING (JSON text, not an object)' },
      highRiskChange: { type: 'boolean', description: 'set true for high-risk changes' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('evidenceJson', args.evidenceJson, 'release');
      if (!parsed.ok) return out(legacyOut([{ severity: 'error', path: 'evidenceJson', message: parsed.error }], args, 'evidence_lint'));
      return out(legacyOut(auditWindow(core.evidenceLint(parsed.value, { highRiskChange: args.highRiskChange }), 'evidence_lint'), args, 'evidence_lint'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_gate_precheck',
    description:
      'Precheck a gate review: referee identity separation (proposer/executor must not review), per-report anchors, verdict vocabulary (pass|conditional|reject), solo-review prohibition on destructive scope, blind-gate quorum of ≥3 distinct anchored reviewers. Returns a tech-lead.result.v1 envelope whose data carries {pass, violations[]}; supplied-but-malformed reports fail closed as BAD_REPORTS.',
    parameters: {
      inputJson: { type: 'string', required: true, description: '{proposalAuthorId?,executorId?,reviewerIds[],solo?,blindRequired?,destructiveScope[],reports[{reviewerId,verdict,anchors[]}]}' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('inputJson', args.inputJson);
      if (!parsed.ok) {
        return out(errorEnvelope('gate_precheck', 'BAD_INPUT', [{ code: 'BAD_INPUT', path: 'inputJson', message: parsed.error }], { pass: false, violations: [{ type: 'BAD_INPUT', detail: parsed.error }] }));
      }
      const result = core.gatePrecheck(parsed.value);
      return out(okEnvelope('gate_precheck', { pass: result.pass, violations: result.violations }));
    },
  }));

  tools.push(def({
    name: 'tech_lead_release_audit',
    description:
      'Audit a release set: files outside the allowlist are EXTRA_FILE; when contents are provided, scans lines for absolute home paths, token-like literals (sk-/ghp_/AKIA/xox), credential assignments — each with line numbers. Read-only; never uploads anything. Returns pretty-printed JSON findings array.',
    parameters: {
      allowlistCsv: { type: 'string', required: true, description: 'comma-separated allowed relative paths' },
      filesJson: { type: 'string', required: true, description: '[{path, content?}] as JSON string' },
      contentScan: { type: 'boolean', description: 'default true' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('filesJson', args.filesJson, 'release');
      if (!parsed.ok) return out(legacyOut([{ type: 'BAD_INPUT', path: 'filesJson', line: 0, detail: parsed.error }], args, 'release_audit'));
      return out(legacyOut(auditWindow(core.releaseAudit({
        allowlist: csv(args.allowlistCsv),
        files: parsed.value,
        contentScan: args.contentScan,
      }), 'release_audit'), args, 'release_audit'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_install_audit',
    description:
      'Detect install drift between an installed marker manifest and reality: missing managed files, unmanaged extras (backups ignored), version mismatch against the package. Returns {missingManaged[], unmanaged[], versionMismatch, newInPackage[]}.',
    parameters: {
      manifestJson: { type: 'string', required: true, description: 'marker {version, files[]} SERIALIZED AS A STRING (JSON text, not an object)' },
      actualFilesCsv: { type: 'string', required: true, description: 'comma-separated relative paths present under target' },
      pkgFilesCsv: { type: 'string', required: true, description: 'comma-separated managed paths in current package' },
      pkgVersion: { type: 'string', required: true, description: 'package version string' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('manifestJson', args.manifestJson, 'state');
      if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.files)) {
        return out(legacyOut({ missingManaged: [], unmanaged: [], versionMismatch: false, newInPackage: [], error: 'manifestJson must be {version, files[]}' }, args, 'install_audit'));
      }
      return out(legacyOut(core.installAudit(
        parsed.value,
        csv(args.actualFilesCsv),
        csv(args.pkgFilesCsv),
        args.pkgVersion
      ), args, 'install_audit'));
    },
  }));

  tools.push(def({
    name: 'tech_lead_resume_card',
    description:
      'Render a three-line resume card from a tech-lead state: position (tier/phase/mode), last outcome, next step — plus stale-evidence detection (>maxAgeDays old) and warnings for empty next_step or open gates. Returns pretty-printed JSON card.',
    parameters: {
      stateJson: { type: 'string', required: true, description: 'state object SERIALIZED AS A STRING (JSON text, not an object)' },
      nowIso: { type: 'string', description: 'reference time ISO string (defaults to real now)' },
      maxAgeDays: { type: 'number', description: 'stale threshold in days, default 7' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const parsed = json('stateJson', args.stateJson, 'state');
      if (!parsed.ok) {
        return out(legacyOut({ position: '?', lastGate: '?', nextStep: '(invalid state)', staleEvidenceIds: [], warnings: [parsed.error] }, args, 'resume_card'));
      }
      const card = core.resumeCard(parsed.value, { now: args.nowIso, maxAgeDays: args.maxAgeDays });
      const runtimeClock = !args.nowIso || Number.isNaN(Date.parse(args.nowIso));
      const cardOut = runtimeClock
        ? { ...card, warnings: [...card.warnings, 'clockSource: runtime clock — pass nowIso for deterministic output'] }
        : card;
      return out(legacyOut(cardOut, args, 'resume_card'));
    },
  }));

  if (core.validateContext && core.evidenceGraphLint && core.evidenceFreshness) {
    // Domain registration stays optional so the legacy nine-tool contract can
    // be reused by callers that supply only the original core surface.
    tools.push(...registerContextTools(def, core));
  }
  if (core.progressDecide && core.criticalPath && core.changeImpact && core.exitCheck && core.loopTick) {
    tools.push(...registerProgressTools(def, core));
  }
  if (core.gatePlan && core.gateAggregate && core.gateReopen) {
    tools.push(...registerGateTools(def, core));
  }
  if (core.previewMutation) tools.push(...registerMutationTools(def));
  if (core.getCapabilities && typeof core.getCapabilities === 'function') {
    tools.push(...registerDiscoveryTools(def, core, tools.map((tool) => tool.name)));
  }
  return tools;
}
