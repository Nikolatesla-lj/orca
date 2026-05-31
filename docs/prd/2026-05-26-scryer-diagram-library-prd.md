# Scryer Diagram Library PRD

日期：2026-05-26

## GitHub context

| Item | Link/status | Notes |
|---|---|---|
| PRD issue | Preferred but unavailable | `Nikolatesla-lj/orca` currently has GitHub Issues disabled, so a real PRD issue cannot be created yet. Use the local development fallback below until Issues are enabled. |
| Task slice issue | Preferred but unavailable | Task slice issues cannot be created until GitHub Issues are enabled. Use local task docs with the same Context Checklist and traceability requirements until real issue URLs exist. |
| Existing PR | None | 当前只制定开发文档，不改功能代码。 |
| Contract docs | `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md` | 后续实现必须以该契约为准。 |
| Implementation contracts | `docs/contracts/2026-05-26-scryer-diagram-library-implementation-contracts.md` | 固定关键函数、组件 props、handler 输入输出和真实测试门禁。 |
| Error codes | `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md` | 固定 parser、renderer、cache IPC、MCP 和 CLI bridge 的错误码。 |
| Traceability | `docs/contracts/2026-05-26-scryer-diagram-library-traceability.md` | 映射 R1-R16 到契约、函数、任务、测试和 live evidence。 |
| Terminology | `docs/contracts/2026-05-26-scryer-diagram-library-terminology.md` | 所有文档和实现讨论必须使用这里的统一用词。 |
| Architecture docs | `docs/architecture/2026-05-26-scryer-diagram-library-architecture.md` | 记录 Frontend、Backend/API、Database/data 和渲染边界。 |
| Testing docs | `docs/testing/2026-05-26-scryer-diagram-library-verification.md` | 记录 automated checks 和 Live verification。 |
| Fixture catalog | `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md` | 固定真实 `.scry`、Mermaid source 和 cache request 测试输入。 |

## Coding gate

Preferred GitHub gate:

- GitHub Issues are enabled for the target repository.
- One PRD issue exists and links this PRD, architecture, contracts, tasks, and verification docs.
- Each task slice in `docs/tasks/2026-05-26-scryer-diagram-library-task-slices.md` has its own GitHub issue URL.
- Every task issue contains the Context Checklist from the task slice doc.
- Every task issue cites the implementation contract rows for the functions, components, handlers, or IPC paths it changes.
- Every task issue cites fixture IDs, error codes, and traceability rows from the contract docs.

Local development fallback while GitHub Issues are disabled:

- Coding may proceed only from a local task doc under `docs/tasks/local/`.
- Each local task doc must copy the strict task template from `docs/tasks/2026-05-26-scryer-diagram-library-task-slices.md`.
- Each local task doc must have a stable local task id such as `LOCAL-F1A`, `LOCAL-S1A`, or `LOCAL-S7B`. Parent summaries such as `LOCAL-S1` are not coding entries.
- Each local task doc must cite requirement IDs, contract sections, exact implementation names, fixture IDs, error codes, traceability rows, automated tests, and live evidence.
- PR or handoff evidence must link the local task doc. If GitHub Issues are later enabled, local task docs must be backfilled into GitHub issues before merge/release.
- Direct coding from only this PRD, UML, or a plan remains disallowed.

Release gate:

- S1 may be merged internally as a source-only foundation slice, but it is not a user-visible complete release of the Diagram library.
- S1 UI must be hidden behind the internal feature flag `enableArchitectureDiagramLibraryPreview`, default off for user-facing builds. Tests and internal live evidence may enable the flag. S2 must keep the same flag name for rollback/tests and set its default to on only after the complete review page acceptance criteria pass; S2 must not remove or replace the flag.
- A user-visible release that advertises Diagram review view requires S2, because S2 is the first slice that shows source and rendered SVG together with diagnostics.
- A user-visible release that advertises complete diagram reference management requires S3, S3A, and S4. S3 alone means "link existing diagrams"; S3A adds "create diagram then link"; S4 adds SVG element-level binding and target navigation.
- S7B is required before advertising copy SVG, export PNG, review SVG cache usage, or thumbnail cache behavior.
- Any release that lets users save v2 `.scry` files with `schemaVersion`, `diagrams`, or `diagramRefs` must complete S8 first, unless standalone `scryer/` save support is explicitly removed or disabled with a documented product decision. Otherwise standalone can silently drop user diagram data.

