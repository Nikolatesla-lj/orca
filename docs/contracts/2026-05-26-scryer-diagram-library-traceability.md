# Scryer Diagram Library Traceability Matrix

日期：2026-05-26

本文把 PRD requirement 映射到契约、必须实现的函数/组件/API、任务切片、测试 fixture 和 live evidence。它的作用是让 Codex 编码时知道每个需求到底落到哪里，避免只写 UI 空壳或只写 mock test。

## Source

- PRD: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- System contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- Implementation contracts: `docs/contracts/2026-05-26-scryer-diagram-library-implementation-contracts.md`
- Error codes: `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md`
- Fixture catalog: `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md`
- Task slices: `docs/tasks/2026-05-26-scryer-diagram-library-task-slices.md`
- Verification plan: `docs/testing/2026-05-26-scryer-diagram-library-verification.md`

## Traceability rules

- Every implementation PR must update this matrix if it changes requirement scope, contract IDs, function names, test targets, or live evidence.
- A row is not complete until both automated tests and live evidence are recorded, unless the row is explicitly non-user-visible.
- A mocked component test can support a row, but the row is not complete without the listed real-path evidence.
- GitHub Issues are still disabled. Until real PRD/task issue URLs exist, the `Task issue` column may use local task docs such as `LOCAL-F1A`; coding cannot start without either a GitHub task issue or a local task doc with a complete Context Checklist.

## Matrix

