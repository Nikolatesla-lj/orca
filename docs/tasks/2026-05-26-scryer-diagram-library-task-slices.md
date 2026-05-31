# Scryer Diagram Library Task Slices

日期：2026-05-26

## Parent

- PRD issue: Preferred but unavailable. `Nikolatesla-lj/orca` currently has GitHub Issues disabled; until Issues are enabled, use local task docs under `docs/tasks/local/` with the same Context Checklist and traceability rules.
- PRD doc: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- Terminology: `docs/contracts/2026-05-26-scryer-diagram-library-terminology.md`
- Contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- Implementation contracts: `docs/contracts/2026-05-26-scryer-diagram-library-implementation-contracts.md`
- Error codes: `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md`
- Traceability: `docs/contracts/2026-05-26-scryer-diagram-library-traceability.md`
- Architecture: `docs/architecture/2026-05-26-scryer-diagram-library-architecture.md`
- Verification: `docs/testing/2026-05-26-scryer-diagram-library-verification.md`
- Fixture catalog: `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md`

## Slice rules

- 每个 Task slice issue 必须引用 PRD requirement、Business rule、API contract、Database/data contract 和 Verification case。
- 每个 Task slice issue 必须引用它会修改的 implementation contract 函数、组件 props、handler 或 IPC path。
- 每个 Task slice issue 必须引用 fixture IDs、error codes、traceability rows 和 live evidence IDs。
- 不从 UML 或 plan 直接编码；先确认对应 contract row。
- 允许少量 foundation slice 建立 schema、parser、render queue 等共享基础，但每个 foundation slice 必须足够小，能独立测试和审查。
- `Backend/API` 指 Electron IPC、model-store、MCP tools、CLI bridge 和 cache service，不指 HTTP 后端。
- `Database/data` 指 `.scry` 和 `.scryer/cache/diagrams`，不新增 SQLite schema。
- GitHub Issues 可用时，必须使用 GitHub PRD/task slice issues。
- GitHub Issues disabled 时，可以使用 `docs/tasks/local/<local-task-id>.md` 作为临时任务入口；没有本地 task 文档和完整 Context Checklist 时，不能进入 coding。
- Local task doc status values are fixed:
  - `ready-for-agent`: Codex may implement this slice.
  - `blocked`: do not implement until every listed blocker is complete.
  - `needs-triage`: do not implement until a human or agent updates the task to either `ready-for-agent` or `blocked` with explicit blockers.
  - `complete`: implementation and task-level verification for this local slice passed; follow-up slices may depend on this status, but traceability rows still remain incomplete until required live evidence is recorded.
- Only local task docs marked `ready-for-agent` may be used for coding.

## Required Context Checklist template

Every Task slice issue must copy this checklist. A slice is not ready for Codex implementation until every required item is checked or has an explicit blocker.

- [ ] PRD issue URL is present, or local PRD/task fallback is explicitly used because GitHub Issues are disabled.
- [ ] This task slice issue URL or local task doc path is present in this document.
- [ ] Requirement IDs are listed.
- [ ] Business rule IDs are listed.
- [ ] API contract rows are listed.
- [ ] Implementation contract rows are listed for changed functions/components/handlers/IPC.
- [ ] Required exact exported function/component/handler/IPC names are listed.
- [ ] Error codes from `error-codes.md` are listed for every failure path.
- [ ] Traceability rows from `traceability.md` are listed.
- [ ] Fixture IDs from `fixtures.md` are listed.
- [ ] Frontend state contract rows are listed when the slice touches UI state.
- [ ] Backend/API files are listed.
- [ ] Database/data path is listed, including whether `.scry` or Derived cache is touched.
- [ ] Real data path is stated from user/MCP action to `.scry` or cache file.
- [ ] Existing code files to inspect are listed.
- [ ] Automated tests to add/update are listed.
- [ ] Live verification evidence is listed.
- [ ] Drift check requirement is listed.
- [ ] Mock usage, if any, is justified.
- [ ] Non-mocked real-path evidence that pairs with any mock is listed.
- [ ] Known blockers are listed.

## Strict Task Issue Template

Every GitHub task slice issue or local task doc must use this structure. A task that omits any required section remains blocked and must not be implemented by Codex.

```md
## Parent and status
- PRD issue:
- Task slice issue:
- Local task doc:
- Current status: ready-for-agent | blocked | needs-triage | complete
- Coding gate: blocked until either GitHub issue URLs are present or a local task doc exists with Context Checklist and linked contracts.

## Requirement trace
- Requirement IDs:
- Business rule IDs:
- Traceability rows:
- Live evidence IDs:

## Contract rows to implement
- System contract sections:
- Frontend state rows:
- Backend/API rows:
- Database/data rows:
- Error codes:
- Fixture IDs:

## Required exact implementation names
- Functions:
- Components/props:
- MCP handlers:
- IPC channels/types:
- CLI bridge names:

## Existing code to inspect before coding
- Frontend files:
- Backend/API files:
- Database/data files:
- Existing tests:

## Real data path
- User action or MCP call:
- Frontend state transition:
- Backend/API call:
- Persistence/cache path:
- Reload/read-back proof:

## What to build
Describe the end-to-end behavior through the real UI, MCP, IPC, and `.scry`/cache path. Do not describe only a layer or file.

## Acceptance Criteria
- [ ] User-visible result:
- [ ] API/result shape:
- [ ] `.scry` or Derived cache result:
- [ ] Error/empty/loading state:
- [ ] Regression behavior:
- [ ] No production placeholder, no no-op success, no mock-only completion evidence:

## Required automated tests
| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
|  |  |  |  |

## Required negative tests
| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
|  |  |  |  |

## Live verification steps
1. Open a temp Orca workspace copied from the listed fixture.
2. Perform the exact user or MCP actions listed in this issue.
3. Record visible result in the affected Architecture view.
4. Record before/after `.scry` or cache file evidence.
5. Record network/IPC/MCP command evidence when the slice touches Backend/API.
6. Record the expected error state for one negative path when this slice has user-visible errors.

## Mock policy
- Mocks used:
- Why the mock is allowed:
- Non-mocked test proving completion:

## Drift and PR evidence
- Drift check required:
- PR evidence fields to fill:
- Traceability rows to mark complete only after tests and live evidence pass:

## Blockers
- GitHub Issues disabled:
- Local task doc missing:
- Missing contract:
- Missing fixture:
- Missing test environment:
```

