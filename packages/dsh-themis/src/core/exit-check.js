/**
 * Session exit check (SKILL §7, v5.5.8). Pure function.
 *
 * Five conditions a session must satisfy before it may count as finished:
 * build green, verification green (including pre-existing tests), progress
 * persisted to machine-readable state, debug artifacts cleaned, startup path
 * usable. Unknown results fail closed — a clean exit is proven, not assumed.
 *
 * @param {Record<string, unknown>} maybeState tech-lead state snapshot
 * @param {Record<string, unknown>} [maybeChecks] caller-observed booleans
 * @param {{ applicable?: unknown }} [maybeOpts] condition ids to exempt
 * @returns {{
 *   verdict: 'EXIT_CLEAN' | 'EXIT_DIRTY',
 *   conditions: Array<{ id: string, label: string, status: 'pass'|'fail'|'unknown'|'not-applicable', detail: string }>,
 *   unmet: string[],
 *   warnings: string[],
 * }}
 */
export function exitCheck(maybeState, maybeChecks = {}, maybeOpts = {}) {
  const warnings = [];
  const state = maybeState !== null && typeof maybeState === 'object' && !Array.isArray(maybeState) ? maybeState : null;
  if (state === null) warnings.push('state is missing or not an object; progress_persisted cannot be verified');
  const checks = maybeChecks !== null && typeof maybeChecks === 'object' && !Array.isArray(maybeChecks) ? maybeChecks : {};
  if (checks === null || typeof maybeChecks !== 'object' || Array.isArray(maybeChecks)) {
    warnings.push('checks is missing or not an object; every caller-observed condition is unknown');
  }
  const opts = maybeOpts !== null && typeof maybeOpts === 'object' && !Array.isArray(maybeOpts) ? maybeOpts : {};
  const applicable = Array.isArray(opts.applicable) ? opts.applicable.map((x) => String(x)) : null;
  if (opts.applicable !== undefined && applicable === null) {
    warnings.push('opts.applicable must be an array of condition ids; ignoring it');
  }

  const triBool = (value, key) => {
    if (value === true) return { status: 'pass', detail: `${key} reported true` };
    if (value === false) return { status: 'fail', detail: `${key} reported false` };
    return { status: 'unknown', detail: `${key} not reported` };
  };

  const progressPersisted = (() => {
    if (state === null) return { status: 'fail', detail: 'state is not an object' };
    const updated = typeof state.updated_at === 'string' ? state.updated_at.trim() : '';
    if (!updated) return { status: 'fail', detail: 'state.updated_at is empty — progress not persisted' };
    return { status: 'pass', detail: `state.updated_at = ${updated}` };
  })();

  const definitions = [
    { id: 'build', label: 'Build passes', ...triBool(checks.buildPassed, 'buildPassed') },
    { id: 'verification', label: 'Verification green incl. pre-existing tests', ...triBool(checks.verificationGreen, 'verificationGreen') },
    { id: 'progress_persisted', label: 'Progress persisted to machine-readable state', ...progressPersisted },
    { id: 'artifacts_clean', label: 'Debug artifacts cleaned', ...triBool(checks.debugArtifactsClean, 'debugArtifactsClean') },
    { id: 'startup_path', label: 'Startup path usable from repository alone', ...triBool(checks.startupPathUsable, 'startupPathUsable') },
  ];

  const conditions = definitions.map((d) => {
    if (applicable !== null && applicable.includes(d.id)) {
      return { ...d, status: 'not-applicable', detail: 'exempted via opts.applicable' };
    }
    return d;
  });

  const unmet = conditions.filter((c) => c.status === 'fail' || c.status === 'unknown').map((c) => c.id);
  return {
    verdict: unmet.length ? 'EXIT_DIRTY' : 'EXIT_CLEAN',
    conditions,
    unmet,
    warnings,
  };
}
