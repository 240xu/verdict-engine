/**
 * Governed loop-tick decision (SKILL §4.10, nomos-loop v1). Pure function.
 *
 * Mechanizes existing planning-loop prose (§4.4/§4.8/§4.9) into a decision
 * an external Automation (cron / DSH routine / GitHub Action — never run by
 * this package) can call once per tick. Each tick is an independent process
 * invocation; the caller persists `updatedLoopState` (e.g. into
 * state.json.loop) and passes it back in on the next tick.
 *
 * @param {{ maxIterations?: unknown }} maybeSpec loop-level policy
 * @param {{ iteration?: number, sameFailureClassCount?: number, lastFailureClass?: string|null }} [maybeState]
 *   caller-persisted state from the previous tick (omit/undefined for a fresh loop)
 * @param {{ success?: boolean, failureClass?: string }} [maybeObservation] this tick's result
 * @returns {{
 *   decision: 'CONTINUE' | 'STOP' | 'ESCALATE',
 *   reason: string,
 *   updatedLoopState: { iteration: number, sameFailureClassCount: number, lastFailureClass: string|null },
 *   warnings: string[],
 * }}
 */
export function loopTick(maybeSpec, maybeState, maybeObservation) {
  const warnings = [];

  const spec = maybeSpec !== null && typeof maybeSpec === 'object' ? maybeSpec : {};
  let maxIterations = 20;
  if (spec.maxIterations !== undefined) {
    const n = Number(spec.maxIterations);
    if (typeof spec.maxIterations === 'number' && Number.isFinite(n) && n > 0) maxIterations = n;
    else warnings.push('loopSpec.maxIterations must be a finite number > 0; using default 20');
  }

  const prev = maybeState !== null && typeof maybeState === 'object' ? maybeState : {};
  const prevIteration = Number.isFinite(prev.iteration) ? prev.iteration : 0;
  const prevSameCount = Number.isFinite(prev.sameFailureClassCount) ? prev.sameFailureClassCount : 0;
  const prevClass = typeof prev.lastFailureClass === 'string' ? prev.lastFailureClass : null;

  const observation = maybeObservation !== null && typeof maybeObservation === 'object' ? maybeObservation : null;
  if (observation === null) {
    warnings.push('observation is missing or not an object; treating as a non-fatal tick with no failure class');
  }
  const success = observation?.success === true;
  const failureClass = observation && typeof observation.failureClass === 'string' ? observation.failureClass : null;

  const iteration = prevIteration + 1;

  if (success) {
    return {
      decision: 'STOP',
      reason: 'goal achieved',
      updatedLoopState: { iteration, sameFailureClassCount: 0, lastFailureClass: null },
      warnings,
    };
  }

  if (iteration > maxIterations) {
    return {
      decision: 'STOP',
      reason: 'iteration budget exhausted',
      updatedLoopState: { iteration, sameFailureClassCount: prevSameCount, lastFailureClass: prevClass },
      warnings,
    };
  }

  const sameFailureClassCount = failureClass !== null && failureClass === prevClass ? prevSameCount + 1 : 1;
  const lastFailureClass = failureClass;

  if (sameFailureClassCount >= 3) {
    return {
      decision: 'ESCALATE',
      reason: 'same failure class three times running; retries are masking the problem, not fixing it',
      updatedLoopState: { iteration, sameFailureClassCount, lastFailureClass },
      warnings,
    };
  }

  return {
    decision: 'CONTINUE',
    reason: 'under budget, no escalation trigger',
    updatedLoopState: { iteration, sameFailureClassCount, lastFailureClass },
    warnings,
  };
}