| Requirement | Contract source | Required implementation surface | Task issue | Required fixtures | Automated test target | Live evidence |
|---|---|---|---|---|---|---|
| R1 C4 `nodes` exclude diagrams | `.scry data contract`, BR2 | `normalizeDiagrams`, `ArchitectureCanvas`, `ArchitectureModelTree` | LOCAL-F1A, LOCAL-S1A, LOCAL-S1B | FX1, FX2 | Parser test proves diagrams are top-level; UI test proves C4 canvas receives only C4 nodes/edges. | Open FX2 in real Orca, click C4 node, record C4 canvas screenshot and `.scry` excerpt showing diagrams are top-level. |
| R2 `flows` exclude diagram list items | `.scry data contract`, BR3 | `normalizeDiagramRefs`, `FlowScriptView`, `ArchitectureModelTree` | LOCAL-F1A, LOCAL-S1A, LOCAL-S1B | FX1, FX2 | Parser/UI test proves flows remain flows and Diagram library is separate. | Open FX2, click flow item, record FlowScriptView and Diagram library below tree. |
| R3 Diagram library below trees | Frontend state contract | `ArchitectureModelTree`, `requestArchitectureNavigation`; internal `selectDiagram` only after guard | LOCAL-S1A, LOCAL-S1B | FX2, FX9 | Component test asserts group order, numbering, selection callback uses `requestArchitectureNavigation`, empty/loading/error state, search/filter, collapsible groups, and unlinked badge. | Open real Architecture tab and record Model tree, Flow tree, Diagram library in one screenshot after loading FX2 copy; use FX9 for large-list behavior. |
| R4 C4 click shows only C4 canvas | BR2, Frontend state contract | `requestArchitectureNavigation`, `ArchitecturePanel`, `ArchitectureCanvas` | LOCAL-S1B | FX2 | UI state test asserts `activeDiagramId` cleared and mode is `topology` only after the navigation guard allows it. | Click diagram then C4 node; record C4 canvas without Mermaid SVG elements. |
| R5 Flow click shows flow view | BR3, Frontend state contract | `ArchitecturePanel`, `FlowScriptView`, `requestArchitectureNavigation` | LOCAL-S1B | FX2, FX4 | UI test asserts flow selection clears `activeDiagramId` only after navigation guard passes. | Click diagram then flow; record FlowScriptView and unchanged diagram source in `.scry`. |
| R6 Diagram click opens diagram surface | BR4, DiagramSourceDraftView props, DiagramReviewView props | S1: `requestArchitectureNavigation`, internal `selectDiagram`, `DiagramSourceDraftView`; S2: `DiagramReviewView` | LOCAL-S1A, LOCAL-S1B, LOCAL-S2 | FX2, FX5 | S1A test asserts source-only shell and feature flag gate; S1B test asserts all user clicks route through the dirty-draft guard before internal selection; S2 test asserts full review props and rendered pane. | S1 evidence L3A records source-only shell with `enableArchitectureDiagramLibraryPreview` enabled; S2 evidence L3B records source pane plus rendered SVG. |
| R7 Source and render visible together | Render result contract | `DiagramReviewView`, `renderDiagram`, shared render queue | LOCAL-F1B, LOCAL-S2 | FX5, FX6, FX12, FX13, FX14 | Real Mermaid adapter tests for flowchart, sequence, class, state, and ER; component test asserts split view. | Open FX5 diagram; record source and sanitized SVG visible in same review view. |
| R8 Mermaid errors are clear | Render result contract, error codes | `renderDiagram`, `DiagramReviewView` diagnostic panel | LOCAL-F1B, LOCAL-S2 | FX7 | Adapter test asserts `renderer.invalid-source`; UI test asserts source preserved. | Paste/open FX7; record exact error text and source still present. |
| R9 SVG element target navigation | Element key algorithm, Frontend state contract | `extractRenderedElements`, `resolveDiagramElementNavigation`, `DiagramReviewView`, `DiagramReviewViewRefActions`, `onNavigateRefTarget` | LOCAL-S4 | FX2, FX5 | Stable `elementKey` test; one-target click test; multi-target picker test; source target line/open behavior when target is source. | Click bound SVG element with one target; record target C4/flow/source selection. Add a second target to the same element; record picker and chosen-target navigation. |
| R10 Whole-diagram and element refs | DiagramRef contract, deletion policy | `createDiagramRef`, `upsertDiagramRefs`, `deleteDiagramRefs`, `validateDiagramRefs` | LOCAL-S3, LOCAL-S3A, LOCAL-S4 | FX2, FX3, FX4, FX5 | Controller persistence test; parser bad ref test; nested step test; create-diagram-then-link test. | Add ref from node/flow/step, reload, record `.scry` `diagramRefs` and reverse reference list; for S3A, create diagram from ref picker and link it to the original target. |
| R11 Deep Build creates necessary diagrams only | Prompt/rules contract | `serializeModelForPrompt`, `diagramRefTargetMatchesPromptScope`, `buildDiagramPromptInstructions`, `initialModelPrompt`, `nodeFillPrompt`, `deepModelPrompt`, `TASK_INSTRUCTIONS`, `SCRYER_RULES`, `MCP_INSTRUCTIONS`, MCP tools | LOCAL-S6 | FX9 | Deterministic prompt/rules test proves each existing prompt entry point imports the shared `prompt-diagram-instructions.ts` rule for its context, when diagrams are required, when to skip, scoped target matching, and that omitted sources require `get_diagram`; real `get_task` prompt assembly proves diagram-to-code guidance; external AI provider output is optional smoke evidence only. | Generate Deep Build and real task implementation prompt/rules payload on a temp project; record Diagram recovery, diagram-to-code guidance, generation limits, skip rules, scoped target matching, and `get_diagram` instruction without requiring real AI-created `.scry` changes. |
| R12 Sync checks diagram drift | DriftReport contract | `DriftReportV2.diagramRefs`, `syncPrompt`, `serializeModelForPrompt` scoped source inclusion | LOCAL-S6 | FX2, FX9 | Drift test asserts separate diagram section; prompt test asserts related diagram requested and full source included only for affected/requested diagrams. | Edit source-mapped file in temp project, run sync, record prompt evidence mentioning affected diagram and omitted-source fetch rule. |
| R13 Copy/export/thumbnail cache | Cache IPC contract, hash/cache rules | `computeDiagramSourceHash`, `computeDiagramCacheKey`, cache IPC with `outputProfile`, `exportActions`, `onCopySvg`, `onExportPng` | LOCAL-S7A, LOCAL-S7B | FX5, FX8 | Cache security tests with real temp path; clipboard/export tests including save dialog/cancel/failure; S5 MCP delete cleanup regression; no `.scry` render output test. | Copy SVG/export PNG in real UI; record default filename, output action, cancel behavior, and cache path under `.scryer/cache/diagrams`; record S5 MCP delete cleanup regression unchanged. |
| R14 `.scry` is Source of truth | `.scry data contract`, Database/data contract | `parseModelData`, `serializeModelData`, model-store write path | LOCAL-F1A, LOCAL-S1A, LOCAL-S1B, LOCAL-S7A, LOCAL-S7B | FX1, FX2, FX8 | Read/write/reload test proves `.scry` stores source/refs only. | Inspect `.scry` before/after render/export; record absence of SVG/PNG/diagnostics. |
| R15 SQLite does not store diagram source | Database/data contract | model-store/cache service only | LOCAL-S7A, LOCAL-S7B, LOCAL-S9 | FX2, FX8 | Test or inspection proves `orchestration.db` unchanged for diagram source. | After render/export, record `.scry` and cache path; no SQLite diagram source writes. |
| R16 standalone preserves v2 data | Standalone preservation rule | `scryer/src/types.ts`, `useModelStorage`, Rust schema/save | LOCAL-S8 | FX10 | Orca -> standalone -> Orca round-trip test. | Open/save FX10 in standalone, reopen in Orca, record diagram fields still present. |

## PR evidence IDs

Use these IDs in PR descriptions:

| Evidence ID | Required evidence |
|---|---|
| L1 | Real Orca Architecture tab opened on a temp project copied from a fixture. |
| L2 | Before/after `.scry` excerpts showing exact changed top-level fields. |
| L3A | DiagramSourceDraftView source-only shell visible after selecting a diagram in S1 with `enableArchitectureDiagramLibraryPreview` enabled; screenshot must show no SVG pane, no diagnostic placeholder, and no copy/export controls. |
| L3B | DiagramReviewView source and sanitized SVG visible after selecting a diagram after S2. |
| L4 | Invalid Mermaid diagnostic with source preserved. |
| L5 | C4 canvas stays clean after returning from Diagram review view. |
| L6 | DiagramRef created, reloaded, and shown from both target side and diagram side. |
| L7 | Bound SVG element click navigates to correct target. |
| L8 | MCP CLI bridge `tools/list` or real tool call evidence. |
| L9 | Cache file path under `.scryer/cache/diagrams` and rejection of malicious path. |
| L10 | Prompt payload omits bulk diagram source and uses `get_diagram` when full source is needed. |
| L11 | Standalone round trip preserves v2 fields. |

## Incomplete-state rule

If a PR satisfies only the implementation surface but lacks required fixtures, automated tests, or live evidence, mark the traceability row as incomplete. Do not claim the requirement is done.
