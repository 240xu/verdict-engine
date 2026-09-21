# Verdict Engine · Nomos（原 tech-lead-skill）

[English](README.en.md) | 简体中文

一套以证据驱动的规划与交付技能，适用于软件、基础设施、研究、逆向工程与运维类工作。

## 为什么是它，而不是又一份提示词

大多数工程规范停留在「文字建议」层面——读完很认同，执行靠自觉。本项目把同一条判断层做成两种载体：纯文本规范人人可用；`dsh-themis` 进一步把关键判定变成**机器可校验的只读运行时**。

| 维度 | 普通 Skill / Prompt | tech-lead-skill | dsh-themis（DSH 插件） |
|---|---|---|---|
| 任务分级 | 模型自觉 | T0/T1/T2 硬规则 + 双向升降档 | 同左，机械可复核 |
| 输入治理 | 无 | 预算上限条款 | **fail-closed**：超限输入直接拒（INPUT_TOO_LARGE / SCAN_INCOMPLETE），绝不静默放行 |
| 状态校验 | 口头提醒 | schema 说明 | `state_validate` 全字段机检：枚举、done 锚点、证据溯源 E0-E4 |
| 泄漏审计 | 无 | 发布检查单 | `release_audit` 自动扫描绝对路径/token 形串/凭据赋值并带行号 |
| 结果格式 | 随缘 | 文本约定 | 22 工具统一 `protocolJson` 协商 + 稳定 v2 信封（findings/guidance/meta.complete） |
| 副作用 | — | 无 | **零副作用设计**：不写盘、不起子进程、不联网，只计算你传入的 JSON |

六条可以被验证的差异化优势：

1. **治理是判定的，不是恳求的。** 门禁前置校验、盲评触发条件、停滞断路器全部是可执行的硬规则——插件版能机械回答"这个 Gate 现在能不能过、缺什么锚点"。
2. **宁可显式失败，不给假安全感。** 审计超窗拒绝出结论；state→context v2 投影缺失 project/fingerprint/source 直接返回 NON_CONVERTIBLE_STATE，身份永不虚构——这些行为由 250 个测试钉死，不是口头承诺。
3. **确定性输出。** 同输入必同输出；guidance 的 actionId 确定性生成，可直接用作流程 key。
4. **平滑迁移。** 裸 JSON → v1 信封 → v2 信封由每个工具 schema 内声明的 `protocolJson` 协商：老调用零破坏，未知取值 fail-closed。
5. **实战出身。** 规则源自真实多项目的事故复盘——执行可靠性、配置部署陷阱、备份回滚纪律、对抗风控、多代理编排，不是从理论里推出来的模板。
6. **一键采用。** npm 单包版本化发布，一条命令装进任意 agent 环境；全文档中英双语。

## 解决什么问题

计划失败通常有两种方式：要么模糊到无法指导执行，要么过度细化而在第一次环境变化后就失真。本技能让计划在证据支撑之前保持粗粒度，然后依据观察到的现实持续修订。

控制回路：

```text
目标 -> 约束/假设 -> L0/L1/L2 计划 -> 执行 -> 观察证据
     -> 修订 -> 选择 CONTINUE / PAUSE / SCOPE-DOWN / PIVOT / STOP
```

## 核心特性

- PLAN 与 EXECUTE 双模式，划清规划与副作用的边界。
- 渐进展开：L0 架构、L1 里程碑、L2 可执行焦点。
- 目标、指标、事实、假设、决策、风险、依赖与证据账本。
- 受保护资产处置：源码、用户数据、配置、秘密、运行态与生成物。
- 最小变更协议：`READ -> CLASSIFY -> PROTECT -> CHANGE -> VERIFY -> RECONCILE -> ROLLBACK/RECORD`。
- E0-E4 证据分级，从模型推断到真实用户结果。
- 失败重规划、停滞断路器、回滚纪律与真实状态对账。
- 面向高影响或不可逆变更的对抗式评审（可选）。
- 支持 Git 与非 Git 两种项目状态恢复方式。
- 面向公开文档与技能发布的收尾验证检查。
- 运行期纪律规则：外部依赖健康、静默失败类别、自动化护栏、幂等批处理与降级阶梯。

