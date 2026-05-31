# Scryer Diagram Library Verification Plan

日期：2026-05-26

术语以 `docs/contracts/2026-05-26-scryer-diagram-library-terminology.md` 为准。本文中的 Live verification 必须走真实 Orca UI 或真实 MCP 路径；只跑 mocked test 不算完成。固定测试输入见 `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md`。统一错误码见 `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md`。需求追踪见 `docs/contracts/2026-05-26-scryer-diagram-library-traceability.md`。

## Full comprehensive suite

| Area | Commands/evidence |
|---|---|
| Install/build prerequisites | `corepack pnpm install` if dependencies changed. |
| Static checks | `corepack pnpm run lint` or targeted `oxlint` on changed files. |
| Type checks | `corepack pnpm run tc:node`, `corepack pnpm run tc:web`; full `tc` before PR. |
| Unit tests | `corepack pnpm exec vitest run --config config/vitest.config.ts <changed tests>` |
| Renderer/UI tests | Component tests must assert exact callbacks, mode transitions, disabled states, diagnostic text, and sanitized SVG container behavior for `ArchitectureModelTree`, `ArchitecturePanel`, `DiagramReviewView`, and refs UI. |
| Backend/API tests | `src/main/ipc/architecture.test.ts`, new cache IPC tests. |
| MCP tests | `src/main/scryer/mcp-tools.test.ts` diagram tool cases. |
| MCP CLI bridge tests | `src/cli/scryer-mcp-server.test.ts` confirms diagram tools appear in `tools/list` with descriptions and exact input schema. |
| Parser tests | `src/shared/scryer/parse-model.test.ts` diagrams and invalid refs. |
| Drift tests | `src/main/scryer/drift.test.ts` covers additive `DriftReportV2.diagramRefs` without changing existing node drift. |
| Prompt tests | `src/shared/scryer/prompts.test.ts` verifies diagram source is omitted from default prompts, fetched through `get_diagram` when needed, scoped target matching uses `diagramRefTargetMatchesPromptScope(...)`, and `initialModelPrompt`、`nodeFillPrompt`、`deepModelPrompt`、`syncPrompt`、`TASK_INSTRUCTIONS`、`SCRYER_RULES`、`MCP_INSTRUCTIONS` each contain the required context-specific diagram guidance from `prompt-diagram-instructions.ts`. Diagram-to-code evidence must include real `get_task` prompt assembly; direct `TASK_INSTRUCTIONS` assertions are supplemental only. |
| Hash/cache tests | Shared helper tests prove stable `sourceHash` and `cacheKey` generation, including CRLF-to-LF normalization and metadata changes not invalidating render cache. |
| Database/data checks | No SQLite schema change. Verify `.scry` contains source/refs only and no SVG/PNG/diagnostics/thumbnail writes to `.scry` or `orchestration.db`. |
| Standalone compatibility | `scryer/` TypeScript/Rust parse-save round trip preserves `schemaVersion`, `diagrams`, and `diagramRefs`. |
| E2E/live | Add and run `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` for the changed user-visible flows. |
| Drift check | Trigger `beginSync`, edit source-mapped file, verify drift mentions diagram source refs. |
| Security | Verify SVG sanitization removes unsafe scripts/events. |
| Cache safety | Verify cache IPC rejects path traversal, invalid ids, non-hash cache keys, and oversized SVG/PNG payloads. |
| Accessibility | S1A/S1B: keyboard focus reaches Diagram library, arrow keys move through groups/items, Enter opens through `requestArchitectureNavigation`, and dirty dialog buttons are reachable. S3/S3A: ref picker, role select, `Link now`, and cancel paths are keyboard reachable. S4: `Bind element` mode supports keyboard focus and Escape/Cancel exit. S7B: copy/export toolbar actions expose disabled state and labels to assistive technology. |
| Performance | CI gate: FX11 200-node Mermaid flowchart must not block typing or tree navigation, must use the shared queue, and must show a non-blocking loading/error/success state while rendering; CI must not fail only because render completion exceeds a fixed wall-clock time. Live/perf evidence: record machine summary and measured time; target is render or non-blocking state within 2 seconds, investigate if above 5 seconds. S7B thumbnail batching must process 20 diagrams through the shared queue without blocking typing or tree navigation. |
| Fixture evidence | Tests that claim migration, persistence, MCP, cache, prompt, drift, or standalone compatibility must read the fixture IDs required by the fixture catalog. |