Template rules:

- `Required exact implementation names` must list the exact exported names from implementation contracts. "Equivalent helper" or "candidate" wording is not allowed in a task issue.
- `Required automated tests` must name the real fixture file and exact assertion. "Component test" alone is not enough.
- `Live verification steps` must name the exact UI path, MCP command, `.scry` file, cache path, and expected visible result. A page-load screenshot alone is not enough.
- If a slice uses a mock, the paired non-mocked test must be in the same task issue.
- If GitHub Issues are disabled, create the local task doc first. Do not implement directly from this aggregate task-slices document.

## Context requirements by slice

When GitHub Issues are enabled, create one issue per row below. While GitHub Issues are disabled, create one local task doc per row under `docs/tasks/local/`. Each issue or local task doc must copy the checklist above and fill it with that row's context. If any cell is still missing, that slice stays blocked.

| Slice | Requirement IDs | Contract sections | Existing code to inspect before coding | Tests/live evidence required |
|---|---|---|---|---|
| F1A | R14 | `.scry` data contract, Migration and validation rules, parser/helper implementation contracts, id generation rules, shared Mermaid kind detection | `src/shared/scryer/model-types.ts`, `src/shared/scryer/parse-model.ts`, `src/shared/scryer/diagram-kind.ts`, `src/main/scryer/model-store-core.ts` | FX1/FX3/FX4 parser tests, model-store tests, id helper tests, directive mapping tests |
| F1B | R7, R8 | Render result contract, render adapter function contracts, SVG click binding rules | `src/renderer/src/components/editor/MermaidBlock.tsx`, `src/renderer/src/components/editor/mermaid-config.ts`, `src/renderer/src/components/architecture/diagram-renderer.ts`, shared `detectMermaidDiagramKind` from F1A | FX5/FX6/FX7/FX12/FX13/FX14 real Mermaid adapter tests, FX15/FX16/FX17 support-matrix tests, render queue serialization test, sanitized SVG annotation test |
| S1A | R1-R6, R14 | Frontend state contract, Database/data contract, controller function contracts, DiagramSourceDraftView props, minimum dirty-draft guard, internal feature flag release gate | `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`, `model-store.ts` | FX1/FX2 controller and Diagram library CRUD/minimum dirty guard tests, non-mocked persistence reload test, live evidence L1-L3A with `enableArchitectureDiagramLibraryPreview` enabled |
| S1B | R1-R6, R14 | Frontend state contract, full dirty draft coverage, external reload conflict, Diagram library large-list/accessibility rules | `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`, `DiagramSourceDraftView.tsx` | FX2/FX9 expanded navigation guard, large-list, keyboard/accessibility tests, live evidence L3A/L5 plus dirty switch evidence |
| S2 | R7, R8 | Render result contract, render adapter function contracts, DiagramReviewView source save rules, external reload conflict rules | `MermaidBlock.tsx`, `mermaid-config.ts`, `DiagramReviewView.tsx`, `diagram-renderer.ts` | FX2 persistence plus FX5/FX6/FX7/FX11/FX12/FX13/FX14 real Mermaid adapter tests, FX15/FX16/FX17 support-matrix tests, invalid Mermaid UI evidence L3B-L4, external reload conflict test |
| S3 | R9, R10 | DiagramRef deletion policy, sourceMap and source diagramRefs, parser/ref cleanup function contracts, pure source target pattern validation | `ArchitectureContextPanel.tsx`, `FlowScriptView.tsx`, `parse-model.ts`, `mcp-tools.ts`, `src/shared/scryer/source-targets.ts` | FX2/FX3/FX4 refs validation tests, nested flow step tests, non-mocked `.scry` ref persistence test, live evidence L6 |
| S3A | R9, R10 | DiagramRef creation workflow, frontend state contract, source editor save rules | `ArchitectureContextPanel.tsx`, `ArchitectureModelTree.tsx`, `DiagramReviewView.tsx`, `useArchitectureModelController.ts` | FX2/FX5 create-diagram-then-link persistence test and live evidence L6 |
| S4 | R9, R10 | Element key algorithm, Frontend state contract, render adapter and optional `DiagramReviewViewRefActions`, `DiagramElementTargetPickerProps`, source target runtime resolution/opening rules, `resolveDiagramElementNavigation`, `validateWorkspaceRelativeSourcePattern`, `resolveWorkspaceSourcePattern`, `openDiagramSourceTarget` | `DiagramReviewView.tsx`, `ArchitectureCanvas.tsx`, `useArchitectureModelController.ts`, `source-map-paths.ts`, S7A filesystem-auth wrapper if created | FX2/FX3/FX5 stable elementKey test, one-target click E2E, multi-target picker props test, source open safety evidence L7 |
| S5 | R11, R12 | API contract: MCP tools, MCP CLI `toolInputSchema` contract, MCP handler contracts | `src/shared/scryer/model-types.ts`, `src/main/scryer/mcp-tools.ts`, `src/cli/scryer-mcp-server.ts` | FX2/FX3 MCP handler mode tests, external CLI `tools/list` evidence L8, UI reload evidence; blocked until S7A provides real cache cleanup |
| S6 | R11, R12 | Prompt/rules contract, AI prompt integration contracts, DriftReport contract, hash/cache helper contracts | `prompt-diagram-instructions.ts`, `prompts.ts`, `rules.ts`, `drift.ts`, `mcp-tools.ts`, `prompts.test.ts` | FX2/FX9 prompt compactness test, prompt entry-point tests, real `get_task` diagram-to-code prompt assembly test, scoped target matching test, drift test, sync prompt evidence L10 |
| S7A | R13, R14, R15 | cache safety rules, Hash and cache key rules, Database/data contract, cache IPC contracts, real `clearDiagramCache`, `assertAuthorizedArchitectureProjectPath(projectPath, store)`, reuse of `filesystem-auth.ts`, cache size constants | `architecture.ts`, optional thin `architecture-project-auth.ts`, `diagram-cache-client.ts`, `src/preload/api-types.ts`, `src/preload/index.ts`, `src/main/ipc/filesystem-auth.ts`, `src/main/ipc/repos.ts`, `src/main/ipc/worktrees.ts` | FX5/FX8 real cache path security tests, filesystem-auth authorization tests, clear cache tests, `.scry` no render output check |
| S7B | R13, R14, R15 | S7B-only export actions, thumbnail cache UI, UI delete cleanup integration, S5 MCP delete cleanup regression verification | `DiagramReviewView.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`, `html-to-image` usage; S5 MCP tests are rerun but S7B must not edit MCP tool schemas or handlers | FX5/FX8/FX11 export/copy live evidence L9, thumbnail cache/performance evidence, UI delete cleanup warning evidence, S5 MCP delete cleanup regression evidence |
| S8 | R16 | standalone explicit-plus-preserve rule, Migration and validation rules, parser/helper implementation contracts | `../scryer/src/types.ts`, `../scryer/src/hooks/useModelStorage.ts`, `../scryer/crates/scryer-core/src/lib.rs` | FX10 Orca -> standalone -> Orca round trip, live evidence L11; standalone UI is out of scope |
| S9 | R1-R16 | all contract sections | all changed files from F1A-S8 plus S1A, S1B, S3A, S7A, and S7B | FX1-FX17 full comprehensive suite, traceability matrix, PR evidence L1-L11 |

