# Verdict Engine · Nomos (formerly tech-lead-skill)

[简体中文](README.md) | English

An evidence-driven planning and delivery skill for software, infrastructure, research, reverse-engineering, and operations work.

## Why this instead of another prompt file

Most engineering specs stay at the "advice text" layer — easy to agree with, hard to enforce. This project ships one judgment layer in two forms: a prose spec anyone can install, and `dsh-themis`, which turns key rulings into a **machine-checkable read-only runtime**.

| Dimension | Generic skill/prompt | tech-lead-skill | dsh-themis (DSH plugin) |
|---|---|---|---|
| Task tiering | model's good faith | T0/T1/T2 hard rules + bidirectional re-tiering | same, mechanically re-checkable |
| Input governance | none | budget clauses | **fail-closed**: oversized input rejected outright (INPUT_TOO_LARGE / SCAN_INCOMPLETE), never silently passed |
| State validation | reminders | prose schema notes | `state_validate` full-field machine check: enums, done anchors, E0-E4 evidence provenance |
| Leak audit | none | release checklist | `release_audit` scans absolute paths / token-like strings / credential assignments with line numbers |
| Result format | whatever comes out | text convention | uniform `protocolJson` negotiation across 22 tools + stable v2 envelope (findings/guidance/meta.complete) |
| Side effects | — | none | **zero-by-design**: no writes, no subprocesses, no network — computes over your JSON only |

Six verifiable differentiators:

1. **Governance that rules, not pleads.** Gate precheck, blind-review triggers, stall breakers are executable hard rules — the plugin mechanically answers "can this gate pass now, and which anchor is missing".
2. **Explicit failure over false confidence.** Audits over-window refuse verdicts; the state→context-v2 projection returns NON_CONVERTIBLE_STATE when identity/source/fingerprint are missing — pinned by 250 tests, not promises.
3. **Deterministic output.** Same input, same output; guidance actionIds are deterministic and usable as flow keys.
4. **Smooth migration.** bare JSON → v1 → v2 envelopes negotiated by the schema-declared `protocolJson` on every tool: zero breakage for old callers, fail-closed on unknown selections.
5. **Field-born.** Rules distilled from real multi-project incident reviews — execution reliability, config/deploy traps, backup/rollback discipline, anti-risk-control, multi-agent orchestration — not armchair templates.
6. **One-command adoption.** Versioned single npm packages; bilingual docs throughout.

## What It Solves

Many plans fail in one of two ways: they are vague and cannot guide execution, or they are over-detailed and become false after the first environmental change. This skill keeps the plan coarse until evidence justifies detail, then continuously revises it against observed reality.

The control loop is:

```text
goal -> constraints/assumptions -> L0/L1/L2 plan -> execute -> observe evidence
     -> revise -> choose CONTINUE / PAUSE / SCOPE-DOWN / PIVOT / STOP
```

## Core Features

- PLAN and EXECUTE modes with a clear boundary between planning and side effects.
- Progressive disclosure: L0 architecture, L1 milestones, L2 executable focus.
- Goal, metric, fact, assumption, decision, risk, dependency, and evidence ledgers.
- Protected asset handling for source, user data, configuration, secrets, runtime state, and generated artifacts.
- Minimal mutation protocol: `READ -> CLASSIFY -> PROTECT -> CHANGE -> VERIFY -> RECONCILE -> ROLLBACK/RECORD`.
- Evidence levels E0-E4, from model inference to observed user outcomes.
- Failure re-planning, stagnation circuit breaker, rollback discipline, and real-state reconciliation.
- Optional adversarial review for high-impact or irreversible changes.
- Git-backed and non-Git project-state recovery.
- Release-readiness checks for public documentation and skill publishing.
- Runtime discipline rules for external dependency health, silent failure classes, automation guardrails, idempotent batch jobs, and fallback ladders.

## Install

Pick your edition:

- **Prose skill for any agent environment** (opencode / Claude Code / Codex) → `tech-lead-skill`
- **DSH plugin with machine-checked read-only tools** → `dsh-themis`