## Realistic user scenario suite

| ID | Persona/role | Goal | Preconditions/data | Steps | Expected business result | Evidence |
|---|---|---|---|---|---|---|
| RS1 | 初学者用户 | 打开旧模型 | FX1 copied to temp workspace | Open Architecture tab | Model/flow 正常；Diagram library empty | Parser assertion: no read rewrite. Live evidence: L1 + L2 showing normalized in-memory model and unchanged fixture copy before save. |
| RS2 | 初学者用户 | 新增 sequence diagram | FX2 copied to temp workspace | Create diagram, paste Mermaid, save, reload model | Diagram persists after reload and `.scry` contains source | Controller test asserts callback result and model change; non-mocked model-store reload test reads temp `.scry`; S1 live evidence L1-L3A. |
| RS3 | 初学者用户 | 审查 diagram | FX5 valid Mermaid | Click diagram | Source and sanitized SVG visible | Real adapter test reads FX5 and asserts sanitized SVG; S2 live evidence L3B. |
| RS4 | 初学者用户 | 处理 Mermaid 错误 | FX7 invalid Mermaid | Edit source with syntax error | Error shows line/column if available; source is not overwritten | Component test asserts diagnostic text and source value; real adapter test asserts `renderer.invalid-source`; live evidence L4. |
| RS5 | 架构维护者 | C4 node 引用 diagram | FX2 diagram and node | Add ref from node panel, reload model | Node shows diagram ref; `.scry` contains diagramRef; reverse list shows node | Component test asserts `onUpsertRefs` payload; non-mocked persistence test reads `.scry`; live evidence L6. |
| RS5A | 架构维护者 | 从引用入口新建并关联 diagram | FX2 node plus FX5 source | Add ref -> Create diagram then link -> save source -> choose role -> reload model | New diagram and diagramRef persist; original target shows ref; diagram reverse list shows target | S3A test reads real temp `.scry`; live evidence L6 records target-side and diagram-side lists. |
| RS6 | 架构维护者 | SVG 点击定位 C4/flow/source | FX2 + FX5 elementKey ref | Click SVG element | One unique target navigates directly; multiple distinct targets show a picker before navigation | E2E asserts mode/selection and multi-target picker behavior; live evidence L7. |
| RS7 | 架构维护者 | Flow step 引用 diagram | FX4 nested flow step | Add step ref, reload model | Flow step and diagram reverse refs match; nested step id survives reload | Parser `findFlowStep` assertion, controller persistence test, `.scry` before/after evidence. |
| RS8 | AI/Codex | Deep Build/Sync/task prompt 使用细粒度 diagram 规则 | FX9 plus real project files | Generate Deep Build, Sync, and real `get_task` prompt/rules payload without calling an external AI provider | Prompt says when diagrams are required, when to skip, how to use `set_diagrams`/`update_diagram_refs`, how scoped target matching includes full source, and that agents must use `get_diagram` before editing omitted source | Deterministic prompt test and live/MCP log evidence. A real external AI smoke test is optional and cannot be the only completion evidence. |
| RS9 | AI/Codex | Sync 更新 diagram | FX2 or FX9 with changed source-linked file | Begin sync | Prompt asks to update related diagram | Prompt test asserts compact source policy and diagram drift section; live evidence L10. |
| RS10 | 用户 | 复制/导出图 | FX5 valid diagram | Copy SVG, export PNG | Clipboard/export works from sanitized SVG; PNG export uses save dialog/default `.png` filename; cancel writes nothing | Adapter test asserts sanitized SVG; live steps record copy/export command result, default filename, cancellation behavior, and cache path. |
| RS11 | 用户 | 缩略图缓存 | FX2 multiple diagrams | Load tree twice | second load uses cache under real `.scryer/cache/diagrams` path | IPC/cache test with temp project asserts exact cache path and no `.scry` write. |
| RS12 | 用户 | 删除 C4 target | FX2 node has refs | Delete node, reload model | refs removed or warning shown; `.scry` matches deletion policy | Unit cleanup assertion plus non-mocked persistence reload and live evidence L6. |
| RS13 | 用户 | 外部 MCP 改图 | Orca app open on FX2 temp project | call external CLI tool | UI reloads and diagram list updates | CLI bridge test plus live evidence L8. |
| RS14 | 用户 | 保存冲突 | Two real model documents | stale write | revision conflict shown | IPC test asserts conflict shape and unchanged disk model. |
| RS15 | 用户 | standalone 数据兼容 | FX10 | open and save same `.scry` in both apps | schemaVersion, diagrams, diagramRefs preserved | Compatibility test reads real files before/after; standalone Diagram library UI is not required for this feature stage. |
| RS16 | AI/Codex | 外部 MCP CLI 可见 diagram tools | MCP CLI bridge installed | tools/list | diagram tools include description and input schema | CLI test asserts tool names, descriptions, and `additionalProperties: false`; live evidence L8. |
| RS17 | 用户 | 缓存安全 | FX8 malicious cache args | call cache IPC with temp project path | request rejected; no file outside cache dir | Real path IPC/security test asserts `cache.*` codes and filesystem boundaries. |
| RS18 | 用户 | render output 不进 `.scry` | FX5 rendered/exported | inspect `.scry` | only source and refs stored | Persistence test asserts no SVG/PNG/diagnostics/sourceHash in `.scry`; live evidence L2/L9. |
| RS19 | AI/Codex | compact prompt 不塞满 diagram source | FX9 many diagrams | prepare prompt | prompt has summaries plus sourceHash; full source omitted | Prompt test asserts `sourceOmitted: true` and no full sources; live evidence L10. |
| RS20 | 架构维护者 | sourceMap 与 source diagramRef 同时存在 | FX2 with same source file in both | check drift | node drift and diagramRef drift both reported separately | Drift test asserts `nodes` and `diagramRefs` sections separately. |
| RS21 | 用户 | stable SVG element refs | FX5 rendered twice | compare elements | same semantic element gets same elementKey | Renderer test asserts identical elementKey for same explicit Mermaid id. |
| RS22 | 用户 | 未保存 draft 切换页面 | FX2 diagram | Edit source, click C4/flow/other diagram | Save and switch persists then navigates; Discard and switch navigates without write; Cancel stays on diagram | Component/E2E asserts three outcomes, failed save keeps draft and current view. |
| RS23 | 用户 | 保存无效 Mermaid | FX7 invalid Mermaid | Save invalid source, reload model | `.scry` contains invalid source; render pane marks invalid/stale; S2 has no copy/export controls, and S7B disables them for invalid/stale render | Non-mocked reload test plus UI test asserts stale/invalid state and S2/S7B action visibility rules. |
| RS24 | 用户 | 大图渲染不卡 UI | FX11 large flowchart | Open diagram, edit source text while render is pending, then load 20 thumbnails | Main Architecture UI remains responsive; CI proves non-blocking behavior and shared queue; live evidence records target timing separately | Performance test records timing and proves typing/tree navigation is not blocked by render or thumbnail batch. |