## F1A - Schema and parser foundation

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-F1A.md` required before coding.

## What to build

建立所有后续端到端切片共享的数据基础：`.scry` schema v2、Diagram / DiagramRef 类型、parser normalize、blank model 默认值、diagram/ref id helper、Diagram library stable sort helper。

## Scope

| Layer | Scope |
|---|---|
| Frontend | 只新增共享 helper 类型或纯函数；不做 DiagramReviewView UI。 |
| Backend/API | `model-types.ts`、`parse-model.ts`、`model-store-core.ts` 认识 `schemaVersion`、`diagrams`、`diagramRefs`。 |
| Database/data | 旧 `.scry` 按 v1 读取，新保存写 v2；`.scry` 不保存 render output。 |
| Business rules | BR1, BR7, BR11。 |

## Acceptance Criteria

- [ ] 旧 `.scry` 文件加载后得到 `diagrams: []`、`diagramRefs: []`。
- [ ] 新保存文件写入 `schemaVersion: 2`。
- [ ] Invalid refs 被保留为 dangling warning，不被静默改指向。
- [ ] Undo/redo fingerprint 包含 diagrams 和 diagramRefs。
- [ ] `createDiagramId`、`createDiagramRefId`、diagram stable sort helper 满足 system 和 implementation contract。
- [ ] `normalizeDiagrams`、`normalizeDiagramRefs`、`validateDiagramRefs`、`pruneDiagramRefsForDeletedTarget` 满足 implementation contract。
- [ ] 本 slice 不实现 render adapter、cache IPC 或 standalone UI。

## F1B - Render queue and adapter shell

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-F1B.md` required before coding.

## What to build

抽出或复用现有 Mermaid 全局 render queue，建立 `DiagramRenderAdapter` 默认 adapter，支持真实 Mermaid 渲染、diagnostic、sanitized SVG 和 `data-diagram-element-key` 绑定。

## Scope

| Layer | Scope |
|---|---|
| Frontend | 抽出 `mermaid-render-queue.ts`，新增 `diagram-renderer.ts`，实现 `detectDiagramKind`、`renderDiagram`、`extractRenderedElements`。 |
| Backend/API | 不新增 IPC，不写 cache，不改 model-store。 |
| Database/data | 不读写 `.scry` 或 Derived cache。 |
| Business rules | BR5。 |

## Acceptance Criteria

- [ ] `DiagramRenderAdapter` 默认 adapter 复用现有 `mermaid`、DOMPurify 和 render queue。
- [ ] `renderDiagram(diagram, options)` 是唯一 adapter render 函数名。
- [ ] `DiagramDiagnostic.code` 必填，并使用 `renderer.*` 或相关 `parser.*` code。
- [ ] Valid Mermaid 通过 existing Mermaid adapter 渲染 sanitized SVG；core fixtures FX5/FX6/FX12/FX13/FX14 must render.
- [ ] Invalid Mermaid 返回 diagnostic，不覆盖 source。
- [ ] Bindable SVG elements 包含 `data-diagram-element-key`，raw event handlers 被移除。
- [ ] 本 slice 不实现 thumbnail cache、copy/export 或 cache IPC。

## S1 - Create diagram and persist after reload

Task issue: Preferred GitHub issue URL or local task docs `docs/tasks/local/LOCAL-S1A.md` and `docs/tasks/local/LOCAL-S1B.md` required before coding. `LOCAL-S1.md` is now a parent summary only and must not be used as the direct coding entry.

S1 split rule:

- `LOCAL-S1A` owns Diagram library list, internal feature flag, create/default source/rename/save/delete persistence, source-only shell, and the minimum dirty guard needed to prevent draft loss if the internal flag is manually enabled.
- `LOCAL-S1B` owns complete dirty-draft navigation coverage, external reload conflict handling, keyboard/accessibility coverage, large-list behavior, and C4/flow/model switch protection.
- Do not merge a partial S1 implementation unless the matching local subtask is complete with its own tests and live evidence.

