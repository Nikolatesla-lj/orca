# Scryer Diagram Library Terminology

日期：2026-05-26

本文统一本功能所有开发文档的用词。后续 Codex、Claude 或人工开发都必须按这里理解术语，避免把 Orca 的 Electron 架构误解成传统 Web 后端。

## Required vocabulary

| Term | Meaning in this feature | Do not interpret as |
|---|---|---|
| PRD issue | GitHub 上的父级需求 issue，负责记录产品目标、范围、用户故事和决策。 | 详细接口契约或完整实现计划。 |
| Task slice issue | GitHub 上的端到端任务 issue，一个任务必须能独立开发、测试和审查。 | 只改一个文件的技术清单。 |
| Local task doc | GitHub Issues disabled 时的临时任务文档，位于 `docs/tasks/local/`，必须使用和 Task slice issue 相同的 Context Checklist。 | 绕过任务追踪直接编码。 |
| Context Checklist | Task slice issue 或 Local task doc 中的上下文检查清单。没有它，任务不能进入编码。 | 可跳过的备注。 |
| Contract docs | 仓库里的长期契约文档，记录 API、状态、数据、业务规则和错误规则。 | 只放在 issue 里的临时描述。 |
| Implementation contracts | 关键导出函数、组件 props、handler、IPC 的输入输出和真实测试门禁。 | 私有函数逐行实现教程。 |
| Architecture baseline | 说明代码应该放在哪里、层之间如何通信、哪些依赖允许使用。 | C4 图本身。 |
| System contracts | 约束实现的总称，包括 API contract、business rules table、frontend state model、backend state model、database/data contract。 | UML 或 Mermaid 图。 |
| API contract | Orca 本功能中的接口契约，具体包括 `architecture:*` Electron IPC 和 Scryer MCP tool，不默认指 HTTP route。 | REST/GraphQL/Web server route。 |
| Backend/API | Orca 的 Electron main process、IPC handler、Scryer model-store、MCP tools 和 cache service。 | 独立 Web 后端服务。 |
| Frontend | Orca renderer 里的 React Architecture 页面、Model tree、Flow tree、C4 canvas、FlowScriptView、Diagram review view 和 inspector。 | 单独网页应用。 |
| Frontend state model | 前端需要保存和切换的状态，例如 selected node、active flow、active diagram、loading/error、render cache state。 | `.scry` 文件结构。 |
| Backend state model | 主进程和 MCP 工具维护的状态，例如 model revision、sync 状态、cache key、validation result。 | 用户界面状态。 |
| Database/data contract | 持久化数据契约。本功能的 source of truth 是 `.scry` 文件；SQLite 不保存 diagram 正文。 | 必须新增数据库表。 |
| Real data path | 真实读写路径：用户或 agent -> frontend/MCP -> IPC/main process -> model-store -> `.scry`。 | mocked test 或临时内存数据。 |
| Business rules table | “条件 -> 系统行为”的规则表。 | UI 文案清单。 |
| Routing model | 用户从 tree/toolbar 进入 C4、flow、diagram 的前端路由，以及 IPC/MCP 调用路径。 | Web URL 路由。 |
| Traceability matrix | 需求、契约、任务、代码、测试、live evidence 的对应表。 | 总结说明。 |
| Live verification | 在真实 Orca UI 或真实 MCP 路径里验证用户流程，并留下截图、日志或文件证据。 | 只跑单元测试。 |
| Drift check | 检查 PRD、contract docs、UML/architecture docs、code、tests、live evidence 是否一致。 | 只检查 `.scry` 与源码 mtime。 |
| Source of truth | 权威数据来源。本功能中 C4、flow、diagram、diagramRefs 的 source of truth 是同一个 `.scry` 文件。 | 缓存、SVG、PNG 或 SQLite。 |
| Derived cache | 可删除、可重建的派生数据，例如 SVG/PNG 缩略图；有些派生结果可以只存在内存里。 | 不能丢失的业务数据。 |
| Diagram | Mermaid/UML/其他补充图的源码数据，存于 top-level `diagrams`。 | C4 node 或 flow step。 |
| DiagramRef | C4 node、edge、group、flow、flow step、source file 到 diagram 或 SVG element 的引用。 | C4 edge。 |
| Diagram library | Architecture 左侧导航中的 diagram 列表，位于 Model tree 和 Flow tree 下方，按 `Diagram.kind` 分组。 | 整个 Scryer Diagram Library 功能、C4 tree、flow tree。 |
| Diagram review view | Architecture 主内容区中查看和编辑单个 diagram 的视图。S1 使用 `DiagramSourceDraftView`，S2 及之后使用 `DiagramReviewView`。 | C4 canvas、FlowScriptView、独立 Web 页面。 |
| C4 canvas | `ArchitectureCanvas` 拓扑视图，只渲染 C4 `nodes` 和 `edges`。 | HTML `<canvas>` 或 Mermaid/SVG 渲染区。 |
| HTML Canvas game surface | Pipe Runner 验证样例中的浏览器 `<canvas>` 游戏绘制区域。 | Orca Architecture 的 C4 canvas。 |
| E2E validation sample | 用于验证真实开发流程的样例应用，例如 Pipe Runner。它必须有设计、代码、模型、diagram、refs 和 live verification。 | Orca 产品功能、随意演示页面、mock-only demo。 |
| DiagramRenderAdapter | 前端渲染 diagram 的统一接口，默认复用 Orca 现有 Mermaid 渲染链路，必要时才接入 `beautiful-mermaid` adapter/fork。 | 必须新增的一套独立渲染产品。 |
| Render result | 根据 diagram source 生成的 SVG、diagnostics、elements、sourceHash、rendererVersion。 | `.scry` 里的长期业务数据。 |

