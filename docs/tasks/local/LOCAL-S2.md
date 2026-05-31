# LOCAL-S2 - Render Diagram review view safely

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S2.md`
- Current status: complete
- Coding gate: completed after LOCAL-F1B, LOCAL-S1A, and LOCAL-S1B were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R7, R8.
- [x] Business rules: BR5, BR14, BR15.
- [x] Contract sections: render result, source editor save rules, stale render rules, external reload conflict rules.
- [x] Required exact names: `DiagramReviewView`, `DiagramReviewViewBaseProps`, `DiagramReviewViewProps`, `renderDiagram`, renderer wrapper `detectDiagramKind`, shared `detectMermaidDiagramKind`, `extractRenderedElements`, `requestArchitectureNavigation`, `resolveExternalDiagramReload`.
- [x] Fixture IDs: FX2, FX5, FX6, FX7, FX11, FX12, FX13, FX14, FX15, FX16, FX17.
- [x] Existing files: `MermaidBlock.tsx`, `mermaid-config.ts`, `DiagramReviewView.tsx`, `diagram-renderer.ts`.
- [x] Real data path: diagram source -> adapter -> sanitized SVG or diagnostic -> explicit save -> `.scry`.

## Requirement trace

- Requirement IDs: R7, R8.
- Business rule IDs: BR5, BR14, BR15.
- Traceability rows: R6, R7, R8.
- Live evidence IDs: L3B, L4.

## Contract rows to implement

- System contract sections: Render result contract, Frontend state contract, Source editor save rules, RenderAdapter support matrix.
- Frontend state rows: `DiagramReviewViewBaseProps` with `exportActions` and `refActions` omitted, `onDraftStateChange`, invalid/stale render state, external reload conflict choices.
- Backend/API rows: existing model save only.
- Database/data rows: save current source to `.scry`; no cache.
- Error codes: `renderer.invalid-source`, `renderer.unsupported-kind`, existing save/revision conflict codes.
- Fixture IDs: FX2, FX5, FX6, FX7, FX11, FX12, FX13, FX14, FX15, FX16, FX17.

## Required exact implementation names

- Functions: `renderDiagram`, renderer wrapper `detectDiagramKind`, shared `detectMermaidDiagramKind`, `extractRenderedElements`, `updateDiagramSource`, `requestArchitectureNavigation`, `resolveExternalDiagramReload`.
- Components/props: `DiagramReviewView`, `DiagramReviewViewBaseProps`; `exportActions` and `refActions` must be omitted, and `DiagramReviewViewExportActions` / `DiagramReviewViewRefActions` must not be used in S2.
- MCP handlers: none.
- IPC channels/types: existing model save only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `MermaidBlock.tsx`, `mermaid-config.ts`, `DiagramReviewView.tsx`, `diagram-renderer.ts`, `ArchitecturePanel.tsx`.
- Backend/API files: model-store save path touched by `updateDiagramSource`.
- Database/data files: FX2 temp `.scry`, FX5/FX6/FX7/FX11/FX12/FX13/FX14/FX15/FX16/FX17 Mermaid fixtures.
- Existing tests: MermaidBlock tests, Architecture panel tests, controller persistence tests if present.

## Real data path

- User action or MCP call: user selects diagram, edits source, explicitly saves.
- Frontend state transition: draft source -> runtime render result/diagnostic -> explicit save writes persisted source and clears dirty state.
- Backend/API call: existing model write path saves `diagrams[].source`.
- Persistence/cache path: `.scryer/model.scry`; no cache files.
- Reload/read-back proof: saved invalid and valid source survives reload.

## What to build

Complete DiagramReviewView split view: source editor, sanitized SVG render, diagnostics, stale/invalid state, and fixed unsaved-draft navigation behavior.

## Scope

- Frontend: source editor, sanitized SVG render pane, diagnostics, stale badge, dirty/external reload dialogs.
- Backend/API: existing save path only.
- Database/data: `.scry` source persistence only.
- Business rules: invalid source can be saved; stale SVG is visibly stale; no copy/export controls in S2.

## Acceptance Criteria

- [x] Valid Mermaid renders sanitized SVG.
- [x] Core Mermaid fixtures FX5/FX6/FX12/FX13/FX14 must render sanitized SVG.
- [x] Non-core Mermaid fixtures FX15/FX16/FX17 must be read from disk and assert explicit support status: render sanitized SVG or show `renderer.unsupported-kind`.
- [x] Keep `enableArchitectureDiagramLibraryPreview`, set its default to on after the full review page passes acceptance, and record that fixed release-control choice. Do not remove or replace the flag.
- [x] Runtime rendering uses the current local draft source; no S2 cache read/write and no render output is persisted.
- [x] Invalid Mermaid shows diagnostic with line/column when available.
- [x] Saving invalid source persists source and marks render invalid/stale.
- [x] S2 does not render copy/export controls at all; S7B is responsible for showing and disabling those controls.
- [x] S2 does not render ref-management controls, does not pass `refActions`, and does not pass no-op ref/navigation callbacks; S3/S4 own those callbacks.
- [x] Draft switch dialog has Save and switch, Discard and switch, Cancel.
- [x] External reload modified conflict dialog carries `modelName` and `diskState: 'modified'`, and has Keep draft, Reload from disk, Compare changes. Compare changes opens a read-only diff; closing the diff returns to the same conflict state until Keep draft or Reload from disk is selected. A conflict for another model must not resolve against the current model.
- [x] External reload deleted conflict carries `diskState: 'deleted'`, shows Keep draft, Discard deleted, Cancel, and never shows Compare changes.
- [x] No cache IPC, thumbnail cache, copy SVG, or export PNG implementation in S2.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Review valid render | FX5 | Real Mermaid adapter through UI | Source draft and sanitized SVG visible; render result `sourceHash` matches the draft source. |
| Required kind render matrix | FX5/FX6/FX12/FX13/FX14 | Real Mermaid adapter through UI/adapter | Flowchart, sequence, class, state, and ER all render sanitized SVG. |
| Non-core support matrix | FX15/FX16/FX17 | Real Mermaid adapter through UI/adapter | architecture-beta, gitGraph, and C4Context either render or show structured `renderer.unsupported-kind`; tests read fixture files from disk. |
| Review invalid render | FX7 | Real Mermaid adapter through UI | Diagnostic shown, source preserved, copy/export controls absent. |
| Stale render state | FX5 then invalid draft | Real adapter plus UI state | Old SVG stays visible only with stale badge and old sourceHash; S2 performs no cache write. |
| Large render responsiveness | FX11 | Real Mermaid adapter through UI/performance harness | CI asserts non-blocking UI and queue behavior; live evidence records timing target separately. |
| Draft switch | FX2 | Component test plus mocked failed save paired with real save test | `onDraftStateChange` updates controller state; `requestArchitectureNavigation` shows save/discard/cancel and failed save behavior. |
| External reload modified conflict | FX2 temp copy | Real `.scry` write plus component/state test | External disk edit while dirty shows model-bound Keep draft, Reload from disk, Compare changes; Compare changes opens read-only diff and closing it returns to the same conflict state. |
| External reload deleted conflict | FX2 temp copy | Real `.scry` write plus component/state test | External deletion of the active dirty diagram shows Keep draft, Discard deleted, Cancel; Discard deleted applies normal active-diagram fallback and Keep draft keeps the draft in conflict state. |
| Cross-model reload conflict | FX2 two-model temp copy | Component/controller state test | Conflict for model A is ignored or surfaced as non-mutating warning after switching to model B; model B draft is not overwritten. |
| Ref props absent in S2 | FX5 | Component test | `refActions` is absent; ref-management controls are not rendered; SVG clicks do not call no-op navigation. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Invalid Mermaid | `renderer.invalid-source` | FX7 | Diagnostic visible; source remains editable and saved only on explicit Save. |
| Unsupported Mermaid kind | `renderer.unsupported-kind` | FX7 variant | Structured diagnostic shown; app does not crash. |
| Save conflict | existing revision conflict code | FX2 | Dialog remains; draft is not lost. |
| External reload compare close | none; state assertion | FX2 | Closing Compare changes does not clear dirty state, overwrite draft, or complete navigation. |
| External reload deleted cancel | none; state assertion | FX2 | Cancel keeps draft, active selection, and `.scry` unchanged. |
| Stale render | none; state assertion | FX5 then invalid source | Previous SVG has stale badge and copy/export controls are absent in S2. |

## Live verification steps

1. Open FX5 diagram and record source plus SVG.
2. Replace source with FX7 and record diagnostic.
3. Save invalid source, reload, and record persisted source plus invalid/stale render state.
4. In a copied FX2 workspace, edit diagram source without saving, modify the same diagram source on disk, trigger reload, and record Keep draft / Reload from disk / Compare changes plus the read-only diff behavior.
5. Delete the active dirty diagram from disk or through MCP, trigger reload, and record Keep draft / Discard deleted / Cancel behavior.

## Mock policy

- Mocks used: UI tests may mock `renderDiagram` for dialog-only states.
- Why the mock is allowed: it isolates dirty draft and reload conflict behavior.
- Non-mocked test proving completion: real FX5/FX6/FX7/FX11/FX12/FX13/FX14/FX15/FX16/FX17 Mermaid adapter plus UI test through actual `renderDiagram`.

## Drift and PR evidence

- Drift check required: confirm no cache IPC, copy SVG, export PNG, no-op export callbacks, or no-op ref/navigation callbacks were added.
- PR evidence fields to fill: valid render screenshot L3B, invalid diagnostic screenshot, stale badge proof, external reload conflict proof, fixed release-control proof for `enableArchitectureDiagramLibraryPreview`, `.scry` source after reload.
- Traceability rows to mark complete only after tests and live evidence pass: R6 S2 portion, R7, R8.

## Blockers

- None for LOCAL-S2.

## Completion evidence

- Implemented `DiagramReviewView` with source/render split view, runtime draft rendering through `renderAdapter.renderDiagram`, diagnostic panel, stale render badge, explicit Save/Cmd+S source persistence, and model-bound external reload conflict UI.
- Wired `ArchitecturePanel.tsx` to use `DiagramReviewView` behind the retained `enableArchitectureDiagramLibraryPreview` flag. `DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS.enableArchitectureDiagramLibraryPreview` now defaults to `true`; explicit localStorage `false` still disables it.
- Added FX11 at `src/shared/scryer/__fixtures__/diagram-library/large-mermaid-flowchart-200.mmd` and adapter coverage for the large real Mermaid render path.
- Automated checks passed:
  - `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts src/shared/scryer/diagram-kind.test.ts src/shared/scryer/diagram-ids.test.ts src/main/scryer/model-store.test.ts src/main/scryer/diagram-controller-model-store.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/renderer/src/components/architecture/DiagramSourceDraftView.test.tsx src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/ArchitectureModelTree.test.ts`
  - `corepack pnpm run lint`
  - `corepack pnpm run tc`
  - targeted `oxfmt --check`
  - `git diff --check`
  - `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts`
- Live/real-path evidence: Electron headless E2E copied FX2/FX9 into temp workspaces, opened `DiagramReviewView`, rendered valid Mermaid SVG with `data-source-hash`, pasted FX7 invalid Mermaid, showed `renderer.invalid-source` and stale badge, saved invalid source to real `.scryer/model.scry`, reloaded and verified source plus diagnostic survived. The same E2E also rechecked S1B dirty draft and external reload modified/deleted conflict behavior through real `.scry` disk edits.
- No cache/export/ref drift: S2 does not add cache IPC, thumbnail cache, copy SVG, export PNG, `exportActions`, `refActions`, or no-op ref/navigation callbacks. E2E and component tests assert copy/export/ref controls are absent.
- Full-suite note: `corepack pnpm test` was rerun after the S2 fixes. It now fails only outside the S2 diff in `src/main/git/upstream.test.ts`, `src/main/runtime/orchestration-cli-subprocess.test.ts`, `src/main/startup/run-electron-vite-dev-web.test.ts`, and `src/renderer/src/store/slices/worktrees.test.ts`; these remain broader regression blockers, not LOCAL-S2 completion evidence.
