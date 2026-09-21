# Publication Audit Report

Date: 2026-08-25
Scope: public release of the `tech-lead` planning skill and its eight templates.

## Result

The publication set contains only the following intended artifacts:

- `package.json` / `bin/install.js` (npm installer)
- `skill/SKILL.md`
- `skill/templates/intake.md`
- `skill/templates/plan.md`
- `skill/templates/change-record.md`
- `skill/templates/round.md`
- `skill/templates/release-check.md`
- `skill/templates/state.json`
- `skill/templates/gate-review.md`
- `skill/templates/gate-verdict.md`
- `README.md` (简体中文, GitHub 默认) / `README.en.md` (English)
- `docs/TECHNICAL_GUIDE.md` (English; Chinese README ships separately)
- `docs/AUDIT_REPORT.md`
- `LICENSE`

Documentation is bilingual (English + Simplified Chinese) by design; additional languages were intentionally excluded to limit maintenance surface. The skill body (`SKILL.md`) is authored in Simplified Chinese and is executed correctly by coding agents regardless of conversation language.

No unrelated home-directory files, project histories, server notes, credentials, or private operational documents are included.

## Checks Performed

### Sensitive-content scan

The source set was scanned for local absolute paths, passwords, API-key prefixes, SSH host details, private domains, and server IP patterns. The only address-like match is the explicitly documented loopback placeholder `127.0.0.1`; no real operational endpoint or credential was found in the publication set.

### Structural scan

- YAML frontmatter has `name: tech-lead` and a trigger description.
- The skill version is `v5.5.7` (renamed nomos-skill; CLI alias tech-lead-skill retained). R8.1 (2026-08-26) completes the R8 public contract: protocolJson declared on all 22 tool schemas; all nine legacy bare tools negotiate with bare defaults and fail-closed envelope passthrough; inputCompatibility=compat migrates unknown context keys instead of rejecting; context_validate dispatches canonical v2 documents to validateContextV2; v2 envelopes carry findings/guidance/meta.complete plus meta.outputProtocol stamped by negotiation. one-way state→context-v2 projection (identity options mandatory), result-protocol negotiation on every tool, and the v2 wire label for strengthened envelopes; reverse projection is deferred as non-lossless (evidence/2026-08-26-r8-projection.md).
- The eight templates referenced by the skill exist.
- The installer validates options, requires a marker before removing any target, and records the managed package/version after installation.
- The release-check template covers allowlist inventory, sensitive-content scanning, reference checks, scope checks, publication results, and remote verification.
- The plan includes PLAN/EXECUTE, L0/L1/L2, protected assets, mutation protocol, E0-E4 evidence, completion levels, stagnation control, state recovery, and real-state reconciliation.
- Version markers verified against package.json at audit time (see CHANGELOG history for prior releases)

### Safety review

The skill defaults user data to read-only, requires a recovery path before writes, excludes secrets from normal plans/logs/diffs/backups, requires live-state inspection before runtime operations, and prevents untrusted code execution without an actual isolated environment.

## Known Limitations

- Core judgment stays prose-first; the source-checkout-only DSH workspace registers 22 machine-checkable entry points (21 governance tools + `tech_lead_capabilities` discovery) for context, evidence, progress, gates, release/install audits, recovery, and mutation preview. The root npm tarball intentionally excludes the private workspace packages. Since R6, legacy tools keep bare shapes except `tech_lead_gate_precheck` (envelope projection preserving `data.pass`/`data.violations`); strengthened tools return ResultEnvelope v1 where every governance-negative state is a valid `ok:true` analysis with closure guidance. Legacy audit arrays over the 500-finding window fail closed with `SCAN_INCOMPLETE` instead of being silently sliced (spec: docs/superpowers/specs/2026-08-26-dsh-themis-guidance-architecture.md).
- Freshness, reconciliation, and rollback verification depend on the executing environment.
- No claim is made that the skill has completed a multi-project effectiveness trial; that is the next validation phase.
- The audit validates publication content, not the security of the hosting platform or every consumer's local OpenCode installation.

## Release Decision

Publication is appropriate as a public documentation and skill repository. Consumers should review the skill before applying it to production or user-data changes, and should treat its templates as guidance until project-specific validation is complete.

## Amendment 2026-09-21 (v5.5.8 · course gap absorption)

Changes audited in this amendment:

- `skill/SKILL.md`: four new clauses — §5.7 failure-feedback three-element format,
  §7 session-exit five-condition check, §12.6 context budget discipline,
  Appendix A component retirement clause.
- `skill/templates/sprint-contract.md`: new template (process observability).
- `evals/evals.json`: five new scenarios (ids 6-10) covering the new clauses.
- README (zh/en) and package.json version bumped to 5.5.8; template lists updated.

Motivation: gap analysis against the WalkingLabs "Harness Engineering" course
(lectures 1-14); the four clauses and the sprint contract close the identified
process-observability, session-exit, context-budget, and component-lifecycle gaps.

Residual risks: the new eval scenarios still rely on human review of
`expected_output`; no automated scoring rubric exists yet. The retirement clause
has no mechanical benchmark harness behind it — execution remains procedural.

## Amendment 2026-09-21b (v5.5.9 · tech_lead_exit_check)

- New read-only tool `tech_lead_exit_check` (dsh-themis 1.4.0, core 0.3.1):
  mechanical verdict for the SKILL §7 session-exit five conditions
  (build / verification / progress persisted / artifacts clean / startup
  path). Unreported checks fail closed ("unknown" counts as unmet); dirty
  verdicts carry deterministic guidance nextActions with doneWhen predicates.
- Tool surface 22 → 23; count assertions updated across 9 test locations.
- dsh-themis regenerated via scripts/build-market-package.mjs (9 references).
- Full suite green: 263 tests, 0 failures.