## Naming rules for this feature

- Use `Backend/API` when describing Electron IPC, main-process services, MCP tools, model-store, cache service, and prompt preparation.
- Use `Database/data` when describing `.scry` storage, cache files, and the explicit decision not to add SQLite schema.
- Use `API contract` only for IPC/MCP contracts unless the document explicitly says HTTP.
- Use `Source of truth` only for `.scry` model data.
- Use `Derived cache` for SVG、PNG、thumbnail、diagnostics、sourceHash、rendererVersion and any render output that can be regenerated; diagnostics may be memory-only unless a future contract defines a cache file format.
- Use `Live verification` only when the real Orca UI or real MCP path is exercised.
- Use `Drift check` for docs-code-test-evidence alignment; use `architecture drift detection` only for the existing `drift.ts` source-map mtime logic.
- Use `Diagram library` exactly for the left navigation list. Use `Scryer Diagram Library` only for the whole feature name.
- Use `Diagram review view` for the main diagram editing/review surface, and use exact component names `DiagramSourceDraftView` or `DiagramReviewView` when a slice depends on a specific component.
- Use `C4 canvas` for `ArchitectureCanvas`. Use `HTML Canvas game surface` for a browser `<canvas>` game.
- Use `E2E validation sample` for Pipe Runner-style validation work. The existing path `docs/scryer-dogfood/` is a legacy directory name, not the preferred term in new prose.

## Terms to avoid

| Avoid | Use instead | Reason |
|---|---|---|
| backend route | `architecture:*` IPC channel or MCP tool | This is not a Web server route. |
| database row/table for diagram | `.scry` diagram data or derived cache file | Diagram source must remain portable with the model file. |
| UML node | diagram or diagram element | UML/Mermaid details must not become C4 nodes. |
| render source of truth | derived render output | SVG/PNG is generated from Mermaid source. |
| E2E only means Playwright | Live verification plus affected automated checks | The skill requires real data path evidence, not only a browser test. |
| dogfood sample | E2E validation sample | Prefer a standard testing term over product-team slang in implementation docs. |
| canvas, when ambiguous | C4 canvas or HTML Canvas game surface | These are different UI surfaces and must not share implementation assumptions. |
| diagram view, when ambiguous | Diagram review view, DiagramSourceDraftView, or DiagramReviewView | The implementation behavior changes by slice. |
