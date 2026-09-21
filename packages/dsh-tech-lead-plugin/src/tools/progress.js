import { errorEnvelope, okEnvelope, makeAction, normalizeGuidance } from '@240xu/dsh-tech-lead-core';
import { applyProtocol, canonicalStringify, parseJsonFields, renderEnvelope, runGuarded } from '../protocol.js';

const BLOCKING_FINDINGS = new Set(['CYCLE', 'INVALID_TASK_ID', 'DUPLICATE_TASK_ID']);
const GUIDANCE_MODES = new Set([undefined, 'strict', 'heuristic']);

function parseOptions(rawOptionsJson, operation) {
  if (rawOptionsJson == null || rawOptionsJson === '') return { ok: true, value: {} };
  const parsed = parseJsonFields({ optionsJson: rawOptionsJson }, ['optionsJson']);
  if (!parsed.ok) return parsed;
  const value = parsed.values.optionsJson;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'BAD_INPUT', errors: [{ code: 'BAD_INPUT', path: '/optionsJson', message: 'expected a JSON object' }] };
  }
  if (!GUIDANCE_MODES.has(value.guidanceMode)) {
    return { ok: false, code: 'BAD_INPUT', errors: [{ code: 'BAD_INPUT', path: '/optionsJson/guidanceMode', message: 'guidanceMode must be "strict" or "heuristic"' }] };
  }
  return { ok: true, value };
}

function buildProgressGuidance(result, mode) {
  const actions = [];
  for (const ref of result.blockerRefs?.gate ?? []) {
    actions.push(makeAction({
      kind: 'gate',
      targetId: ref.id,
      reasonCodes: ['GATE_BLOCKED'],
      findingRef: ref.path,
      action: `Obtain a pass verdict for destructive gate "${ref.id}".`,
      doneWhen: `gates contains an entry id ${ref.id} with status 'pass'`,
      nextTool: 'tech_lead_gate_aggregate',
    }));
  }
  for (const ref of result.blockerRefs?.dependency ?? []) {
    actions.push(makeAction({
      kind: 'dependency',
      targetId: ref.id,
      reasonCodes: ['DEPENDENCY_BLOCKED'],
      findingRef: ref.path,
      action: `Resolve or replace blocking dependency "${ref.id}".`,
      doneWhen: `dependencies entry id ${ref.id} has status 'done' or blocker removed`,
    }));
  }
  for (const ref of result.blockerRefs?.evidence ?? []) {
    actions.push(makeAction({
      kind: 'evidence',
      targetId: ref.id,
      reasonCodes: ['STALE_EVIDENCE'],
      findingRef: ref.path,
      action: `Refresh stale evidence "${ref.id}" against the current snapshot.`,
      doneWhen: `evidence entry id ${ref.id} has stale !== true and its fingerprint matches the current snapshot`,
      nextTool: 'tech_lead_evidence_freshness',
    }));
  }
  for (const reason of result.reasons ?? []) {
    if (reason.code !== 'MISSING_ID') continue;
    actions.push(makeAction({
      kind: 'safety',
      targetId: reason.id,
      reasonCodes: ['MISSING_ID'],
      findingRef: reason.path,
      action: `Give the record at ${reason.path} a stable non-empty id so blockers stay auditable.`,
      doneWhen: `record at ${reason.path} has a non-empty string id`,
    }));
  }
  const meaning = result.outcome === 'PIVOT'
    ? 'Pivot requested: a falsified decision and its replacement hypothesis must be on record first.'
    : result.outcome === 'PAUSE'
      ? 'Continuing implementation would bypass an unresolved blocker.'
      : undefined;
  const guidance = normalizeGuidance({ mode, outcome: result.outcome, meaning, actions });
  guidance.resumeWhen = [
    'every priority-1 action reports its doneWhen predicate satisfied',
    ...(result.outcome === 'PAUSE' ? ['no destructive gate is left unpassed'] : []),
  ];
  return guidance;
}