## What to build

用户在 Architecture 页面左侧 `Diagram library` 创建一个 Mermaid diagram，编辑源码，保存，重载后仍能看到同一个 diagram。

## Scope

| Layer | Scope |
|---|---|
| Frontend | `ArchitectureModelTree` 增加 Diagram library，`ArchitecturePanel` 能切换到真实 `DiagramSourceDraftView` source draft/save shell，并通过 controller contract 的 `createDiagram`、`renameDiagram`、`updateDiagramSource`、`deleteDiagram` 完成持久化操作；不实现 SVG render pane；source-only UI 必须受 `enableArchitectureDiagramLibraryPreview` 内部 flag 控制。 |
| Backend/API | 现有 read/write model 携带 diagrams；watcher reload 后高亮 diagram 变更。 |
| Database/data | `.scry` top-level `diagrams` 持久化 source，不保存 SVG/PNG/diagnostics。 |
| Business rules | BR1, BR4, BR11, BR14。 |

## Acceptance Criteria

- [ ] Diagram library 位于 Model tree 和 Flow tree 下方，并按 kind 分组编号。
- [ ] S1 UI is visible only when internal feature flag `enableArchitectureDiagramLibraryPreview` is enabled. Default user-facing builds must not expose a source-only Diagram library as complete functionality.
- [ ] Diagram library 实现 empty/loading/error/large-list 行为：空状态带 Create diagram；>20 diagrams 时有 search/filter 和可折叠 kind groups；unlinked diagrams 显示 `Unlinked`。
- [ ] 点击 C4 node 时只显示 C4 canvas，不混入 diagram 元素。
- [ ] 点击 flow 时显示 FlowScriptView。
- [ ] 点击 diagram 时显示真实 `DiagramSourceDraftView` source draft/save shell；如果 S2 尚未完成，不显示 SVG render、diagnostic、copy/export 或 thumbnail UI。
- [ ] 新建 diagram 必须调用 `createDefaultDiagramSource(...)`，再把非空有效 Mermaid source 传给 `createDiagram`；不允许先保存空 source。
- [ ] 新建、改名、显式保存 source 后重载仍保留；输入过程中的 draft 不自动落盘；显式保存用 F1A shared `detectMermaidDiagramKind` 修正 persisted `Diagram.kind`，不依赖 renderer adapter。
- [ ] 删除 diagram 会删除其 refs。S1 不实现 cache IPC，也不使用 no-op cache cleanup 冒充完成；UI Derived cache cleanup 由 S7B backfill。
- [ ] `createDiagram`、`renameDiagram`、`updateDiagramSource`、`deleteDiagram` 通过 controller persistence path 写入真实 `.scry`；只改 React state 不算完成。
- [ ] Live evidence 必须按模板操作：复制 FX2 到临时 Orca workspace，打开 Architecture tab，创建/改名/编辑/删除 diagram，重载模型，记录 `.scryer/model.scry` before/after、Diagram library、DiagramSourceDraftView 和返回 C4 canvas 的截图。
- [ ] S1 只能作为 internal merge slice；在 S2 完成前不能作为“diagram 审查页面已完成”的用户可见发布点。
- [ ] S1 keyboard/accessibility evidence covers Diagram library focus, group expand/collapse, Enter navigation through `requestArchitectureNavigation`, source shell controls, and dirty-dialog buttons.

## S2 - Render Diagram review view safely

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S2.md` required before coding.

## What to build

用户点击 diagram 后，Architecture 主内容区同时显示 Mermaid source 和 SVG render；语法错误显示清楚 diagnostic；source editor 使用本地 draft、显式 Save 和固定未保存切换确认。批量缩略图缓存不属于本 slice。

## Scope

| Layer | Scope |
|---|---|
| Frontend | DiagramReviewView split view、local source draft、Save/Cmd+S、diagnostic panel、safe SVG injection、render adapter。 |
| Backend/API | 不新增 cache IPC；只通过 existing model write path 保存 source。 |
| Database/data | 显式 Save 后写 `.scry` top-level `diagrams[].source`；不写 Derived cache。 |
| Business rules | BR5。 |

## Acceptance Criteria

- [ ] Valid Mermaid 通过 existing Mermaid adapter 渲染 SVG。
- [ ] S2 keeps `enableArchitectureDiagramLibraryPreview`, sets its default to on after the complete review page passes acceptance, and records that fixed release-control choice. It must not remove or replace the flag.
- [ ] Runtime render uses the current local draft source; cache remains unused in S2 and no render output is persisted.
- [ ] Invalid Mermaid 显示 message；parser 能提供时显示 line/column。
- [ ] Invalid Mermaid 保存后仍持久化 source，但 render pane 显示 invalid/stale 状态；S2 不显示 copy/export controls。
- [ ] S2 不传 `refActions`，不显示 ref-management controls，也不传 no-op ref/navigation callbacks；S3/S4 才接入 `DiagramReviewViewRefActions`。
- [ ] 未保存 draft 切换 C4、flow、另一个 diagram 或 model 时必须走 controller 的 `requestArchitectureNavigation`，显示 Save and switch、Discard and switch、Cancel；保存失败停留当前 diagram。
- [ ] External reload modified conflict shows Keep draft、Reload from disk、Compare changes；Compare changes opens read-only diff and closing it returns to the same conflict state.
- [ ] External reload deleted conflict shows Keep draft、Discard deleted、Cancel；Discard deleted applies active diagram deletion fallback, and Compare changes is not shown.
- [ ] SVG 注入 DOM 前经过 DOMPurify。
- [ ] DiagramReviewView 不直接并发调用 `mermaid.render()`；thumbnail 并发规则由 F1B 队列和 S7B 缩略图测试覆盖。
- [ ] `architecture-beta`、`gitGraph`、`C4Context` 必须读取 FX15/FX16/FX17，有明确支持状态：支持则渲染，不支持则结构化 `renderer.unsupported-kind` diagnostic；测试不能临时手写 Mermaid 字符串。
- [ ] `beautiful-mermaid` 只有在 adapter 能力缺口被测试证明后才引入或 fork。
- [ ] `detectDiagramKind`、`renderDiagram`、`extractRenderedElements` 使用 implementation contract 的输入输出。
- [ ] E2E spec `architecture-diagram-library.spec.ts` 覆盖打开 diagram、有效渲染、无效 Mermaid diagnostic。
- [ ] Invalid Mermaid live evidence 必须使用 FX7：打开 diagram，触发 diagnostic，记录错误文本、行列信息（如果 available）和 source 未被覆盖的截图。
- [ ] 本 slice 不实现 cache IPC、thumbnail cache、copy SVG、export PNG 或 no-op copy/export props；这些属于 S7A/S7B，其中 UI copy/export 和 thumbnail 属于 S7B。

## S3 - Attach diagram refs from C4, flow, and source

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S3.md` required before coding.

