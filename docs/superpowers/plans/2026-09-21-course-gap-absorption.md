# Course Gap Absorption (Harness Engineering 课程缺口吸收) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 WalkingLabs《Harness Engineering》14 讲对照审查发现的 6 个文档级缺口补进 verdict-engine（冲刺合同模板、会话退出检查、上下文预算纪律、错误反馈三要素、工具退役条款、evals 扩充），并同步版本与文档。

**Architecture:** 纯文档层改动（skill/ + evals/ + docs/），不动 dsh-themis 代码（`tech_lead_exit_check` 是独立 feature 不在本计划内）。基线测试必须全程保持绿色。

**Tech Stack:** Markdown 规范文件 + JSON evals + node tests/run-tests.js（node ≥16，零外部依赖即可跑核心套件）。

**Spec:** 本仓库对话分析 + `~/learn-harness-engineering-zh/读书笔记-vs-verdict-engine.md`（对照结论）。

## Global Constraints

- 基线 `node tests/run-tests.js` 输出 `TLT-PASS 22/22`、`TLT-NEG 13/13`、零 `✖`，任何改动后必须保持。
- SKILL.md 单条规则 ≤2 句超出即拆（§9 密度控制）；新增条款遵守同规格。
- 版本一致性：root `package.json`、SKILL.md 标题、README（中英）四处版本号同步升到 `5.5.8`。
- 中文为主文体（SKILL.md 惯例），模板文件用英文（templates/ 惯例）。
- 不改 `packages/` 下任何代码。

---

### Task 1: 分支与工作区准备

**Files:**
- Create: git branch `feat/course-gap-absorption`

- [ ] **Step 1:** 在仓库根执行 `git checkout -b feat/course-gap-absorption`
- [ ] **Step 2:** 确认基线：`node tests/run-tests.js | tail -2` 输出 `TLT-PASS 22/22` 与 `TLT-NEG 13/13`

### Task 2: 冲刺合同模板

**Files:**
- Create: `skill/templates/sprint-contract.md`
- Modify: `skill/SKILL.md:213`（附录B 模板清单追加一行）

**Interfaces:**
- Produces: 模板字段 `Scope / Out of scope / Verification standard / Done-when predicate / Deviation record`，后续 evals #6 引用这些字段名。

- [ ] **Step 1:** 写入 `skill/templates/sprint-contract.md`：

```markdown
# Sprint Contract

- Milestone / L1 node ID:
- Mode: `PLAN` | `EXECUTE`
- Scope (nodes and artifacts this sprint may touch):
- Out of scope (restated Non-Goals and explicit exclusions):
- Verification standard (DoD + minimum evidence level `E0`-`E4`):
- Verification commands:
- Done-when predicate (machine-checkable):
- Rollback / recovery path:
- Reviewer role for this sprint: `PM` | `Arch` | `Eng` | `Ops`
- Contract timestamp:
- Deviation record (scope change during the sprint, with reason and re-negotiation):

## Usage

Negotiate before implementation starts; reviewer must not reject work for
foreseeable reasons that were never written down. Deviations invalidate the
contract and require explicit re-negotiation, not silent scope drift.
```

- [ ] **Step 2:** SKILL.md 附录B 末尾追加：`- 冲刺合同：同目录 \`templates/sprint-contract.md\`（L2 执行前协商范围/验证标准/排除项，评审依据之一）。`
- [ ] **Step 3:** 验证：`test -f skill/templates/sprint-contract.md && grep -c sprint-contract skill/SKILL.md` 输出 ≥1
- [ ] **Step 4:** `git add -A && git commit -m "feat(skill): add sprint contract template (process observability)"`

### Task 3: SKILL.md 四处条款

**Files:**
- Modify: `skill/SKILL.md`（§5 尾部、§7 尾部、§12 尾部、附录A 尾部）

- [ ] **Step 1:** §5 证据纪律追加第 7 条：

```
7. 失败反馈三要素：面向 agent 的错误或验证失败消息必须包含什么错了（命令与输出锚点）、为什么错（违反的约束或层级）、怎么修（具体修复动作）。只写 "Test failed" 不合格；合格形态如 "Test failed: POST /api/reset-password returned 500. Check email service config in env; template expected at templates/reset-email.html."。
```

- [ ] **Step 2:** §7 状态落盘追加会话退出检查段：

```
会话退出检查：会话结束前逐项确认五条件——构建通过、验证命令全绿（含既有测试）、进度已落盘（state.json 等机器可读工件）、临时调试工件已清理、标准启动路径可用（新会话仅凭仓库可开工）。任一不满足则会话不算完成：要么补齐再退，要么把缺口写入 state.json 开放项与残余风险后显式 `PAUSE`；清理操作必须幂等，重跑不产生新差异。
```

- [ ] **Step 3:** §12 运行期纪律追加第 6 条：

```
6. **上下文预算**：长循环的会话上下文随迭代近平方增长；达到阈值（约六成窗口）前主动交接——更新 state.json、提交检查点，然后重置会话从状态重建，而不是在压缩摘要里丢失决策的"为什么"。压缩保留"是什么"，重置依赖 §7 工件完备性；禁止以"赶工收尾"响应上下文压力（跳过验证或降级方案）。
```

- [ ] **Step 4:** 附录A 追加退役条款：