## 安装

先选版本：

- **纯文本规范，任意 agent 环境**（opencode / Claude Code / Codex）→ **`nomos-skill`**（npm 包名，CLI 别名 `tech-lead-skill` 保留）
- **带机器可校验只读工具的 DSH 插件** → `dsh-themis`

### npm 方式（GitHub 源，无需注册账号）

```bash
npm i -g nomos-skill  # 或 npm i -g github:240xu/verdict-engine
nomos-skill              # 安装到 ~/.config/opencode/skills/tech-lead
```

一次性运行（不全局安装）：

```bash
npx nomos-skill
```

安装器幂等，重复执行会先把旧文件备份为 `*.bak-<时间戳>`；`--target <目录>` 可自定义目标；`--check` 校验已装副本与包的哈希/版本漂移；`--dry-run` 预览不写入；`--uninstall` 卸载时只删除清单受管文件，用户文件与 `*.bak-*` 备份全部保留。

`--check` 退出码：`0` 正常，`1` 检出漂移，`2` 用法/拒绝错误。

### DeepSeek Harness 插件（只读工具）

**DSH 用户看这里：** 已上架 DSH 插件市场（npm）——**单一自包含包**，任意 profile 一键安装：

```
dsh plugin --profile headless add dsh-themis
```

单包注册 22 个入口：21 个只读治理工具（原九项审计＋上下文校验、证据图/新鲜度分析、推进决策、关键路径/影响分析、续跑对账、Gate 计划/聚合/重开、变更预览）＋能力发现工具 `tech_lead_capabilities`（只列出本包实际注册的工具）。仅对调用方传入的 JSON 做计算——无文件写入、无子进程、无网络访问。旧拆分包（`dsh-tech-lead-{core,plugin,bundle}`）已弃用并指向本包。源码安装：`node scripts/build-market-package.mjs` 装配后 `dsh plugin add packages/dsh-themis`。根 npm 包只发布技能与安装器。

**两个产物，同一套规范：** `nomos-skill`（Verdict Engine 纯文本版）是保守、广泛兼容的纯文本规范——装进任何 agent 环境（opencode/Claude Code/Codex）即可，无其他依赖。**`dsh-themis` 是 DSH 插件专项优化版**：同样的判断层外加机器可校验的只读运行时——全部 22 工具在 schema 中声明 `protocolJson`（legacy 默认裸形态、显式请求 v1/v2 信封、未知取值 fail-closed）、state→context-v2 单向投影（身份与来源永不虚构）、strict/compat 输入兼容模式，以及稳定的 v2 信封（`findings`/`guidance`/`meta.complete`/`meta.outputProtocol`）。

```bash
dsh plugin --profile headless add /path/to/tech-lead-skill/packages/dsh-themis
dsh --profile headless --dump-config   # 确认 tech-lead-tools 行已注入
```


输出家族与限制：

- 十二个强化工具返回 `tech-lead.result.v1` 信封（判别字段：`meta.schema`）；原有九个工具为向后兼容保留裸领域形状。
- 渲染输出有上限：finding/error 数组每字段最多 500 条并附 `FINDINGS_TRUNCATED` 警告；超限调用方回显数组折叠为 `{truncated,total}` 摘要；超过 256KB 自动切换紧凑序列化。