export function registerProgressTools(defineTool, core) {
  const output = [];
  const register = (name, description, parameters, execute) => output.push(defineTool({ name, description, parameters, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] }, execute }));
  register('tech_lead_progress_decide', 'Decide the next lifecycle outcome (CONTINUE/PAUSE/SCOPE-DOWN/PIVOT/STOP). Every valid analysis returns ok:true; PAUSE/PIVOT carry data.guidance.nextActions (deterministic order, each with doneWhen) while ok:false is reserved for malformed or over-budget input. Trigger fields: dependencies[] pauses when an entry has blocker:true and status!=="done"; evidence[] pauses when an entry has stale:true; gates[] pauses when an entry has destructive:true and status!=="pass". optionsJson supports {forcePivot?:boolean, guidanceMode?:("strict"|"heuristic")}; heuristic mode only labels advisory heuristics and never changes strict actions.', {
    contextJson: { type: 'string', required: true, description: 'context snapshot JSON text with dependencies/evidence/gates arrays' },
    optionsJson: { type: 'string', description: 'optional JSON text ({forcePivot?:boolean, guidanceMode?:string})' },
  }, async (args) => {
    return runGuarded('progress_decide', () => {
      const input = parseJsonFields(args ?? {}, ['contextJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('progress_decide', input.code ?? 'BAD_INPUT', input.errors), args, 'progress_decide'));
      let options = {};
      let mode = 'strict';
      if (args.optionsJson != null && args.optionsJson !== '') {
        const parsedOptions = parseOptions(args.optionsJson, 'progress_decide');
        if (!parsedOptions.ok) return renderEnvelope(applyProtocol(errorEnvelope('progress_decide', parsedOptions.code ?? 'BAD_INPUT', parsedOptions.errors), args, 'progress_decide'));
        options = parsedOptions.value;
        if (options.guidanceMode) mode = options.guidanceMode;
      }
      const result = core.progressDecide(input.values.contextJson, options);
      if (result.outcome === 'CONTINUE') return renderEnvelope(applyProtocol(okEnvelope('progress_decide', result), args, 'progress_decide'));
      const enriched = { ...result, guidance: buildProgressGuidance(result, mode) };
      return renderEnvelope(applyProtocol(okEnvelope('progress_decide', enriched), args, 'progress_decide'));
    });
  });
  register('tech_lead_critical_path', 'Compute blockers, critical path, cycles (with cycleNodes), parallel windows, and readiness waves (readyNow/nextWave). scheduleSemantics is topological-readiness-not-duration-criticality — this is not duration-weighted CPM. Graph findings (CYCLE / INVALID_TASK_ID / DUPLICATE_TASK_ID) are returned under code SCHEMA_INVALID.', {
    tasksJson: { type: 'string', required: true, description: '[{id,status?,blocker?}] as JSON text' },
    dependenciesJson: { type: 'string', required: true, description: '[{from,to}] edge list as JSON text; `to` is the prerequisite and `from` depends on it' },
    optionsJson: { type: 'string', description: 'optional JSON text ({guidanceMode?:string}); validated but advisory-only for this tool' },
  }, async (args) => {
    return runGuarded('critical_path', () => {
      const input = parseJsonFields(args ?? {}, ['tasksJson', 'dependenciesJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('critical_path', input.code ?? 'BAD_INPUT', input.errors), args, 'critical_path'));
      const errors = [];
      if (!Array.isArray(input.values.tasksJson)) errors.push({ code: 'BAD_INPUT', path: 'tasksJson', message: 'expected JSON array of tasks' });
      if (!Array.isArray(input.values.dependenciesJson)) errors.push({ code: 'BAD_INPUT', path: 'dependenciesJson', message: 'expected JSON array of edges' });
      if (args.optionsJson != null && args.optionsJson !== '') {
        const parsedOptions = parseOptions(args.optionsJson, 'critical_path');
        if (!parsedOptions.ok) return renderEnvelope(applyProtocol(errorEnvelope('critical_path', parsedOptions.code ?? 'BAD_INPUT', parsedOptions.errors), args, 'critical_path'));
      }
      if (errors.length) return renderEnvelope(applyProtocol(errorEnvelope('critical_path', 'BAD_INPUT', errors), args, 'critical_path'));
      const result = core.criticalPath(input.values.tasksJson, input.values.dependenciesJson);
      const blocking = result.findings.filter((f) => BLOCKING_FINDINGS.has(f.code));
      if (blocking.length) {
        return renderEnvelope(applyProtocol(errorEnvelope('critical_path', 'SCHEMA_INVALID', result.findings.map((f) => ({ ...f, code: f.code })), result), args, 'critical_path'));
      }
      return renderEnvelope(applyProtocol(okEnvelope('critical_path', result), args, 'critical_path'));
    });
  });
  register('tech_lead_change_impact', 'Classify change impact (T0/T1/T2), reversibility, and Gate reopen requirements without applying the change. Returns triggeredBy provenance and per-gate reopen actions. Trigger fields: irreversible (any truthy), publicInterface, modules[], assets[].', {
    changeJson: { type: 'string', required: true, description: '{modules?:string[],assets?:string[],irreversible?,publicInterface?} as JSON text' },
    contextJson: { type: 'string', required: true, description: 'context snapshot JSON text ({gates?:[{id}]})' },
  }, async (args) => {
    return runGuarded('change_impact', () => {
      const input = parseJsonFields(args ?? {}, ['changeJson', 'contextJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('change_impact', input.code ?? 'BAD_INPUT', input.errors), args, 'change_impact'));
      return renderEnvelope(applyProtocol(okEnvelope('change_impact', core.changeImpact(input.values.changeJson, input.values.contextJson)), args, 'change_impact'));
    });
  });
  register('tech_lead_resume_reconcile', 'Compare two inline snapshots key-order-insensitively and report deterministic drift with the differing top-level keys. Drift is a valid analysis (ok:true, data.drift=true), not a tool failure.', {
    previousJson: { type: 'string', required: true, description: 'previous snapshot JSON text' },
    currentJson: { type: 'string', required: true, description: 'current snapshot JSON text' },
  }, async (args) => {
    return runGuarded('resume_reconcile', () => {
      const input = parseJsonFields(args ?? {}, ['previousJson', 'currentJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('resume_reconcile', input.code ?? 'BAD_INPUT', input.errors), args, 'resume_reconcile'));
      const previous = canonicalStringify(input.values.previousJson);
      const current = canonicalStringify(input.values.currentJson);
      const changed = JSON.stringify(previous) !== JSON.stringify(current);
      if (!changed) return renderEnvelope(applyProtocol(okEnvelope('resume_reconcile', { drift: false }), args, 'resume_reconcile'));
      const changedKeys = computeChangedKeys(previous, current);
      return renderEnvelope(applyProtocol(okEnvelope('resume_reconcile', { drift: true, changedKeys }), args, 'resume_reconcile'));
    });
  });
  register('tech_lead_exit_check', 'Decide whether a session may exit clean (SKILL §7): five conditions — build passes, verification green incl. pre-existing tests, progress persisted (state.updated_at non-empty), debug artifacts cleaned, startup path usable. Unreported checks fail closed (status "unknown" counts as unmet); every valid analysis returns ok:true with data.verdict EXIT_CLEAN|EXIT_DIRTY; ok:false is reserved for malformed or over-budget input. optionsJson supports {applicable?:string[], guidanceMode?:("strict"|"heuristic")}; dirty verdicts carry data.guidance.nextActions with per-condition doneWhen predicates.', {
    stateJson: { type: 'string', required: true, description: 'tech-lead state snapshot JSON text (at minimum {updated_at})' },
    checksJson: { type: 'string', description: 'caller-observed booleans JSON text: {buildPassed?,verificationGreen?,debugArtifactsClean?,startupPathUsable?}' },
    optionsJson: { type: 'string', description: 'optional JSON text ({applicable?:string[], guidanceMode?:string})' },
  }, async (args) => {
    return runGuarded('exit_check', () => {
      const input = parseJsonFields(args ?? {}, ['stateJson', 'checksJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('exit_check', input.code ?? 'BAD_INPUT', input.errors), args, 'exit_check'));
      let options = {};
      let mode = 'strict';
      if (args.optionsJson != null && args.optionsJson !== '') {
        const parsedOptions = parseOptions(args.optionsJson, 'exit_check');
        if (!parsedOptions.ok) return renderEnvelope(applyProtocol(errorEnvelope('exit_check', parsedOptions.code ?? 'BAD_INPUT', parsedOptions.errors), args, 'exit_check'));
        options = parsedOptions.value;
        if (options.guidanceMode) mode = options.guidanceMode;
      }
      const result = core.exitCheck(input.values.stateJson, input.values.checksJson ?? {}, options);
      if (result.verdict === 'EXIT_CLEAN') return renderEnvelope(applyProtocol(okEnvelope('exit_check', result), args, 'exit_check'));
      const enriched = { ...result, guidance: buildExitGuidance(result, mode) };
      return renderEnvelope(applyProtocol(okEnvelope('exit_check', enriched), args, 'exit_check'));
    });
  });
  register('tech_lead_loop_tick', 'Decide whether a governed loop should CONTINUE, STOP, or ESCALATE for one tick (SKILL §4.10, nomos-loop). Mechanizes existing planning-loop prose: success stops as goal achieved; exceeding maxIterations (default 20) stops as budget exhausted; the same failureClass three ticks running escalates instead of retrying silently. This tool never schedules or runs anything — an external Automation (cron/DSH routine/GitHub Action) calls it once per tick and persists updatedLoopState (e.g. into state.json.loop) for the next call. ESCALATE carries data.guidance.nextActions.', {
    loopSpecJson: { type: 'string', description: 'optional JSON text ({maxIterations?:number}); default maxIterations is 20' },
    loopStateJson: { type: 'string', required: true, description: 'previous tick state JSON text {iteration?,sameFailureClassCount?,lastFailureClass?}; {} for a fresh loop' },
    observationJson: { type: 'string', required: true, description: 'this tick result JSON text {success?:boolean,failureClass?:string}' },
    optionsJson: { type: 'string', description: 'optional JSON text ({guidanceMode?:string})' },
  }, async (args) => {
    return runGuarded('loop_tick', () => {
      const input = parseJsonFields(args ?? {}, ['loopSpecJson', 'loopStateJson', 'observationJson']);
      if (!input.ok) return renderEnvelope(applyProtocol(errorEnvelope('loop_tick', input.code ?? 'BAD_INPUT', input.errors), args, 'loop_tick'));
      let mode = 'strict';
      if (args.optionsJson != null && args.optionsJson !== '') {
        const parsedOptions = parseOptions(args.optionsJson, 'loop_tick');
        if (!parsedOptions.ok) return renderEnvelope(applyProtocol(errorEnvelope('loop_tick', parsedOptions.code ?? 'BAD_INPUT', parsedOptions.errors), args, 'loop_tick'));
        if (parsedOptions.value.guidanceMode) mode = parsedOptions.value.guidanceMode;
      }
      const result = core.loopTick(input.values.loopSpecJson, input.values.loopStateJson, input.values.observationJson);
      if (result.decision === 'CONTINUE' || result.decision === 'STOP') {
        return renderEnvelope(applyProtocol(okEnvelope('loop_tick', result), args, 'loop_tick'));
      }
      const enriched = { ...result, guidance: buildLoopGuidance(result, mode) };
      return renderEnvelope(applyProtocol(okEnvelope('loop_tick', enriched), args, 'loop_tick'));
    });
  });
  return output;
}

function buildLoopGuidance(result, mode) {
  const actions = [makeAction({
    kind: 'hygiene',
    targetId: 'loop',
    reasonCodes: ['SAME_FAILURE_CLASS_ESCALATED'],
    findingRef: 'updatedLoopState/lastFailureClass',
    action: `Stop retrying failure class "${result.updatedLoopState.lastFailureClass}" unchanged; diagnose the root cause or run a smaller falsifying experiment before the next tick.`,
    doneWhen: 'the next observation reports success:true or a different failureClass',
  })];
  return normalizeGuidance({
    mode,
    outcome: 'PAUSE',
    meaning: result.reason,
    actions,
  });
}

const EXIT_FIX = {
  build: 'Run the build command and record its observed result as checksJson.buildPassed.',
  verification: 'Run the full verification suite including pre-existing tests and record checksJson.verificationGreen.',
  progress_persisted: 'Persist progress to machine-readable state (non-empty state.updated_at) before exiting.',
  artifacts_clean: 'Remove debug artifacts (temporary logs, commented-out code, TODO markers) and record checksJson.debugArtifactsClean.',
  startup_path: 'Verify a fresh session can start from the repository alone and record checksJson.startupPathUsable.',
};

function buildExitGuidance(result, mode) {
  const actions = result.conditions
    .filter((c) => c.status === 'fail' || c.status === 'unknown')
    .map((c) => makeAction({
      kind: 'hygiene',
      targetId: c.id,
      reasonCodes: ['EXIT_DIRTY'],
      findingRef: `conditions/${c.id}`,
      action: EXIT_FIX[c.id] ?? `Satisfy condition "${c.id}" (${c.label}).`,
      doneWhen: c.id === 'progress_persisted'
        ? 'state.updated_at is a non-empty string at exit time'
        : `checksJson.${c.id === 'build' ? 'buildPassed' : c.id === 'verification' ? 'verificationGreen' : c.id === 'artifacts_clean' ? 'debugArtifactsClean' : 'startupPathUsable'} is true on the next exit_check call`,
    }));
  return normalizeGuidance({
    mode,
    outcome: 'PAUSE',
    meaning: 'Session exit is not clean: unmet conditions must be satisfied or explicitly recorded as residual risk with a PAUSE.',
    actions,
  });
}

function computeChangedKeys(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return ['<root>'];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).sort();
}
