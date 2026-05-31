# LOCAL-S1A - Diagram library CRUD and source-only persistence

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S1A.md`
- Current status: complete
- Coding gate: completed from this local task doc while GitHub Issues are disabled.

## Context Checklist

- [x] Requirement IDs: R1-R6, R14.
- [x] Business rules: BR1, BR4, BR11, BR14.
- [x] Contract sections: frontend state, data contract, controller function contracts, DiagramSourceDraftView props, minimum dirty-draft guard, internal feature flag release gate.
- [x] Required exact names: `createDiagram`, `createDefaultDiagramSource`, `renameDiagram`, `updateDiagramSource`, `deleteDiagram`, `requestArchitectureNavigation`, internal `selectDiagram`, `detectMermaidDiagramKind`, `DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS`.
- [x] Fixture IDs: FX1, FX2.
- [x] Existing files: `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`, `model-store.ts`.
- [x] Real data path: user action -> controller -> existing model write path -> `.scryer/model.scry` -> reload.
- [x] Mock pairing: component callbacks may be mocked only with paired `.scry` reload test.

## Requirement trace

- Requirement IDs: R1-R6, R14.
- Business rule IDs: BR1, BR4, BR11, BR14.
- Traceability rows: R1, R2, R3, R6, R14.
- Live evidence IDs: L1, L2, L3A.

## Contract rows to implement

- System contract sections: Diagram library placement, Database/data contract, Source editor save rules.
- Frontend state rows: source-only UI hidden unless `enableArchitectureDiagramLibraryPreview` is enabled; minimum dirty guard protects source-only edits from being lost.
- Backend/API rows: existing model read/write carries `diagrams`.
- Database/data rows: `.scry` top-level `diagrams[].source`; no render output.
- Error codes: `controller.empty-name`, `controller.empty-source`, `controller.duplicate-id`, `controller.persist-failed`, `controller.revision-conflict`, parser warnings from F1A.
- Fixture IDs: FX1, FX2.

## Required exact implementation names

- Functions: `createDiagram`, `createDefaultDiagramSource`, `renameDiagram`, `updateDiagramSource`, `deleteDiagram`, `requestArchitectureNavigation`, internal `selectDiagram`, `detectMermaidDiagramKind`, `DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS`.
- Components/props: `DiagramSourceDraftView`; no `DiagramReviewView`, render adapter, or copy/export props in S1A.
- MCP handlers: none.
- IPC channels/types: existing model read/write only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`.
- Backend/API files: `src/main/scryer/model-store.ts`, `src/main/scryer/model-store-core.ts`.
- Database/data files: `.scryer/model.scry` fixture copies FX1, FX2.
- Existing tests: architecture panel/controller tests and model-store persistence tests if present.

## Real data path

- User action or MCP call: user creates/renames/edits/deletes diagram in Architecture UI with the internal preview flag enabled.
- Frontend state transition: diagram selection calls `requestArchitectureNavigation({ type: 'diagram', diagramId })`; internal `selectDiagram` may run only inside controller code after that request succeeds. S1A must implement the minimum dirty guard for source-only edits: Save and switch, Discard and switch, and Cancel before leaving a dirty draft. LOCAL-S1B expands this to external reload conflict, large-list, and keyboard/accessibility coverage.
- Backend/API call: controller calls existing save path; watcher reload reads the saved `.scry`.
- Persistence/cache path: `.scryer/model.scry`; no `.scryer/cache/diagrams`.
- Reload/read-back proof: close/reload temp project and verify Diagram library plus source survive.

## What to build

Add the Diagram library list and source-only CRUD/save shell behind the internal feature flag, proving diagram source persists through the real `.scry` path.

## Scope

- Frontend: Diagram library list, `DiagramSourceDraftView` source-only shell, create/rename/save/delete UI, minimum dirty guard, no SVG pane.
- Backend/API: existing model read/write path only.
- Database/data: `.scry` diagrams source only.
- Business rules: C4 canvas and flow tree stay clean; no direct user-facing `selectDiagram` calls; no cache cleanup claim in S1A; no external reload, large-list, or keyboard/accessibility completion claim until LOCAL-S1B.

## Acceptance Criteria