## What to build

用户可以从 C4 node、edge、group、flow、nested flow step 和 source file 关联 existing diagram；whole diagram ref 在目标对象侧创建，SVG element ref 只能从稳定 `elementKey` 创建。

## Scope

| Layer | Scope |
|---|---|
| Frontend | Context panel 和 FlowScriptView 增加 diagram reference 管理；支持 nested step refs。 |
| Backend/API | parser 和 validation 校验 ref target；delete paths 清理或报告 dangling refs。 |
| Database/data | `.scry` top-level `diagramRefs` 保存关联表。 |
| Business rules | BR2, BR3, BR4, BR6。 |

## Acceptance Criteria

- [ ] Node、edge、group、flow、flow step 都能添加和移除 diagramRef。
- [ ] Add diagram reference 打开 existing diagram picker；S3 不内联新建 diagram。
- [ ] 用户必须选择 role；默认 role 只是建议，`other` 必须填写 note。
- [ ] Whole-diagram ref 不写 `elementKey`。
- [ ] `flowStep` 查找必须递归进入 branches，不依赖数组 index。
- [ ] 移动 flow step 后 refs 仍有效。
- [ ] 删除 flow 会清理该 flow 和所有 nested steps 的 refs。
- [ ] 删除 step 会清理该 step 和其 nested branch steps 的 refs。
- [ ] 外部 MCP 写入坏 ref 时，UI 显示 dangling warning，不崩溃。
- [ ] `createDiagramRef`、`upsertDiagramRefs` 和 `deleteDiagramRefs` 成功后真实 `.scry` 的 `diagramRefs` 发生对应变化。
- [ ] Source target refs 必须通过 Source target safety rules；unsafe path/glob 返回 `controller.invalid-source-target` 或 `parser.invalid-source-target`，不能打开工作区外路径。
- [ ] Source refs 的 `line/endLine` 是代码文件位置；`sourceRange` 是 Mermaid source 位置，不能互相替代。
- [ ] Ref picker 必须支持键盘打开、选择 diagram、选择 role、保存和取消。
- [ ] 失败场景必须测试：missing diagram、missing target、invalid sourceRange、unsafe source target、duplicate ref id。

## S3A - Create diagram then link

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S3A.md` required before coding.

## What to build

用户从 C4 node、edge、group、flow、flow step 或 source file 的 Add diagram reference 入口，可以选择 `Create diagram then link`，新建 diagram 后回到原目标继续创建 ref。

## Scope

| Layer | Scope |
|---|---|
| Frontend | target-side reference picker 增加 Create diagram then link；保存 pending target；创建并保存 diagram 后回到 role selection。 |
| Backend/API | 复用现有 model write path；不新增 MCP 或 cache。 |
| Database/data | `.scry` top-level `diagrams` 和 `diagramRefs` 都必须通过真实保存路径写入。 |
| Business rules | S3 仍只做 existing diagram picker；S3A 才实现内联创建，避免 S3 变成大切片。 |

## Acceptance Criteria

- [ ] Add diagram reference 同时提供 Select existing diagram 和 Create diagram then link。
- [ ] pending target 不因切换到新 diagram 编辑页而丢失。
- [ ] Create diagram then link 的新 diagram 导航必须走 `requestArchitectureNavigation`，不能从 UI 直接调用 internal `selectDiagram`。
- [ ] Create diagram then link、role selection、`Link now` 和 cancel 都必须支持键盘操作。
- [ ] Create diagram then link 创建 diagram 时同样使用 `createDefaultDiagramSource(...)`，不创建空 source diagram。
- [ ] 新 diagram 保存成功后，用户回到原目标的 role selection。
- [ ] 最终保存 ref 后，`.scry` 同时包含新 diagram 和新 `DiagramRef`。
- [ ] 取消或保存失败时，不写半成品 ref；如果用户已经显式保存 diagram，diagram 可以保留但 ref 不自动创建，并显示 "Diagram created, not linked yet."。
- [ ] "Diagram created, not linked yet." 提示必须提供 `Link now`；原 pending target 仍存在时继续 role selection，目标已删除时打开 diagram-side ref picker 并显示 target unavailable。
- [ ] Live evidence 使用 FX2 + FX5：从目标侧新建 diagram，保存 source，选择 role，重载后记录 target-side 和 diagram-side ref list。

## S4 - SVG element binding and target navigation

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S4.md` required before coding.

Dependency rule: S4 requires LOCAL-S2, LOCAL-S3, and LOCAL-S7A before source target navigation can be completed. The SVG-to-C4/flow click path needs S2/S3; source file opening additionally needs S7A trusted project authorization through the filesystem-auth wrapper. Do not implement a second authorization helper inside S4.