### npm (GitHub-hosted, no registry account needed)

```bash
npm i -g nomos-skill  # or: npm i -g github:240xu/verdict-engine
nomos-skill              # installs into ~/.config/opencode/skills/tech-lead
```

One-shot without a global install:

```bash
npx nomos-skill
```

The installer is idempotent: repeated runs back up existing files as `*.bak-<timestamp>` first. Use `--target <dir>` to choose another destination, `--check` to verify an installed copy against the package (hash + version drift), `--dry-run` to preview without writing, and `--uninstall` to remove. Uninstall removes only manifest-managed files — user files and `*.bak-*` backups are kept.

`--check` exit codes: `0` clean, `1` drift detected, `2` usage/refusal error.

### DeepSeek Harness plugin (read-only tools)

**For DSH users:** ships on the DSH plugin market (npm) as ONE self-contained package, **`dsh-themis`** — named after the goddess of divine order: gates as verdicts, evidence weighed, releases audited. Install into any profile:

```bash
dsh plugin --profile headless add dsh-themis
```

23 registered entry points in a single artifact: 22 read-only governance tools plus a capability-discovery tool (`tech_lead_capabilities`) that lists only what this bundle actually registers (the original nine audits plus context validation, evidence graph/freshness analysis, progress decisions, critical-path/impact analysis, resume reconciliation, gate planning/aggregation/reopen checks, mutation preview, and the five-condition session exit check). Tools compute over caller-supplied JSON only — no filesystem writes, no subprocesses, no network access. The earlier split packages (`dsh-tech-lead-{core,plugin,bundle}`) are deprecated in favor of this one. Source checkouts remain supported: build via `node scripts/build-market-package.mjs` then `dsh plugin add packages/dsh-themis`. The root npm package distributes the skill and installer only.

**Two artifacts, one rulebook:** `tech-lead-skill` is the conservative, broadly-compatible prose spec — install it into any agent environment (opencode, Claude Code, Codex) and nothing else is required. **`dsh-themis` is the DSH-plugin specialized edition**: the same judgment layer plus a machine-checked read-only runtime — schema-declared `protocolJson` negotiation on all 22 tools (bare legacy by default, explicit v1/v2 envelopes, fail-closed on unknown selections), one-way state→context-v2 projection that never invents identity or provenance, strict/compat input handling, and stable v2 envelopes (`findings`, `guidance`, `meta.complete`, `meta.outputProtocol`).

```bash
dsh plugin --profile headless add /path/to/tech-lead-skill/packages/dsh-themis
dsh --profile headless --dump-config   # verify the tech-lead-tools row is present
```


Output families and limits:

- The twelve strengthened tools return a `tech-lead.result.v1` envelope (discriminator: `meta.schema`); the original nine tools return their bare domain shapes for backward compatibility.
- Rendered output is clamped: finding/error arrays are capped at 500 entries with a `FINDINGS_TRUNCATED` warning; caller-echo arrays (evidence/targets/expectedDiff/verification/items) collapse into `{truncated,total}` beyond 100 entries; any OTHER array inside `data` (including computed results such as `criticalPath`) is head-sliced at 1000 entries while keeping its shape; subtrees deeper than 64 levels collapse into a `DEPTH_LIMIT` marker; payloads above 256 KB switch to compact serialization. Legacy bare top-level arrays slice silently at 500 (no warning field exists on that shape).

