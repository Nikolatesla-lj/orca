# LOCAL-S1B - Complete diagram navigation guard, large-list behavior, and accessibility

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S1B.md`
- Current status: complete
- Coding gate: completed after LOCAL-S1A.

## Context Checklist

- [x] Requirement IDs: R1-R6, R14.
- [x] Business rules: BR1, BR4, BR11, BR14.
- [x] Contract sections: frontend state contract, source editor save rules, external reload conflict rules, Diagram library UX rules.
- [x] Required exact names: `requestArchitectureNavigation`, internal `selectDiagram`, `resolveExternalDiagramReload`, `DiagramDraftStateSnapshot`, `DiagramExternalReloadConflict.modelName`.
- [x] Fixture IDs: FX2, FX9.
- [x] Existing files: `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `DiagramSourceDraftView.tsx`, `useArchitectureModelController.ts`.
- [x] Real data path: dirty draft -> S1A minimum navigation guard -> S1B full navigation coverage/external reload handling -> existing model write path or discard -> `.scryer/model.scry` reload.
- [x] Mock pairing: failed save and dialogs may be mocked only with paired real `.scry` save/reload test.

## Requirement trace

- Requirement IDs: R1-R6, R14.
- Business rule IDs: BR1, BR4, BR11, BR14.
- Traceability rows: R1-R6, R14.
- Live evidence IDs: L1, L3A, L5.

## Contract rows to implement

- System contract sections: Frontend state contract, Source editor save rules, external reload conflict rules, Diagram library UX rules.
- Frontend state rows: S1A minimum dirty guard remains in place; S1B expands coverage to all user-initiated navigation, external reload conflict, model switching, keyboard use, and large-list behavior.
- Backend/API rows: save path used only when Save and switch succeeds.
- Database/data rows: `.scry` changes only on explicit save; discard/cancel do not write.
- Error codes: `controller.persist-failed`, `controller.revision-conflict`.
- Fixture IDs: FX2, FX9.

## Required exact implementation names

- Functions: `requestArchitectureNavigation`, internal `selectDiagram`, `resolveExternalDiagramReload`.
- Components/props: `DiagramSourceDraftView`, dirty dialog, read-only compare view.
- MCP handlers: none.
- IPC channels/types: existing model read/write only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `ArchitecturePanel.tsx`, `ArchitectureModelTree.tsx`, `DiagramSourceDraftView.tsx`, `useArchitectureModelController.ts`.
- Backend/API files: existing model-store write path and watcher reload path.
- Database/data files: FX2 and FX9 temp `.scry` copies.
- Existing tests: S1A persistence tests.

## Real data path

- User action or MCP call: user edits source, then clicks C4 node, flow, another diagram, model switch, or close Diagram review view.
- Frontend state transition: `requestArchitectureNavigation` shows Save and switch, Discard and switch, or Cancel before changing state.
- Backend/API call: only Save and switch calls the existing save path.
- Persistence/cache path: `.scryer/model.scry`; no `.scryer/cache/diagrams`.
- Reload/read-back proof: save path persists, discard path does not, cancel path leaves user and draft unchanged.

## What to build

Finish the source-only S1 user protection layer beyond S1A's minimum guard: cover every navigation path, handle external reload conflicts, and make Diagram library usable with keyboard and large lists.

## Scope

- Frontend: dirty draft guard, external reload conflict UI, large-list search/collapse/unlinked states, keyboard/accessibility behavior.
- Backend/API: existing model write path only.
- Database/data: `.scry` source only.
- Business rules: direct UI calls to internal `selectDiagram` are forbidden; source-only UI remains internal until S2.

## Acceptance Criteria

- [x] Diagram library handles empty/loading/error/large-list states: empty state has Create diagram, >20 diagrams enables search/filter and collapsible kind groups, and diagrams with no refs show `Unlinked`.
- [x] Every user click from Diagram library, C4 tree/C4 canvas, Flow tree/view, model switch, and close Diagram review view calls `requestArchitectureNavigation`.
- [x] Internal `selectDiagram` can run only after `requestArchitectureNavigation` returns success.
- [x] Dirty draft switch shows exactly Save and switch, Discard and switch, Cancel.
- [x] Save and switch persists, clears dirty state, and navigates.
- [x] Discard and switch throws away only the local draft and does not write `.scry`.
- [x] Cancel keeps the user in the current diagram with the draft unchanged.
- [x] Save failure or revision conflict keeps the user in the current diagram and leaves the draft visible.
- [x] External reload modified conflict includes `modelName` and `diskState: 'modified'`; Keep draft, Reload from disk, and Compare changes may only apply to that same model. Compare changes opens a read-only diff and closing it returns to the conflict state.
- [x] External reload deleted conflict includes `modelName` and `diskState: 'deleted'`; Keep draft, Discard deleted, and Cancel may only apply to that same model. Discard deleted applies normal active-diagram deletion fallback.
- [x] Keyboard focus reaches Diagram library groups/items; arrow keys navigate; Enter opens through `requestArchitectureNavigation`; dirty dialog buttons are keyboard reachable.
- [x] S1B still does not implement SVG render, diagnostics, copy/export, thumbnail cache, cache IPC, or cache cleanup.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Dirty draft guard | FX2 | Component plus save-failure mock paired with real save test | `onDraftStateChange` updates controller state; all user navigation calls `requestArchitectureNavigation`; failed save keeps draft. |
| Save/discard/cancel persistence | FX2 temp copy | Real `.scry` write/reload | Save writes; discard and cancel do not write. |
| External reload modified conflict | FX2 | Component/controller test plus model revision fixture | Conflict includes `modelName` and `diskState: 'modified'`; Keep draft, Reload from disk, Compare changes, and close diff behavior match contract. |
| External reload deleted conflict | FX2 | Component/controller test plus model revision fixture | Conflict includes `modelName` and `diskState: 'deleted'`; Keep draft, Discard deleted, Cancel, and active-diagram fallback match contract. |
| Cross-model reload safety | FX2 two-model temp copy | Controller/state test | A stale conflict for model A cannot overwrite or resolve model B after active model switch. |
| Clean C4 canvas | FX2 | Component/state test | C4 canvas receives only C4 nodes/edges after Diagram review view. |
| Library large-list behavior | FX9 | Component/state test | Search/filter, collapsible groups, counts, and unlinked badges behave without reading full source. |
| Keyboard/accessibility | FX2/FX9 | Component/E2E test | Focus order, group expand/collapse, Enter navigation, and dirty dialog buttons work by keyboard. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Dirty switch save failure | `controller.persist-failed` or `controller.revision-conflict` | FX2 | Navigation is cancelled and draft remains visible. |
| Direct UI select attempt | regression assertion | FX2 | Tree/C4 canvas handlers call `requestArchitectureNavigation`, not internal `selectDiagram`. |
| C4 canvas pollution | regression assertion | FX2 | Diagram source/SVG never appears in topology canvas props. |