架构与权限矩阵见 [spec](https://github.com/240xu/verdict-engine/blob/main/docs/superpowers/specs/2026-08-25-dsh-tech-lead-system.md)。

### 手动方式

将 `skill/SKILL.md` 和 `skill/templates/` 目录复制到你所用 OpenCode 兼容环境的技能目录：

```text
~/.config/opencode/skills/tech-lead/
```

该技能由"构建项目/搭系统/制定执行计划/部署/迁移/发布/恢复/重构/运维"等实质性任务触发，即使用户没有明确说“项目”或“Tech Lead”也应加载；也可以显式加载。

## 生命周期结果是有效分析

`tech_lead_progress_decide` 的 `PAUSE`/`PIVOT`/`SCOPE-DOWN`/`STOP` 以 **ok:true** 分析返回（`data.outcome`）；未通过的 Gate 同样 ok:true（`data.verdict`/`data.pass`）。`ok:false` 只用于非法输入、超预算载荷（`INPUT_TOO_LARGE`、`ITEM_LIMIT_EXCEEDED`）与不完整安全扫描（`SCAN_INCOMPLETE`）。决策类工具附带确定性的 `data.guidance.nextActions[]`：每条动作含原因码、finding 引用与 `doneWhen` 完成谓词。启发式建议仅在显式 `guidanceMode:"heuristic"` 下出现。

## 四工具起步环

1. `tech_lead_classify` —— 把返回的 tier 写入快照 `current.tier`。
2. `tech_lead_context_validate` —— 校验完整内联快照（schema `tech-lead.context.v1`；范例 tests/fixtures/starter-context.v1.json）。
3. `tech_lead_evidence_lint` —— 把快照的 `evidence` 数组序列化为字符串传入；findings 仅作建议。
4. `tech_lead_progress_decide` —— 喂入同一快照；读 `data.outcome` 后按 `data.guidance` 行动。

## 工作模式

### PLAN

用于需求接入、目标定义、架构设计、任务分解、风险分析与验证设计。PLAN 不改文件、不执行有副作用的命令。

### EXECUTE

在 L2 范围明确后使用。只执行最小已批准变更，记录改动，验证行为，对账实际状态，并更新计划。

## 受保护资产

| 类别 | 默认处置 |
|---|---|
| `SOURCE` | 可审查 diff、测试与恢复点 |
| `USER_DATA` | 默认只读；仅在目标明确且有可恢复副本时写入 |
| `CONFIG` | 先读现状，最小修改，重载后验证 |
| `SECRET` | 绝不进入计划、日志、普通备份或 diff |
| `RUNTIME` | 重启/杀进程/替换/迁移前必须先查实时状态 |
| `GENERATED` | 优先重新生成；不作为事实源 |

## 证据分级

- `E0`：模型推断；仅可用于提出假设。
- `E1`：静态阅读、grep 或配置检查。
- `E2`：本地命令或单元测试；仅证明局部行为。
- `E3`：集成测试、真实进程或真实端点。
- `E4`：用户验收、真实业务结果或生产观察。

## 模板

- `templates/intake.md`：目标、约束、资产、风险与完成层级。
- `templates/plan.md`：L0/L1/L2 计划与当前焦点。
- `templates/change-record.md`：单次 EXECUTE 变更及其对账。
- `templates/round.md`：单轮规划迭代及其结果。
- `templates/state.json`：可续跑的规范状态投影。
- `templates/gate-review.md` 与 `templates/gate-verdict.md`：独立评审与裁决记录。
- `templates/release-check.md`：发布清单、扫描、远程验证与限制记录。
- `templates/sprint-contract.md`：冲刺合同——执行前协商范围、验证标准与排除项。

## 范围

这是一套工程规划技能，聚焦规划正确性、用户文件与代码改动的安全处置、证据质量、回滚以及真实环境对账。它有意不涉及组织级流程设计或通用项目管理方法论。

## 局限

- 文本判断层有意保持非机械化；只有源码安装的 DSH bundle 才提供上下文、证据、推进、Gate、发布/安装审计、恢复与变更预览的可机检只读运行时。
- 在纯文本技能形态下（无 bundle），证据时效与状态对账仍依赖执行环境与操作者。
- 本技能不提供沙箱；除非已有真实隔离执行环境，否则不得运行不可信代码。
- MCP 工具化候选应在观察到真实项目中反复违例之后再筛选。

## 说明

可执行的技能正文 `SKILL.md` 以简体中文编写；编码代理无论对话语言为何均可正确执行。模板为面向代理的英文文件。文档翻译覆盖本 README 与技术指南。

## 版本

当前版本：`v5.5.8`.

完整运行模型见[技术指南](./docs/TECHNICAL_GUIDE.zh-CN.md)，发布审计见 [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md)。
