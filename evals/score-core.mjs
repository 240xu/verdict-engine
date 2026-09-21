/**
 * Deterministic, zero-dependency scoring for evals/evals.json `checks`.
 * Pure string/regex matching over a transcript — no LLM calls, no I/O.
 *
 * Check shape: { type: 'mustMatch' | 'mustNotMatch', pattern: string,
 * flags?: string, label: string }. `pattern` is a JS regex source string.
 *
 * @param {unknown} transcript agent output text to score
 * @param {unknown} checks array of check objects (see above)
 * @returns {{ passed: boolean, results: Array<{ok:boolean,label:string,type?:string,error?:string}> }}
 */
export function scoreTranscript(transcript, checks) {
  if (typeof transcript !== 'string') {
    return { passed: false, results: [{ ok: false, label: '(transcript)', error: 'INVALID_TRANSCRIPT' }] };
  }
  const list = Array.isArray(checks) ? checks : [];
  const results = list.map((check) => scoreOne(transcript, check));
  return { passed: results.every((r) => r.ok), results };
}

function scoreOne(transcript, check) {
  const label = check && typeof check.label === 'string' ? check.label : '(unlabeled check)';
  if (!check || typeof check !== 'object') {
    return { ok: false, label, error: 'INVALID_CHECK' };
  }
  const type = check.type;
  if (type !== 'mustMatch' && type !== 'mustNotMatch') {
    return { ok: false, label, type, error: 'UNKNOWN_CHECK_TYPE' };
  }
  let regex;
  try {
    regex = new RegExp(check.pattern, check.flags ?? '');
  } catch {
    return { ok: false, label, type, error: 'INVALID_PATTERN' };
  }
  const matched = regex.test(transcript);
  const ok = type === 'mustMatch' ? matched : !matched;
  return { ok, label, type };
}

/**
 * Score every eval in an evals.json document against a map of transcripts
 * keyed by eval id. Evals with no `checks` are reported as skipped-pass
 * (still human-reviewable via `expected_output`, not auto-graded).
 *
 * @param {{ evals: Array<{id:number,checks?:unknown}> }} evalsDoc
 * @param {Record<string, string>} transcripts keyed by String(id)
 * @returns {{ total: number, passedCount: number, results: Array<{id:number,passed:boolean,skipped?:boolean,error?:string,checks?:Array}> }}
 */
export function scoreAllEvals(evalsDoc, transcripts) {
  const evalsList = evalsDoc && Array.isArray(evalsDoc.evals) ? evalsDoc.evals : [];
  const bag = transcripts && typeof transcripts === 'object' ? transcripts : {};
  const results = evalsList.map((ev) => {
    const hasChecks = Array.isArray(ev.checks) && ev.checks.length > 0;
    if (!hasChecks) {
      return { id: ev.id, passed: true, skipped: true };
    }
    const transcript = bag[String(ev.id)];
    if (typeof transcript !== 'string') {
      return { id: ev.id, passed: false, error: 'MISSING_TRANSCRIPT' };
    }
    const scored = scoreTranscript(transcript, ev.checks);
    return { id: ev.id, passed: scored.passed, checks: scored.results };
  });
  return {
    total: results.length,
    passedCount: results.filter((r) => r.passed).length,
    results,
  };
}