## Live verification steps

1. Copy FX2 into a temp Orca workspace.
2. Enable `enableArchitectureDiagramLibraryPreview`, open a diagram, edit source without saving.
3. Try switching to a C4 node, a flow, another diagram, and close Diagram review view.
4. Record Save and switch, Discard and switch, Cancel behavior.
5. Record keyboard navigation through Diagram library and dirty dialog.
6. Load FX9 and record search/filter/collapsible group behavior.

## Mock policy

- Mocks used: dialog and failed save may be mocked in component tests.
- Why the mock is allowed: error branches are hard to force through UI only.
- Non-mocked test proving completion: temp `.scry` save/discard/reload test through the real model path.

## Drift and PR evidence

- Drift check required: verify no direct user-facing `selectDiagram` calls remain, S1B did not implement render/cache/export, and source-only UI remains gated.
- PR evidence fields to fill: dirty switch evidence, keyboard evidence, large-list evidence, C4 canvas clean screenshot.
- Traceability rows to mark complete only after tests and live evidence pass: R1-R6, R14.

## Completion evidence

- Implemented source-only dirty draft guard expansion in `ArchitecturePanel.tsx` and `useArchitectureModelController.ts`.
- Implemented external reload modified/deleted conflict state with `DiagramExternalReloadConflict.modelName`, read-only compare, same-model resolution checks, and revision-conflict draft preservation.
- Implemented FX9 large-list Diagram library search/filter, collapsible kind groups, kind counts, `Unlinked` badges, arrow-key movement, and Enter activation.
- Added FX9 fixture at `src/shared/scryer/__fixtures__/diagram-library/many-diagrams-for-prompt.scry`.
- Automated checks run:
  - `corepack pnpm run lint`
  - `corepack pnpm run tc`
  - `corepack pnpm exec oxfmt --check src/renderer/src/components/architecture/ArchitectureModelTree.tsx src/renderer/src/components/architecture/DiagramSourceDraftView.tsx src/renderer/src/components/architecture/useArchitectureModelController.ts tests/e2e/architecture-diagram-library.spec.ts`
  - `git diff --check`
  - `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts src/shared/scryer/diagram-kind.test.ts src/shared/scryer/diagram-ids.test.ts src/main/scryer/model-store.test.ts src/main/scryer/diagram-controller-model-store.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/DiagramSourceDraftView.test.tsx src/renderer/src/components/architecture/ArchitectureModelTree.test.ts`
  - `corepack pnpm run tc:node`
  - `corepack pnpm run tc:web`
  - `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts`
- Live/real-path evidence: Electron headless E2E copied FX2/FX9 into a temp workspace `.scryer/model.scry`, enabled `orca-scryer:enableArchitectureDiagramLibraryPreview`, verified Save and switch writes, Discard and switch does not write, Cancel keeps draft, revision conflict keeps draft visible, external modified/deleted reload conflict behavior, clean C4 canvas after closing Diagram review view, keyboard reachable dirty dialog and Diagram library group/item behavior.
- Mock usage: component tests use mocked callbacks only for local UI assertions; completion evidence is paired with non-mocked `.scry` write/reload E2E and model-store tests.
- Broader regression note: `corepack pnpm test` was also attempted and failed outside the S1B diff in `src/main/git/upstream.test.ts`, `src/main/runtime/orchestration-cli-subprocess.test.ts`, `src/main/startup/run-electron-vite-dev-web.test.ts`, and `src/renderer/src/store/slices/worktrees.test.ts`. Those files have no S1B diff; the failures are recorded as follow-up full-suite blockers, not S1B completion evidence.

## Blockers

- None for LOCAL-S1B.