## What to build

用户可以在 DiagramReviewView 里选择一个 bindable SVG element，创建 element-level ref；之后点击已绑定 element 时，Orca 定位到对应 C4 node、edge、group、flow、flow step 或 source location。这里不是浏览器历史返回，而是按 `DiagramRef.target` 导航。

## Scope

| Layer | Scope |
|---|---|
| Frontend | Delegated SVG click listener、hover affordance、reverse reference list、navigation state。 |
| Backend/API | source location 打开必须先通过 pure `validateWorkspaceRelativeSourcePattern(...)`，再通过 S7A-backed `resolveWorkspaceSourcePattern(...)` / `openDiagramSourceTarget(...)`，并执行 Source target safety rules。 |
| Database/data | `diagramRefs.elementKey`；adapter 能定位源码时同时写 `sourceRange`。 |
| Business rules | BR4, BR6。 |

## Acceptance Criteria

- [ ] Bound SVG element 点击后切到正确 view 并选中 target。
- [ ] Element-level ref 创建入口必须读取 `DiagramRenderedElement[]`，只允许选择带稳定 `elementKey` 的元素。
- [ ] 默认 SVG 点击是导航模式；只有点击 `Bind element` 后才进入绑定模式，`Esc`、`Cancel` 或保存 ref 后退出绑定模式。
- [ ] 创建 element-level ref 时，用户选择目标对象/source 和 role 后才保存 `DiagramRef`。
- [ ] Unbound SVG element 不导航。
- [ ] SVG 里不注入 raw event handler。
- [ ] Delegated click listener 只读取 `data-diagram-element-key`，并通过 `resolveDiagramElementNavigation(...)` + `diagramRefs.elementKey` 找目标。
- [ ] 一个 `elementKey` 只有一个唯一可导航目标时才直接跳转；多个 distinct targets 时必须显示 target picker，不允许自动选择第一条 ref。
- [ ] target picker 必须使用 `DiagramElementTargetPickerProps`，`candidates` 来自 `resolveDiagramElementNavigation(...)`，`onChoose` 才能导航，`onCancel` 不改变选择或打开源码。
- [ ] 多条 refs 指向同一个 target 时，picker 或 direct candidate 必须按 target 合并，并显示 roles/notes，不能把同一 target 当成多个跳转选择。
- [ ] Whole-diagram refs 在 reverse reference list 中逐条显示；点击某一行才导航到该行 target，点击 diagram title 或空白区域不自动猜目标。
- [ ] `svgSelector` 只允许作为 runtime helper，不写入 `.scry`。
- [ ] sourceRange 不可精确定位时显示 unavailable，不伪造行号。
- [ ] reverse reference list 同时显示 whole-diagram refs 和 element refs。
- [ ] Source target navigation must call pure `validateWorkspaceRelativeSourcePattern(...)` before opening files, then call S7A-backed `resolveWorkspaceSourcePattern(...)` before any glob expansion or file open. It rejects absolute paths, `..`, URL schemes, unsupported globs, unauthorized projects, and escaping glob/symlink matches before opening; valid-but-unopenable paths return `controller.source-open-failed`.
- [ ] Source file line jumps use `DiagramRefTarget.source.line/endLine`; `DiagramRef.sourceRange` is only the Mermaid source range and cannot be used as the code-file location.
- [ ] Source glob behavior is fixed: zero matches return `controller.source-open-failed` with `reason: 'no-matches'`; one match opens at the requested line; multiple matches show a picker and do not auto-open the first match.
- [ ] `Bind element` mode must be reachable by keyboard and exit with `Esc` or `Cancel`; default SVG click mode must not create refs.

## S5 - MCP and CLI bridge end-to-end

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S5.md` required before coding.

## What to build

外部 Codex/Claude 通过 Scryer MCP CLI 创建、读取、更新、删除 diagrams 和 diagramRefs，Orca UI 自动 reload 并显示结果。

## Scope

| Layer | Scope |
|---|---|
| Frontend | `architecture:callTool` 成功后 reload，高亮 diagram 变更。 |
| Backend/API | `model-types.ts`、`mcp-tools.ts`、`src/cli/scryer-mcp-server.ts` 同步新增 diagram tools。 |
| Database/data | MCP 写入 `.scry`，不写 SQLite。 |
| Business rules | BR7, BR8, BR11。 |

## Acceptance Criteria

- [ ] `set_diagrams` 创建或替换 diagrams。
- [ ] `set_diagrams` 遇到 payload `kind` 与 Mermaid source 第一行冲突时，返回 `mcp.validation-failed`，details 包含 `renderer.kind-conflict`，并且不写 `.scry`。
- [ ] `get_diagram` 返回 diagram 和 refs。
- [ ] `update_diagram_refs` 校验 diagramId 和 target。
- [ ] `update_diagram_refs mode:'delete'` only accepts `ref_ids`; missing `ref_ids` returns `mcp.mode-argument-missing`, and `data` in delete mode returns `mcp.validation-failed`.
- [ ] `delete_diagram` 删除 diagram 和 refs，并调用 S7A 已实现的真实 `context.clearDiagramCache`；S5 在 S7A 完成前保持 blocked，不允许 no-op。
- [ ] `get_model`、`get_node`、`get_changes`、`validate_model` 按 system contract 返回 compact diagram context、diagram diff 或 diagram validation summary；默认不返回 full `diagram.source`。
- [ ] 新工具出现在外部 CLI bridge 的 `TOOL_NAMES`、description 和 exact `additionalProperties: false` input schema 中。
- [ ] Orca 正在打开时，外部 MCP 改写 `.scry` 后 UI 自动 reload。
- [ ] `set_diagrams`、`delete_diagram`、`get_diagram`、`update_diagram_refs` 各模式按 implementation contract 返回 `ScryerToolResult`。
- [ ] MCP handlers use the split context contracts: `get_diagram` receives read context only, write handlers receive write context, and only `delete_diagram` receives delete context with `clearDiagramCache`.
- [ ] The MCP dispatcher/CLI bridge consumes optional `model`, loads the selected model, and passes `context.modelName`; handlers do not parse `model` from args.
- [ ] `set_diagrams` uses shared `detectMermaidDiagramKind`, not renderer code, for source-kind conflict checks.
- [ ] MCP payload 必须显式提供 Diagram/DiagramRef id；handler 不为外部 agent 自动生成 id。
- [ ] 至少一个测试通过外部 CLI bridge 调用真实 tool 或 `tools/list`；只 import handler 不算完成。

## S6 - Deep Build and Sync maintain diagrams without bloat

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S6.md` required before coding.