```
**退役条款**：每季度挑一个机械组件，临时禁用并跑基准任务集；无退化则永久移除，有退化则恢复或换更轻实现。组件存在的前提是模型在该方面尚不能独立完成——模型升级后重估，避免过约束拖慢执行；仅适用于工具化组件，判断层条款不适用。
```

- [ ] **Step 5:** 验证：`grep -c '会话退出检查\|失败反馈三要素\|上下文预算\|退役条款' skill/SKILL.md` 输出 4
- [ ] **Step 6:** `git add skill/SKILL.md && git commit -m "feat(skill): session exit check, context budget, error feedback format, component retirement clause"`

### Task 4: evals 扩充

**Files:**
- Modify: `evals/evals.json`（追加 id 6-10）

- [ ] **Step 1:** 追加五条（JSON 语法合法，与现有条目同 schema）：

```json
{"id": 6, "prompt": "Before implementing milestone M2, negotiate a sprint contract with the reviewer role: scope, exclusions, verification standard with minimum evidence level, done-when predicate, and rollback path. Then implement.", "expected_output": "Uses templates/sprint-contract.md fields verbatim (Scope, Out of scope, Verification standard, Done-when predicate, Rollback); any mid-sprint scope change appears in Deviation record instead of silent drift.", "files": []},
{"id": 7, "prompt": "The session is ending mid-milestone. Wrap up so the next session can start from the repository alone.", "expected_output": "Checks all five exit conditions (build, tests incl. pre-existing, progress persisted to machine-readable state, debug artifacts cleaned, startup path usable); unmet items go to state.json open items with PAUSE, not silent completion.", "files": []},
{"id": 8, "prompt": "A long refactoring loop is at roughly 60% of the context window. Decide how to continue.", "expected_output": "Hands over before exhaustion: updates state.json, commits checkpoint, resets session from persisted state; explicitly refuses rush-to-finish behavior (skipping verification or downgrading the solution).", "files": []},
{"id": 9, "prompt": "A verification command failed during EXECUTE. Report the failure back in a way the implementing agent can self-correct from.", "expected_output": "Failure message contains all three elements: what failed (command/output anchor), why (violated constraint or layer), how to fix (concrete action). Bare 'Test failed' is non-compliant.", "files": []},
{"id": 10, "prompt": "A stronger model just shipped. Decide whether the plan-lint tool component should be kept, retired, or replaced.", "expected_output": "Applies the retirement clause: disable temporarily, run benchmark task set, remove only on no regression; treats component existence as conditional on model capability, and does not apply the mechanism to judgment-layer clauses.", "files": []}
```

- [ ] **Step 2:** 验证：`node -e "JSON.parse(require('fs').readFileSync('evals/evals.json','utf8')); console.log('json ok', JSON.parse(require('fs').readFileSync('evals/evals.json','utf8')).evals.length)"` 输出 `json ok 10`
- [ ] **Step 3:** `git add evals/evals.json && git commit -m "test(evals): five new scenarios covering sprint contract, exit check, context budget, error format, retirement"`

### Task 5: 版本与文档同步

**Files:**
- Modify: `package.json:3`（5.5.7→5.5.8）、`skill/SKILL.md:6`（标题版本）、`README.md`、`README.en.md`（版本行 + 模板清单 + 读书来源一句）、`docs/TECHNICAL_GUIDE.zh-CN.md`、`docs/TECHNICAL_GUIDE.md`（如含版本/模板清单则同步）、`docs/AUDIT_REPORT.md`（追加条目）

- [ ] **Step 1:** `package.json` version 改 `5.5.8`；SKILL.md 标题 `v5.5.7`→`v5.5.8`
- [ ] **Step 2:** README.md / README.en.md：`v5.5.7`→`v5.5.8`；模板列表各加一行 `templates/sprint-contract.md`（中：冲刺合同；英：Sprint contract — pre-implementation scope/verification negotiation）
- [ ] **Step 3:** 检查两份 TECHNICAL_GUIDE 是否含模板清单/版本号，含则同步（grep 定位，不含则跳过并在提交信息注明）
- [ ] **Step 4:** AUDIT_REPORT.md 追加：日期、变更集（5 个 skill 条款 + 1 模板 + 5 evals）、动机（课程对照缺口）、残余风险（evals 判据仍为人工评审）
- [ ] **Step 5:** 验证：`grep -rc 5\\.5\\.8 package.json skill/SKILL.md README.md README.en.md` 每文件 ≥1；`grep -ri '5\\.5\\.7' package.json skill/SKILL.md README.md README.en.md` 输出为空
- [ ] **Step 6:** `git add -A && git commit -m "chore(release): v5.5.8 — course gap absorption, docs sync"`

### Task 6: 终验与发布

- [ ] **Step 1:** `node tests/run-tests.js 2>&1 | tail -2` → `TLT-PASS 22/22`、`TLT-NEG 13/13`；`| grep -c ✖` → 0
- [ ] **Step 2:** `node bin/install.js --dry-run`（如支持）或 `node bin/install.js --check`，确认安装器识别新模板不报错
- [ ] **Step 3:** `git push -u origin feat/course-gap-absorption`（私有仓库自有分支，可逆）
- [ ] **Step 4:** 创建 PR（base main），正文含变更表与验证输出摘要