## Required unit/integration tests

| Test file | Coverage |
|---|---|
| `src/shared/scryer/parse-model.test.ts` | diagram normalize, refs validate, legacy model migration. |
| `src/main/scryer/model-store*.test.ts` | blank model, write/read revision, cache path safety. |
| `src/main/scryer/mcp-tools.test.ts` | `set_diagrams`, `delete_diagram`, `get_diagram`, `update_diagram_refs`; existing tool additive context for `get_model`, `get_node`, `get_changes`, and `validate_model`; S5 MCP delete cleanup regression after S7B. |
| `src/cli/scryer-mcp-server.test.ts` | diagram tools are exposed through external MCP CLI bridge with exact `additionalProperties: false` input schemas. |
| `src/main/ipc/architecture.test.ts` | cache IPC, read/write model with diagrams. |
| `src/preload/api-types` typecheck | cache IPC methods are exposed in preload API types and implementation. |
| `src/renderer/src/components/architecture/ArchitectureModelTree.test.tsx` | Diagram library grouping, numbering, selection through `requestArchitectureNavigation`, keyboard navigation, empty/loading/error/large-list behavior. |
| `src/renderer/src/components/architecture/DiagramReviewView.test.tsx` | success render, error render, `onDraftStateChange`, external reload modified/deleted conflict choices, read-only compare flow for modified conflicts, S2 `exportActions` and `refActions` absent with no copy/export/ref controls, S7B copy/export controls disabled when render is invalid/stale. |
| `src/renderer/src/components/architecture/ArchitectureContextPanel.test.tsx` | node/edge/group diagram references, ref picker keyboard operation, source target safety validation. |
| `src/renderer/src/components/architecture/FlowScriptView.test.tsx` | flow/step diagram references and nested step keyboard ref creation. |
| `src/renderer/src/components/architecture/useArchitectureModelController.test.ts` | view state, undo/redo, `requestArchitectureNavigation`, `resolveExternalDiagramReload` including `modelName` cross-model safety, delete cleanup. |
| `src/renderer/src/components/architecture/diagram-renderer.test.ts` | Reads FX5/FX6/FX7/FX11/FX12/FX13/FX14/FX15/FX16/FX17; asserts support matrix for required Mermaid kinds, `renderer.invalid-source`, stable `elementKey`, sourceRange only when derivable, sanitized SVG, render queue serialization, and FX11 non-blocking performance behavior. |
| `src/shared/scryer/prompts.test.ts` | compact diagram summaries, scoped full-source inclusion by diagram id and by `diagramRefTargetMatchesPromptScope(...)`, Deep Build Diagram recovery, Sync potentially drifted diagrams, real `get_task` prompt assembly for task implementation diagram-to-code guidance, and shared prompt instruction coverage for `initialModelPrompt`、`nodeFillPrompt`、`deepModelPrompt`、`syncPrompt`、`TASK_INSTRUCTIONS`、`SCRYER_RULES`、`MCP_INSTRUCTIONS`. |
| `scryer/` compatibility tests | TypeScript and Rust parse-save round trip preserves diagram fields. |

