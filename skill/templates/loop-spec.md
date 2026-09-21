# Loop Spec

- Loop ID:
- Goal (one sentence, the /goal this loop exists to reach):
- Verification command (how each tick proves success or failure):
- Stop condition (what "done" looks like, beyond a bare pass/fail):
- Max iterations (default 20 if omitted — the loop fails closed, not open-ended):
- Trigger (informational only — this package never runs it): `cron` | `dsh-routine` | `github-action` | other
- Escalation contact (who/what gets notified on `ESCALATE`):
- Loop state location (e.g. `state.json.loop`):

## Usage

Each external trigger fires an independent process. It must read the
persisted `loopState` from Loop state location, call `tech_lead_loop_tick`
with this spec + that state + this tick's observation, then persist the
returned `updatedLoopState` before exiting. On `CONTINUE`, the tick may also
call `tech_lead_progress_decide` for the concrete next action within this
run. On `STOP` or `ESCALATE`, the trigger must not schedule another attempt
without human review — automatic re-triggering past a stop or escalation
defeats the point of a governed loop.