## What to build

Deep Build、Sync、get_task implementation prompt 和 MCP rules 使用同一套细粒度 diagram prompt 规则，让 AI 能根据代码生成必要 UML/Mermaid 图，也能在从 C4/flow/diagram 实现代码时读取并维护相关图，同时限制过度生成，避免 `.scry` 变臃肿。

## Scope

| Layer | Scope |
|---|---|
| Frontend | Deep Build / Sync 按现有按钮入口触发，不新增 provider。 |
| Backend/API | `prompt-diagram-instructions.ts`、`prompts.ts`、`rules.ts`、`drift.ts`、sync prompt、`TASK_INSTRUCTIONS` 和 MCP instructions 纳入 diagramRefs。 |
| Database/data | `diagramRefs` 的 source target 参与 drift 提示。 |
| Business rules | BR8。 |

## Acceptance Criteria

- [ ] Deep Build 只在 C4/flow 无法清楚表达细节或用户明确要求时创建 diagram。
- [ ] `buildDiagramPromptInstructions(...)` 必须只从 `prompt-diagram-instructions.ts` 导出；`initialModelPrompt`、`nodeFillPrompt`、`deepModelPrompt`、`syncPrompt`、`TASK_INSTRUCTIONS`、`SCRYER_RULES` 和 `MCP_INSTRUCTIONS` 必须导入或嵌入这个共享输出，不能各写一套分叉规则。
- [ ] `includeDiagramSourcesForTargets` 必须使用 implementation contract 中的 `diagramRefTargetMatchesPromptScope(...)` 规则，避免不同 prompt 入口用不同 target 匹配算法。
- [ ] `deepModelPrompt` 必须包含明确的 Diagram recovery 阶段：从代码判断是否需要 diagram，优先更新已有 diagram，必要时通过 `set_diagrams` 创建/更新，并通过 `update_diagram_refs` 关联到 C4、flow 或 source。
- [ ] `TASK_INSTRUCTIONS` 必须覆盖 diagram-to-code，并通过真实 `get_task` prompt assembly 测试证明生效：实现任务遇到 linked diagrams 时，先通过 compact summary 判断相关性；需要源码时调用 `get_diagram`；代码变更影响 diagram 时在同一任务范围内更新 diagram。
- [ ] 默认每个 C4 node 最多主动生成 1 个补充 diagram，超出必须说明原因。
- [ ] Sync 优先更新已有 diagram，不重复创建同一设计意图的 diagram。
- [ ] Drift report 能指出 source-linked diagramRefs 相关文件变化。
- [ ] Prompt 明确 UML/diagram 不能替代 API contract、business rules、Database/data contract 或测试。

## S7A - Cache service and clear API

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S7A.md` required before coding.

## What to build

实现真实 cache IPC、hash/cache helper、preload 暴露和 `clearDiagramCache`，供后续 S5 和 S7B 使用。

## Scope

| Layer | Scope |
|---|---|
| Frontend | typed cache client only；不显示 copy/export/thumbnail UI。 |
| Backend/API | cache IPC：read/write/clear，path containment，fixed size constants，hash cacheKey；复用 `filesystem-auth.ts` allowed roots / registered worktree roots；提供 S5 可调用的 real `clearDiagramCache`。 |
| Database/data | `.scryer/cache/diagrams`，Derived cache only。 |
| Business rules | BR9, BR10。 |

## Acceptance Criteria

- [ ] `outputProfile: 'review'` 只接受 SVG，`thumbnail` 和 `export` 只接受 PNG data URL。
- [ ] 任意 cache IPC request 不能写到项目 `.scryer/cache/diagrams` 外部。
- [ ] 任意 cache IPC request 必须先通过 `assertAuthorizedArchitectureProjectPath(projectPath, store)`，不能凭 renderer 传入的 `projectPath` 操作任意本机路径；authorization comes from existing `filesystem-auth.ts`, not from cache IPC args or prior readModel calls.
- [ ] S7A 不新增第二套授权表；如果新增 `architecture-project-auth.ts`，它只能是 `filesystem-auth.ts` 的 thin wrapper。
- [ ] Paths not allowed by `filesystem-auth.ts` return `cache.unauthorized-project`.
- [ ] Payload limits use hard constants `MAX_DIAGRAM_CACHE_SVG_BYTES = 2 * 1024 * 1024` and `MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES = 10 * 1024 * 1024`; oversize requests return `cache.payload-too-large`.
- [ ] Cache IPC 返回值必须使用 `DiagramCacheReadResult | DiagramCacheWriteResult | DiagramCacheClearResult | DiagramCacheFailure` union。
- [ ] Cache read/write request 必须包含 `outputProfile`。
- [ ] cache 损坏时返回 miss，不影响 `.scry`。
- [ ] `computeDiagramSourceHash`、`computeDiagramCacheKey`、cache IPC request/response 和错误码满足 implementation contract。
- [ ] cache 安全测试使用真实临时项目目录；mock filesystem 不能作为 path containment 完成证据。
- [ ] 本 slice 不实现 copy/export controls、thumbnail UI、UI delete backfill 或 MCP tool schemas。
- [ ] 本 slice 实现 `review`、`thumbnail`、`export` 三种 profile 的服务端读写/清理契约，但不把任何 profile 接入 UI。

## S7B - Copy, export, thumbnails, and delete cleanup integration

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S7B.md` required before coding.