- [x] Diagram library appears under Model tree and Flow tree only when `enableArchitectureDiagramLibraryPreview` is enabled.
- [x] Default user-facing builds do not expose S1A as a completed feature.
- [x] Diagram click opens a real source draft/save shell; SVG render pane belongs to S2.
- [x] Diagram click goes through `requestArchitectureNavigation`; internal `selectDiagram` is not called directly by UI handlers.
- [x] Dirty source-only draft cannot be lost in S1A. Leaving the current diagram for another diagram, topology, flow, model switch, or close-view action must show exactly Save and switch, Discard and switch, Cancel.
- [x] Save and switch persists through the real `.scry` path before navigation; Discard and switch changes only local draft state; Cancel leaves the user on the dirty diagram.
- [x] S1A must not show an empty render panel, disabled copy/export buttons, fake diagnostics, or thumbnail placeholders.
- [x] Create uses `createDefaultDiagramSource(...)` and passes a non-empty valid Mermaid source into `createDiagram`.
- [x] Create, rename, explicit source save, and delete persist through real `.scry`.
- [x] Explicit source save uses shared `detectMermaidDiagramKind` to normalize persisted `Diagram.kind` without depending on renderer adapter.
- [x] Delete removes refs but does not claim cache cleanup.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Controller mutations | FX2 temp copy | Real `.scry` write/reload | Create/rename/save/delete survive reload. |
| Default source create | FX2 temp copy | Real `.scry` write/reload | New diagram source equals the default Mermaid template until user explicitly saves edits. |
| Source kind normalization | FX2 temp copy | Real `.scry` write/reload plus shared helper | `updateDiagramSource` uses `detectMermaidDiagramKind` and stores normalized `Diagram.kind` on valid explicit save. |
| Initial navigation entry | FX2 | Component/state test | Diagram library selection calls `requestArchitectureNavigation`, not internal `selectDiagram` directly. |
| Minimum dirty guard | FX2 temp copy | Component test plus real save/reload path | Dirty draft navigation shows Save and switch, Discard and switch, Cancel; Save writes before navigation, Discard does not write, Cancel keeps the draft. |
| Internal release gate | FX2 | Component/config test | Diagram library source-only UI is hidden when `enableArchitectureDiagramLibraryPreview` is false and visible when true. |
| No render shell | FX2 | Component test | No SVG pane, fake diagnostics, copy/export controls, cache UI, or thumbnails are rendered. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Empty diagram name | `controller.empty-name` | FX2 | Diagram is not created or renamed; `.scry` unchanged. |
| Empty source create | `controller.empty-source` | FX2 | `createDiagram` rejects empty source and UI create path never sends empty source. |
| Duplicate diagram id | `controller.duplicate-id` or `parser.duplicate-diagram-id` | FX2 | Duplicate is rejected before save or warned on parse; no silent overwrite. |
| Persist failure | `controller.persist-failed` or `controller.revision-conflict` | FX2 | Draft remains visible and `.scry` is unchanged. |
| Dirty switch save failure | `controller.persist-failed` or `controller.revision-conflict` | FX2 | Navigation is cancelled and dirty draft remains visible. |

## Live verification steps

1. Copy FX2 into a temp Orca workspace.
2. Enable internal flag `enableArchitectureDiagramLibraryPreview`, open Architecture tab, and record initial tree.
3. Create, rename, edit, save, reload, and delete a diagram.
4. Edit source without saving, try to switch to topology or another diagram, and record Save and switch / Discard and switch / Cancel behavior.
5. Record before/after `.scry`, L3A source-only shell, and proof that no SVG/copy/export/cache UI appears.

## Mock policy

- Mocks used: component callbacks may be mocked only for UI state tests.
- Why the mock is allowed: component tests isolate tree and draft shell behavior.
- Non-mocked test proving completion: temp `.scry` reload test through real controller/model-store path.

## Drift and PR evidence

- Drift check required: verify S1A did not implement render, external reload conflict, large-list behavior, copy/export, thumbnail cache, cache IPC, or no-op cleanup.
- PR evidence fields to fill: screenshots for Diagram library/source shell L3A plus before/after `.scry`; include flag state.
- Traceability rows to mark complete only after tests and live evidence pass: R1-R3, R6, R14.

## Blockers

- None after LOCAL-F1A completion.

## Completion evidence

- Automated checks: `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts src/shared/scryer/diagram-kind.test.ts src/shared/scryer/diagram-ids.test.ts src/main/scryer/model-store.test.ts src/main/scryer/diagram-controller-model-store.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/DiagramSourceDraftView.test.tsx src/renderer/src/components/architecture/ArchitectureModelTree.test.ts` passed with 48 tests.
- Type/lint/format checks: `corepack pnpm run tc:node`, `corepack pnpm run tc:web`, targeted `oxlint`, targeted `oxfmt --check`, and `git diff --check` passed.
- Real `.scry` path evidence: `src/main/scryer/diagram-controller-model-store.test.ts` copies FX2 into a temp project, writes through `writeModel`, reloads with `readModel`, and verifies create, default source, rename, source save with `kind: "sequence"`, delete, and related ref removal.
- Live evidence: `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` passed in Electron headless. It copies FX2 to a temp Orca worktree, enables `orca-scryer:enableArchitectureDiagramLibraryPreview`, opens Architecture, verifies Diagram library and `DiagramSourceDraftView`, checks no SVG/copy/export UI, exercises Save and switch / Discard and switch / Cancel dialog presence, saves/reloads a source-only diagram, and deletes it from the real `.scryer/model.scry`.
- Drift/scope evidence: S1A did not implement `DiagramReviewView`, render adapter, SVG pane, diagnostics, copy/export, thumbnail/cache IPC, or no-op cache cleanup. External reload conflict, large-list behavior, and full keyboard/accessibility coverage remain owned by LOCAL-S1B.
