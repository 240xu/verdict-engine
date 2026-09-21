# tech_lead_exit_check Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增只读工具 `tech_lead_exit_check`——SKILL §7 会话退出五条件的机械判定器（构建/验证/进度落盘/工件清理/启动路径），unknown 一律 fail-closed。

**Architecture:** 源码事实源 = `packages/dsh-tech-lead-core/src`（纯函数）+ `packages/dsh-tech-lead-plugin/src`（工具注册）；`packages/dsh-themis` 由 `scripts/build-market-package.mjs` 生成，不手改。TDD：先核心层测试，再注册层测试，最后重建产物。

**Tech Stack:** node:test + assert/strict；ESM；零新依赖。

**Spec:** SKILL.md §7 会话退出检查（v5.5.8 新条款）。

## Global Constraints

- `node tests/run-tests.js` 全程保持 `TLT-PASS`/`TLT-NEG` 全绿、零 `✖`。
- 计数断言 22→23 共 7 处：`packages/dsh-tech-lead-core/tests/capabilities.test.js`(3)、`packages/dsh-tech-lead-plugin/test/capabilities.test.js`(1)、`tests/artifact-smoke.test.js`(2)、`tests/r7-discovery.test.js`(2)、`tests/r8-contract-matrix.test.js`(1)。
- 核心函数纯函数：无 I/O、无时钟（时间字段只解析不生成）。
- unknown 检查结果 = 未满足（fail-closed），never silently pass。
- 版本：root → 5.5.9，`@240xu/dsh-tech-lead-core` → 0.3.1，dsh-themis → 1.4.0（构建时）。

---

### Task 1: 核心函数 TDD

**Files:**
- Create: `packages/dsh-tech-lead-core/tests/exit-check.test.js`
- Create: `packages/dsh-tech-lead-core/src/exit-check.js`
- Modify: `packages/dsh-tech-lead-core/src/index.js`（追加 export）

**Interfaces:**
- Produces: `exitCheck(maybeState, maybeChecks?, maybeOpts?)` → `{verdict:'EXIT_CLEAN'|'EXIT_DIRTY', conditions:[{id,label,status,detail}], unmet:string[], warnings:string[]}`；条件 id 固定 `build|verification|progress_persisted|artifacts_clean|startup_path`；opts `{applicable?:string[]}`。

- [ ] **Step 1:** 写失败测试 `packages/dsh-tech-lead-core/tests/exit-check.test.js`（用例：全真→CLEAN；unknown fail-closed→DIRTY；updated_at 空→progress fail；非对象 state→DIRTY+warning；applicable 豁免 build 后其余全真→CLEAN；纯函数两次调用同结果；conditions 恰好 5 条且顺序稳定）
- [ ] **Step 2:** `node --test packages/dsh-tech-lead-core/tests/exit-check.test.js` → FAIL（模块不存在）
- [ ] **Step 3:** 实现 `src/exit-check.js`
- [ ] **Step 4:** 重跑 → PASS
- [ ] **Step 5:** index.js 追加 `export { exitCheck } from './exit-check.js';`；`git commit -m "feat(core): exitCheck — five-condition session exit verdict, fail-closed"`

### Task 2: 工具注册

**Files:**
- Modify: `packages/dsh-tech-lead-plugin/src/tools/progress.js`（注册 `tech_lead_exit_check`，stateJson+checksJson+optionsJson，envelope v2 路径同 progress_decide，dirty 时附 guidance nextActions）
- Modify: `packages/dsh-tech-lead-plugin/src/index.js`（core 对象加 exitCheck）
- Modify: `packages/dsh-tech-lead-plugin/src/tools.js`（progress 注册守卫加 `core.exitCheck`）
- Modify: `packages/dsh-tech-lead-core/src/capabilities.js`（追加一行 capability）
- Modify: `packages/dsh-tech-lead-plugin/test/progress-tools.test.js`（注册名、clean/dirty 执行、BAD_INPUT）

- [ ] **Step 1:** 先加插件测试（注册名存在；`{stateJson:'{"updated_at":"2026-09-21T00:00:00Z"}', checksJson: 全真}` → ok:true verdict EXIT_CLEAN；checksJson 缺 build → EXIT_DIRTY 且 data.guidance.nextActions 非空；checksJson:'{' → ok:false BAD_INPUT）
- [ ] **Step 2:** 跑 → FAIL
- [ ] **Step 3:** 实现（progress.js register + index.js + tools.js 守卫 + capabilities 行 `['tech_lead_exit_check','reconcile','json-string','medium','exit',['StateV1','ExitChecks'],['ExitCheckReport'],['tech_lead_state_validate'],'Unknown check results fail closed; a clean exit is proven, not assumed.']`）
- [ ] **Step 4:** 跑 → PASS；全量 `node tests/run-tests.js` 此时应只有计数断言红
- [ ] **Step 5:** 修 7 处 22→23；全量测试绿后 `git commit -m "feat(plugin): register tech_lead_exit_check (23-tool surface)"`

### Task 3: 产物重建与文档

- [ ] **Step 1:** 版本 bump：root package.json 5.5.9、core 0.3.1、SKILL.md/README 中英 v5.5.9
- [ ] **Step 2:** `node scripts/build-market-package.mjs` 重建 dsh-themis（确认输出含 exit-check 且 version 1.4.0——必要时改脚本模板里的 version/description 计数 21→22）
- [ ] **Step 3:** 根 README 工具计数 22→23（"22 个入口：21 个…＋1"→"23 个入口：22 个…＋1"），中英同步
- [ ] **Step 4:** `node tests/run-tests.js` 全绿；`grep -c exit_check packages/dsh-themis/src -r` ≥3
- [ ] **Step 5:** AUDIT_REPORT 修正案追加工具条目；commit；push 到既有分支（PR #1 扩展）