See [`docs/superpowers/specs/2026-08-25-dsh-tech-lead-system.md`](https://github.com/240xu/verdict-engine/blob/main/docs/superpowers/specs/2026-08-25-dsh-tech-lead-system.md) for the architecture and permission matrix.

### Manual

Copy `skill/SKILL.md` and the `skill/templates/` directory into the skills directory of your OpenCode-compatible environment:

```text
~/.config/opencode/skills/tech-lead/
```

The skill is triggered by project construction, system building, implementation plans, deployment, migration, release, recovery, restructuring, operations work, and other substantial planning requests. It can also be loaded explicitly.

## Lifecycle results are valid analyses

`PAUSE`, `PIVOT`, `SCOPE-DOWN` and `STOP` from `tech_lead_progress_decide` are returned as **ok:true** analyses with `data.outcome`; a not-yet-passed gate returns `ok:true` with `data.verdict`/`data.pass`. `ok:false` is reserved for malformed input, over-budget payloads (`INPUT_TOO_LARGE`, `ITEM_LIMIT_EXCEEDED`) and incomplete safety scans (`SCAN_INCOMPLETE`). Decision tools attach a deterministic `data.guidance.nextActions[]`; every action carries reason codes, a finding reference and a `doneWhen` predicate. Heuristic suggestions appear only under explicit `guidanceMode:"heuristic"`.

## Four-tool starter loop

1. `tech_lead_classify` — copy the returned tier into your snapshot's `current.tier`.
2. `tech_lead_context_validate` — validate the full inline snapshot (schema `tech-lead.context.v1`; canonical example: tests/fixtures/starter-context.v1.json).
3. `tech_lead_evidence_lint` — pass the snapshot's `evidence` array as a JSON string; findings are advisory.
4. `tech_lead_progress_decide` — feed the same snapshot; read `data.outcome`, then follow `data.guidance`.

## Operating Modes

### PLAN

Use for intake, goal definition, architecture, decomposition, risk analysis, and verification design. PLAN does not edit files or run side-effecting commands.

### EXECUTE

Use after the L2 scope is clear. Execute only the smallest approved mutation, record the change, verify behavior, reconcile actual state, and update the plan.

## Protected Assets

| Class | Default handling |
|---|---|
| `SOURCE` | Inspectable diff, tests, and restore point |
| `USER_DATA` | Read-only by default; write only to an explicit target with recovery |
| `CONFIG` | Read current state, make the smallest change, reload, verify |
| `SECRET` | Never place in plans, logs, ordinary backups, or diffs |
| `RUNTIME` | Inspect live state before restart, kill, replace, or migration |
| `GENERATED` | Prefer regeneration; do not treat as the source of truth |

## Evidence Levels

- `E0`: model inference; hypothesis only.
- `E1`: static inspection, grep, or configuration inspection.
- `E2`: local command or unit test; local behavior only.
- `E3`: integration test, real process, or real endpoint.
- `E4`: user acceptance, real business result, or production observation.

## Templates

- `templates/intake.md`: goal, constraints, assets, risk, and completion level.
- `templates/plan.md`: L0/L1/L2 plan and current focus.
- `templates/change-record.md`: one EXECUTE mutation and its reconciliation.
- `templates/round.md`: one planning iteration and its outcome.
- `templates/state.json`: canonical resumable state projection.
- `templates/gate-review.md` and `templates/gate-verdict.md`: independent review and decision records.
- `templates/release-check.md`: publication inventory, scans, remote verification, and limitations.
- `templates/sprint-contract.md`: sprint contract — pre-implementation negotiation of scope, verification standard, and exclusions.

## Scope

This is an engineering planning skill. It focuses on correctness of planning, safe handling of user files and code changes, evidence quality, rollback, and real-environment reconciliation. It intentionally stays focused on project-level engineering work rather than organization-wide process design.

## Limitations

- The prose judgment layer stays non-mechanical by design; only the source-checkout DSH bundle adds a machine-checkable read-only runtime for context, evidence, progress, gates, release/install audits, recovery, and mutation preview.
- Inside the prose skill itself (without the bundle), evidence freshness and state reconciliation remain operator/agent responsibilities.
- The skill does not provide a sandbox; untrusted code must not be executed unless an actual isolated execution environment is already available.
- MCP candidates should be selected only after observing repeated real-project violations.

## Notes

The executable skill body (`SKILL.md`) is authored in Simplified Chinese; coding agents execute it correctly regardless of the conversation language. Templates are English and agent-facing. Documentation translations cover this README and the technical guide.

## Version

Current version: `v5.5.9`.

See [`docs/TECHNICAL_GUIDE.md`](docs/TECHNICAL_GUIDE.md) for the full operating model and [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) for the publication audit.
