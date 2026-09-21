# nomos-loop v1: Governed Loop Ticks (design, self-reviewed)

**Date:** 2026-09-21
**Status:** approved (autonomous — user explicitly deferred review, tagged rollback point `pre-loop-and-evals-scoring-20260921`)

## Problem

Lecture 13 (Loop Engineering) needs three primitives: a goal, a verification
way, and a stop condition, driven by an external Automation that ticks
repeatedly. This repo already has:

- the evaluator (`tech_lead_progress_decide` — an independent stop judge for
  a single planning round)
- the memory (`state.json`, persisted externally)
- the stagnation prose (§4.4/§4.8/§4.9: same failure class 3x forces
  escalation; budget-exhaustion forces STOP)

What's missing is a way to turn **independent tick invocations** (each cron
firing is a fresh process with no shared memory except the state the caller
persists) into one governed loop with an iteration budget and a same-class
escalation rule that is mechanically checked, not just prose the agent is
trusted to remember every tick.

## Hard constraint (checked against the existing charter)

`packages/dsh-themis` and its source packages declare: "No writes, no
subprocesses, no network." Building an actual scheduler, spawning agents, or
calling out to cron/GitHub Actions from inside this package would violate
that charter and duplicate infrastructure external schedulers already
provide. **nomos-loop v1 does not build a scheduler.** It builds one more
pure, read-only decision function that an external Automation calls once per
tick, alongside `progress_decide`, and a template documenting the wiring.

## What ships

1. **Core function** `loopTick(loopSpec, loopState, observation)` in
   `packages/dsh-tech-lead-core/src/loop-tick.js`:
   - `loopSpec`: `{ maxIterations? }` (default 20 — bounded, not unlimited,
     to fail closed the same way `exitCheck` does on unreported checks).
   - `loopState`: `{ iteration?, sameFailureClassCount?, lastFailureClass? }`
     — the caller's own persisted state, read back each tick.
   - `observation`: `{ success: boolean, failureClass?: string }` for this
     tick.
   - Returns `{ decision: 'CONTINUE'|'STOP'|'ESCALATE', reason,
     updatedLoopState }`.
   - Rules (mechanizing existing prose, not inventing new policy):
     - `success === true` → `STOP`, reason `'goal achieved'`.
     - incremented iteration `> maxIterations` → `STOP`, reason
       `'iteration budget exhausted'`.
     - `failureClass` equal to `lastFailureClass` → increment
       `sameFailureClassCount`; else reset to 1.
     - `sameFailureClassCount >= 3` → `ESCALATE`, reason quotes §4.4:
       `'same failure class three times running; retries are masking the
       problem, not fixing it'`.
     - otherwise → `CONTINUE`.
   - Pure function: no clock, no I/O, deterministic given the same inputs.
2. **Tool** `tech_lead_loop_tick`, registered in the same family as
   `tech_lead_progress_decide` / `tech_lead_exit_check`
   (`packages/dsh-tech-lead-plugin/src/tools/progress.js`), envelope v2,
   fail-closed on malformed input, `ESCALATE`/`STOP` carry
   `guidance.nextActions` (kind `hygiene`, mirroring `exit_check`'s pattern).
3. **Template** `skill/templates/loop-spec.md`: the /goal three-part
   contract (Goal / Verification command / Stop condition) plus
   `Max iterations`, `Trigger` (informational: cron | DSH routine | GitHub
   Action — described, never executed by this package), `Escalation
   contact`.
4. **SKILL.md** new subsection (§4.10, after the stagnation breaker):
   documents the composition pattern — external Automation ticks →
   `tech_lead_loop_tick` decides whether the loop itself continues →
   `tech_lead_progress_decide` decides the next action within the tick →
   agent acts → caller persists `state.json.loop` → repeat. States
   explicitly that this package never runs the Automation.
5. **evals**: two new scenarios (ids 11-12) covering budget exhaustion and
   same-class escalation, each with machine-checkable `checks[]` from day
   one (no repeat of the "add evals later" pattern from the first round).
6. **Docs/version sync**: tool count 23→24 (9 test-count-assertion
   locations, same as the exit_check round), root/core/themis version bump,
   README zh/en, AUDIT_REPORT amendment.

## What does NOT ship (YAGNI, explicitly rejected)

- No cron daemon, no subprocess spawning, no GitHub Actions workflow file
  generation — violates the charter and is infrastructure every caller
  already has.
- No new `state.json` schema version — `loop` is an optional caller-managed
  sub-object; existing `state_validate` schema v1 already preserves unknown
  fields (SKILL §7: "恢复时保留未知字段，不得静默丢弃新状态"), so this needs
  no schema migration.
- No worktree/connector/sub-agent machinery — out of scope for a governance
  package that has never executed anything; those remain the external
  Automation's job.

## Test plan

TDD, same pattern as `exit-check`: core tests first (loop-tick.test.js,
~10 cases mirroring exit-check's structure: clean continue, success stops,
budget exhaustion, escalation on 3x same class, reset on different class,
pure-function repeatability, malformed input fails closed), then plugin
registration tests, then count-assertion updates, then artifact rebuild,
then full suite green.

## Self-review (spec review checklist)

- **Placeholder scan**: none — every field and rule above has a concrete
  value or formula copied from existing SKILL.md prose.
- **Internal consistency**: `loopTick`'s escalation wording is a direct
  quote of the existing §4.4 rule ("同类失败连续 3 次＝禁止重试掩盖，强制升级
  上报"), so the new tool cannot contradict the SKILL.md prose it mechanizes.
- **Scope check**: single cohesive unit (one function, one tool, one
  template, one doc section) — does not need decomposition into sub-specs.
- **Ambiguity check**: "same failure class" comparison is exact string
  equality on `failureClass` — no fuzzy matching, no ambiguity about what
  counts as "the same class."