## Required negative-path tests

| Area | Required failures to test |
|---|---|
| Parser | duplicate diagram id, duplicate ref id, missing diagram target, missing nested flow step, invalid sourceRange, unsafe source target patterns. |
| Controller | empty source (`controller.empty-source`), empty renamed diagram name (`controller.empty-name`), missing diagram id (`controller.diagram-not-found`), missing ref target (`controller.missing-target`), unsafe source target (`controller.invalid-source-target`), source open no-matches/multi-match behavior, missing role (`controller.missing-role`), export write failure (`controller.export-failed`), delete active diagram fallback. |
| Renderer | invalid Mermaid source, unsupported diagram kind, unbindable SVG element without stable `elementKey`. |
| MCP | invalid JSON `data`, missing diagram, duplicate ids, missing target, unsafe source target, `update_diagram_refs delete` with no `ref_ids`, `update_diagram_refs delete` with `data`, optional `model` consumed by dispatcher not handler. |
| Cache IPC | unauthorized projectPath, invalid diagramId, invalid cacheKey, path traversal, empty write payload, payload/outputProfile mismatch, oversized SVG, oversized PNG data URL, corrupt cache file read. |

## Test evidence checklist

| Evidence type | Must use real `.scry` file? | Can mock? | Must run CLI bridge? | Required fixtures | Exact assertions |
|---|---|---|---|---|---|
| Parser migration | Yes, read fixture from disk | No | No | FX1 | In-memory `schemaVersion: 2`, empty diagram arrays, no file rewrite on read. |
| Parser bad refs | Yes, read fixture from disk | No | No | FX3, FX4 | Warnings include exact `parser.*` codes and preserve dangling refs. |
| Controller UI mutation | Yes for completion evidence | UI callback may be mocked in component test | No | FX2 | Callback payload is exact; `.scry` changes survive reload through real model-store. |
| DiagramReviewView rendering | No for component-only assertions; yes for live completion | `renderAdapter` may be mocked in component test | No | FX5, FX7 | Component asserts source, diagnostic, disabled states, draft/reload state, and S2 absence of `refActions`/`exportActions`; paired adapter test uses real Mermaid. |
| Render adapter | No `.scry` required, but source must be fixture file | No | No | FX5, FX6, FX7, FX11, FX12, FX13, FX14, FX15, FX16, FX17 | Valid source returns sanitized SVG for required kinds; invalid source returns `renderer.invalid-source`; FX15-FX17 either render or return structured `renderer.unsupported-kind`; render queue serialization and FX11 non-blocking behavior are asserted. |
| Cache IPC | Yes, temp project path under copied fixture workspace | Filesystem mock allowed only for unit failure injection | No | FX8 | Unauthorized project paths and unsafe paths rejected with `cache.*` codes; valid writes stay under `.scryer/cache/diagrams`; `outputProfile` controls SVG vs PNG payload. |
| MCP handler | Yes for write tools | Direct handler import allowed for unit mode tests | Yes for completion | FX2, FX3 | Handler returns `ScryerToolResult`; `.scry` changes persist; `get_model`, `get_node`, `get_changes`, and `validate_model` include the documented compact diagram fields and omit full source by default; CLI `tools/list` exposes schema. |
| Prompt compactness | Yes, read many-diagram fixture | No | No | FX9 | Full diagram sources omitted by default; `sourceHash` and `sourceOmitted` present; `get_diagram` required for full source. |
| Drift | Yes, temp project with real source files | No | No | FX2, FX9 | `DriftReportV2.diagramRefs` is separate from node drift. |
| Standalone compatibility | Yes, same `.scry` through both apps | No | No | FX10 | Orca -> standalone save -> Orca reopen preserves schemaVersion, diagrams, diagramRefs, and compatible unknown fields. |
| E2E/live UI | Yes, temp Orca workspace copied from fixture | No mock for completion evidence | Only when MCP is touched | FX2 plus slice-specific fixtures | The exact user flow changes visible UI and persisted `.scry` or cache state. |