## Problem statement

Orca 内置 Architecture 页面当前只能表达 C4 model tree、flow tree、sourceMap 和 groups。用户需要把 UML、Mermaid 流程图、架构图以及其他能表达设计意图的图，作为 C4 模型的补充细节一起保存、审查、引用和同步。

当前不能把这些图直接塞进 C4 model tree 或 flow tree。原因是 C4 tree 和 flow tree承担的是高层结构和用户流程，图表承担的是补充细节。如果混在同一个树里，用户会更难理解模型层级，也会增加 AI 修改模型时误改结构的风险。

## Product goal

在一个 `.scry` 文件中完整管理：

- 一个 C4 模型。
- C4 模型的 flows。
- Mermaid/UML/其他补充图。
- C4 节点、edge、flow、flow step、代码文件与图之间的引用关系。
- 图表源码和引用关系作为 `.scry` 的 Source of truth。
- SVG、PNG、错误诊断、rendererVersion、sourceHash 和缩略图作为 Derived cache，可删除并从图表源码重新生成。

## Original request alignment

本文档必须持续满足最初用户需求：

- Diagram 数据保存在同一个 `.scry` 文件中，不拆成多个外部 diagram 文件。
- Diagram 不作为 C4 node 或 flow item 写入 model tree / flow tree；左侧只在两棵树下方显示独立 Diagram library。
- 点击 C4 model tree 时 C4 canvas 只显示 C4 节点和边；点击 Diagram library 时 Architecture 主内容区才切到 Diagram review view。
- 默认复用 Orca 现有 Mermaid 渲染链路；只有能力缺口被测试证明后，才引入或 fork `beautiful-mermaid`。
- C4、flow、flow step、source file 与 diagram 的关系通过 `diagramRefs` 引用表达，不能破坏 C4/flow tree 的简洁性。
- AI/MCP 生成或同步模型时，必须同时维护必要 diagrams 和 diagramRefs，但不能过度生成图导致 `.scry` 和 prompt 膨胀。

## User stories

| ID | User story | Requirement IDs |
|---|---|---|
| US1 | 作为用户，我希望 C4 model tree 保持简洁，不被 UML 图节点污染。 | R1, R2 |
| US2 | 作为用户，我希望在 model tree 和 flow tree 下方看到统一的 Diagram library。 | R3 |
| US3 | 作为用户，我点击 C4 节点时，C4 canvas 仍显示 C4 节点和边。 | R4 |
| US4 | 作为用户，我点击 flow 时，Architecture 主内容区仍显示 flow 编辑/审查界面。 | R5 |
| US5 | 作为用户，我点击 diagram 时，Architecture 主内容区切换到 Diagram review view。 | R6 |
| US6 | 作为用户，我希望 Mermaid 源码和渲染图同时可见，并能定位错误。 | R7, R8 |
| US7 | 作为用户，我希望 SVG 中的图节点可以点击，并能定位到它绑定的 C4、flow 或源码目标；如果有多个目标，先让我选择。 | R9 |
| US8 | 作为用户，我希望 C4 节点、flow、flow step、代码文件可以引用 diagram。 | R10 |
| US9 | 作为用户，我希望 Deep Build / Sync 时 AI 同步维护 C4、flow、diagram 和引用关系。 | R11, R12 |
| US10 | 作为用户，我希望可以导出 PNG、复制 SVG，并看到 diagram 缩略图。 | R13 |

## Requirements