## What to build

用户可以复制 sanitized SVG、导出 PNG，并在 Diagram library 看到缩略图；UI delete 使用 S7A 的真实 cache cleanup。MCP delete cleanup 由 S5 实现，S7B 只重新运行并记录该回归证据，不能修改 MCP tool schemas 或 handler。

## Scope

| Layer | Scope |
|---|---|
| Frontend | Toolbar actions、clipboard、PNG export、thumbnail list；为 DiagramReviewView 增加 S7B-only copy/export controls。 |
| Backend/API | 消费 S7A cache IPC；不重新定义 cache path、hash 或安全规则；不修改 MCP tool schemas 或 handler。 |
| Database/data | `.scryer/cache/diagrams`，Derived cache only。 |
| Business rules | BR9, BR10, BR15。 |

## Acceptance Criteria

- [ ] Copy SVG uses the current `DiagramReviewExportPayload.svg` from the successful sanitized render.
- [ ] Export PNG 从当前 `DiagramReviewExportPayload.svg` 生成，并通过 native save dialog 或现有 Orca save-file flow 选择目标路径。
- [ ] Export PNG 默认文件名是 sanitized diagram name，空名时用 diagram id，扩展名固定 `.png`；用户取消保存不是错误，不写文件、不写 cache、不写 `.scry`。
- [ ] Export PNG 写入失败显示 `controller.export-failed`，不更新 cache，也不改 `.scry`。
- [ ] copy/export controls 只在 S7B 出现；当前 render dirty/invalid/stale/locked 时禁用。
- [ ] Copy/export toolbar buttons 必须支持键盘访问、清晰 label 和 disabled state；disabled action 不得写 clipboard、文件、cache 或 `.scry`。
- [ ] Thumbnail cache key 使用 S7A `computeDiagramCacheKey`，包含 persisted sourceHash、theme、rendererVersion、detectedKind 和 outputProfile。
- [ ] DiagramReviewView 的 `review` SVG cache 首次在 S7B 接入；S2 仍不读写 cache；S7B 只对 clean persisted sourceHash 读写 cache。
- [ ] 修改 source/theme/rendererVersion 后旧 cache 失效。
- [ ] UI delete diagram 调用 S7A `clearDiagramCache`；删除业务数据成功但 cache cleanup 失败时显示 warning，不回滚 `.scry` 删除。
- [ ] S5 MCP delete cleanup 行为保持通过；S7B 只做回归验证，不修改 MCP tool schemas、handler 签名或 CLI bridge schema。

## S8 - Standalone Scryer data compatibility

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S8.md` required before coding.

## What to build

只要 standalone `scryer/` 仍作为可运行产品保留，它就必须能打开并保存 Orca 写入的 `.scry`，不丢 diagrams 或 refs。

## Scope

| Layer | Scope |
|---|---|
| Frontend | `scryer/src/types.ts`、storage state 至少保留 diagram fields；Diagram UI 可单独后续增强，但不能丢数据。 |
| Backend/API | Tauri/Rust parse/save、scryer-core schema、scryer-mcp types。 |
| Database/data | 同一个 `.scry` 文件在 Orca 和 standalone 间往返保存。 |
| Business rules | BR12, R16。 |

## Acceptance Criteria

- [ ] Orca 创建的 `.scry` 在 standalone Scryer 打开后仍保留 diagrams/diagramRefs。
- [ ] standalone 保存后，Orca 再打开不丢 schemaVersion/diagrams/diagramRefs。
- [ ] Rust schema 使用 explicit-plus-preserve strategy：显式字段保存 schemaVersion/diagrams/diagramRefs，并用 flatten extra map 保留兼容未知 top-level 字段。
- [ ] Rust schema 和 TypeScript schema 对 `flowStep` nested refs 的规则一致。
- [ ] Standalone Diagram library UI 明确 out of scope；本 slice 不修改 standalone Sidebar/App UI，除非另开任务。
- [ ] Release gate is enforced: any user-visible Orca build that can save v2 `.scry` must include S8, unless standalone save support is explicitly removed or disabled with a documented product decision.

## S9 - Full verification and traceability

Task issue: Preferred GitHub issue URL or local task doc `docs/tasks/local/LOCAL-S9.md` required before coding.

## What to build

对完整功能跑 automated checks、Live verification、Drift check 和 PR evidence，证明文档、代码、测试、真实数据路径一致，包括 S3A 的 Create diagram then link 用户流程和 S7A/S7B 的 cache 拆分。

## Scope

| Layer | Scope |
|---|---|
| Frontend | Tree、DiagramReviewView、refs UI、SVG navigation、copy/export live evidence。 |
| Backend/API | IPC、MCP、CLI bridge、cache service tests。 |
| Database/data | `.scry` persistence、cache file safety、standalone compatibility。 |
| Business rules | R1-R16, BR1-BR16。 |

## Acceptance Criteria

- [ ] 每个 PRD requirement 在 traceability matrix 中映射到 contract、task、code、test、live evidence。
- [ ] No diagram source writes to SQLite。
- [ ] Real Orca UI live verification 覆盖 create/edit/render/ref/navigate/export。
- [ ] Real MCP path 覆盖 external CLI bridge diagram tool。
- [ ] Docs-code drift check 通过；如果实现与文档不同，同 PR 更新文档。
- [ ] Anti-skeleton gates 全部通过：没有成功但不落盘的 handler，没有空按钮，没有 mock-only 完成证据。