## Required accessibility tests

These tests are not optional polish. They are part of the user flow contract because Diagram library, ref creation, SVG binding, and export controls are primary controls.

| Slice | Required keyboard/accessibility assertions |
|---|---|
| S1A/S1B | Focus can move from Model tree to Flow tree to Diagram library; kind groups can be expanded/collapsed by keyboard; Enter on a diagram calls `requestArchitectureNavigation`; source-only shell exposes Save/Rename/Delete labels; dirty dialog exposes Save and switch, Discard and switch, and Cancel. |
| S3/S3A | Add diagram reference opens by keyboard; existing diagram picker, role selector, note field, Create diagram then link, `Link now`, and cancel buttons are reachable and keep focus in a predictable place. |
| S4 | `Bind element` mode has an explicit button, focus state, Escape/Cancel exit, and does not turn normal SVG clicks into bind actions unless the mode is active. |
| S7B | Copy SVG and Export PNG buttons are reachable, labelled, and report disabled state for dirty/invalid/stale/locked render; disabled actions must not write clipboard, files, cache, or `.scry`. |
| S7B export | PNG export default filename is announced or visible, save cancellation is reachable, and cancellation leaves file/cache/model unchanged. |

## Concrete live evidence steps

Each task issue must copy only the steps relevant to its slice and fill in fixture IDs and file paths.