| ID | Requirement | Priority |
|---|---|---|
| R1 | C4 `nodes` 只保存 C4 层级节点，不保存 UML/Mermaid 图节点。 | Must |
| R2 | `flows` 只保存用户流程，不保存 diagram 列表项。 | Must |
| R3 | 前端左侧树新增 `Diagram library`，位于 `Model tree` 和 `Flow tree` 下方。 | Must |
| R4 | 点击 model tree 节点时，C4 canvas 只显示 C4 model，不掺杂 diagram 元素。 | Must |
| R5 | 点击 flow tree 项时，Architecture 主内容区显示 flow 页面。 | Must |
| R6 | 点击 Diagram library 项时，Architecture 主内容区显示 Diagram review view。 | Must |
| R7 | Diagram review view 同时显示源码和渲染图。 | Must |
| R8 | Mermaid 错误必须给出清楚错误信息；可定位时必须显示行号和列号。 | Must |
| R9 | 支持 SVG 元素点击定位到绑定的 C4 节点、edge、flow、flow step 或 source；一个元素有多个目标时必须先显示选择器。 | Must |
| R10 | 支持 whole-diagram 引用和 SVG element 级引用。 | Must |
| R11 | 从代码生成 C4 模型时，必须按 prompt/rules contract 的 diagram generation decision table 生成必要 diagrams 和 diagramRefs；不能为简单细节过度生成图。 | Must |
| R12 | Sync 发现代码漂移后，必须同步检查相关 C4、flow、diagram 和 diagramRefs；只更新实际受影响的内容。 | Must |
| R13 | 支持复制 SVG、导出 PNG、缩略图缓存；这些输出必须从当前 diagram source 渲染生成，不能作为唯一真相写入 `.scry`。 | Must |
| R14 | `.scry` 是 diagram source 和 diagramRefs 的 Source of truth；SVG、PNG、diagnostics、rendererVersion、sourceHash 和缩略图都是 Derived cache。 | Must |
| R15 | 当前 Orca Architecture 的 SQLite `orchestration.db` 不保存 diagram 正文。 | Must |
| R16 | standalone `scryer/` 如仍作为可运行产品，必须至少保持 `.scry` 数据兼容；UI 同步可单独排期，但不能丢失 `diagrams` 或 `diagramRefs`。 | Must |

## Data ownership rules

| Data | Source of truth | Notes |
|---|---|---|
| Diagram source | `.scry` top-level `diagrams` | 用户和 MCP 修改的权威内容。 |
| Diagram refs | `.scry` top-level `diagramRefs` | 记录 C4、flow、source file 与 diagram/element 的关系。 |
| Render diagnostics | Derived cache / memory | 可由当前 source 重新计算，不写入 `.scry`。 |
| SVG / PNG / thumbnail | Derived cache | 可删除、可重建，不参与 model revision 真相。 |
| rendererVersion / sourceHash | Derived cache key 或 render result | 用于判断缓存是否过期，不作为业务数据。 |

## Out of scope

- 不把 UML 图强行转成 C4 node。
- 不让 diagram 影响 C4 自动布局。
- 不用 diagram 替代 API contract、business rules table、Database/data contract 或测试。
- 不在 Orca 里新增一套独立 AI provider。AI 仍走 Orca 现有 agent / MCP 路径。
- 不把 `Backend/API` 误写成传统 HTTP 后端；本功能的 `API contract` 指 Electron IPC 和 MCP tool。

## Definition of done

- `.scry` 可以读写 `schemaVersion`、`diagrams` 和 `diagramRefs`；不把 SVG、PNG、diagnostics 或 thumbnail 当成 Source of truth。
- Architecture 页面三类入口互不污染：C4、flow、diagram。
- AI/MCP 工具能创建、更新、删除 diagrams 和 diagramRefs。
- Mermaid 渲染通过 `DiagramRenderAdapter` 提供；默认复用 Orca 现有 `mermaid` 渲染能力，只有现有 renderer 无法满足源码行号、SVG element 映射或图类型覆盖时，才引入或 fork `beautiful-mermaid`。
- SVG 点击能反向跳到 C4 或 flow 对象。
- 错误定位、PNG 导出、复制 SVG、缩略图缓存可用。
- 同一个 `.scry` 文件在 Orca 和仍受支持的 standalone `scryer/` 中至少保持数据不丢失。
- Automated checks、Live verification、Drift check 和 traceability matrix 完成。