### Create/edit/delete diagram live path

1. Copy FX2 into a temporary Orca workspace as `.scryer/model.scry`.
2. Open Orca Architecture tab on that workspace.
3. Record the initial Diagram library and `.scryer/model.scry` `diagrams` excerpt.
4. Create a diagram, edit its Mermaid source, rename it, and save.
5. Reload the model from disk.
6. Record Diagram library, DiagramSourceDraftView source for S1 or DiagramReviewView source for S2+, and the updated `.scryer/model.scry` excerpt.
7. Delete the diagram.
8. Reload again and record that related `diagramRefs` are removed and selection falls back according to the frontend state contract.

### Render diagnostic live path

1. Copy FX7 into a diagram source field in a temp workspace model.
2. Open that diagram in DiagramReviewView.
3. Record the diagnostic text and line/column if available.
4. Record that the source editor still contains the original invalid source.
5. Record that no SVG/PNG/diagnostics were written to `.scry`.
6. Save the invalid source explicitly, reload the model, and record that source persists while render pane remains invalid/stale. For S2, record that copy/export controls are absent; for S7B, record that they are disabled.

### Unsaved draft switch live path

1. Copy FX2 into a temporary Orca workspace.
2. Open a diagram and edit source without saving.
3. Try switching to one C4 node, one flow, and one other diagram.
4. Record Save and switch, Discard and switch, and Cancel behavior.
5. Force or simulate one save failure in an integration test and record that navigation is cancelled and the draft remains.

### Ref and reverse navigation live path

1. Copy FX2 into a temp workspace.
2. Add a diagramRef from one C4 node and one nested flow step.
3. Reload the model.
4. Record the target-side reference list and the diagram-side reverse reference list.
5. Run the S3A path once: from the same target, choose Create diagram then link, save FX5 source, choose role, reload, and record the new diagram plus ref.
6. Click a bound SVG element.
7. Record the selected target and the active view after navigation.

### MCP CLI live path

1. Copy FX2 into a temp workspace.
2. Run external MCP CLI `tools/list` and record `set_diagrams`, `get_diagram`, `delete_diagram`, and `update_diagram_refs` with descriptions and exact input schemas.
3. Call one diagram write tool through the CLI bridge.
4. Record `.scryer/model.scry` before/after and the Orca UI reload result.

### Cache safety live path

1. Copy FX8 request data into a temp workspace test.
2. Call cache IPC with one valid request and all malicious requests.
3. Record valid cache file path under `.scryer/cache/diagrams`.
4. Record rejected request codes.
5. Check the temp directory root and parent directories to prove no files were written outside the cache root.

## Live verification checklist

For each PR touching this feature, record:

- Fixture ID and temp workspace path used.
- Architecture tab opened from a real Orca workspace.
- `.scryer/model.scry` before/after excerpts for the exact top-level fields changed.
- User action sequence from the relevant concrete live path above.
- Screenshot or trace showing Model tree, Flow tree, and Diagram library after the action.
- Screenshot or trace showing DiagramSourceDraftView source-only shell for S1 (L3A), or DiagramReviewView source and SVG when rendering is touched (L3B).
- For S1 evidence, record that `enableArchitectureDiagramLibraryPreview` was enabled; default user-facing builds must keep the source-only UI hidden until S2.
- For S2 evidence, record that `enableArchitectureDiagramLibraryPreview` still exists and its default is enabled only after the full review page acceptance criteria pass; S2 must not remove or replace the flag.
- Error screenshot or trace showing invalid Mermaid diagnostic when error handling is touched.
- External reload conflict evidence when S2 is touched: show modified conflict with Keep draft, Reload from disk, Compare changes, the read-only diff, and closing the diff returning to the conflict state; also show deleted conflict with Keep draft, Discard deleted, and Cancel.
- Evidence that C4 canvas remains clean after clicking model tree.
- Evidence that diagram click does not modify C4 nodes/edges.
- Export/copy evidence when touched, including sanitized SVG/PNG source path or clipboard assertion.
- PNG export evidence when touched, including default filename, selected destination, cancel behavior, and `controller.export-failed` handling if failure path is touched.
- Cache file path when cache touched, plus rejected `cache.*` codes for malicious requests.
- Drift/sync prompt evidence when prompts touched.
- Prompt payload evidence showing full diagram sources are omitted unless in scope.
- `.scry` evidence showing render output is not persisted.
- MCP CLI `tools/list` evidence when MCP tools are touched.
- standalone `.scry` round-trip evidence when compatibility code is touched.
- Git tracking evidence for changed docs: after docs are added to Git, run `git ls-files --error-unmatch` for the PRD, contract, architecture, task, local task, and testing docs. `git add --dry-run` only proves the docs are addable; it is not final PR evidence.

## Mock policy

Allowed:

- Mock render adapter in component tests.
- Mock clipboard in copy SVG tests.
- Mock filesystem in cache service unit tests.

Not enough for completion:

- A mocked renderer cannot prove real Mermaid support.
- A mocked model-store cannot prove `.scry` persistence.
- A mocked MCP tool cannot prove agent-visible tool behavior.
- A mocked CLI bridge cannot prove external Codex/Claude can see diagram tools.
- A mocked cache service cannot prove path containment.

Every PR must include at least one non-mocked persistence test for changed `.scry` data.

Mock pairing rule:

- If a component test mocks `renderAdapter`, the same slice must include at least one real Mermaid adapter test before completion.
- If a cache unit test mocks filesystem, the same slice must include at least one temp-directory cache path test before completion.
- If a controller test mocks save callbacks, the same slice must include at least one read/write/reload `.scry` test before completion.
- If an MCP unit test imports handlers directly, the same slice must include one external CLI bridge `tools/list` or tool-call test before completion.

## Anti-skeleton completion gate

The following are explicit failure conditions:

- A production handler returns success while only mutating a local object.
- A UI button exists but has no persisted effect after model reload.
- A test only checks that text or a component appears, without checking state transition, callback payload, or persisted data.
- An E2E spec opens Architecture but does not create/edit/render/ref/navigate/export according to the touched slice.
- A PR reports "not applicable" for Live verification on a user-visible slice without an environment blocker.

## Drift check

| Area | Required match |
|---|---|
| PRD | Requirements R1-R16 are still represented in code/docs. |
| Contract docs | `Diagram`, `DiagramRef`, IPC, MCP, cache contracts match implementation. |
| Task tracking gate | GitHub PRD/task issues exist, or local task docs under `docs/tasks/local/` exist because GitHub Issues are disabled. Either path must include Context Checklist, traceability, fixture IDs, error codes, tests, and live evidence. |
| UML/architecture | Architecture doc diagrams match actual code paths. |
| Tests | Each changed contract has at least one test or explicit risk. |
| Live evidence | User-visible flows touched by PR have screenshots/logs. |
| Git tracking | PRD, contract, task, local task, architecture, and testing docs must be added to Git before merge/release. `git ls-files --error-unmatch <doc>` is the required proof; `git add --dry-run` alone is not enough. |
| Cache/source truth | `.scry` stores only source/refs; Derived cache or memory stores SVG/PNG/diagnostics. |
