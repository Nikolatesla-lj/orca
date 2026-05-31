# LOCAL-S7B - Copy, export, thumbnails, and delete cleanup integration

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S7B.md`
- Current status: complete
- Coding gate: open after LOCAL-S2, LOCAL-S5, and LOCAL-S7A were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R13, R14, R15.
- [x] Business rules: BR9, BR10, BR15.
- [x] Contract sections: S7B-only export actions, `exportActions?: DiagramReviewViewExportActions`, `DiagramReviewExportPayload`, review SVG cache usage, thumbnail/export cache usage, cache IPC, hash/cache rules, UI delete cleanup warning behavior, S5 MCP delete cleanup regression verification.
- [x] Required exact names: `DiagramReviewExportPayload`, `DiagramReviewViewExportActions`, `exportActions`, `onCopySvg`, `onExportPng`, `clearDiagramCache`.
- [x] Fixture IDs: FX5, FX8, FX11.
- [x] Existing files: `DiagramReviewView.tsx`, `diagram-cache-client.ts`, `mcp-tools.ts`, `useArchitectureModelController.ts`, `html-to-image` usage.
- [x] Real data path: UI render/export -> cache IPC -> `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/` -> copy/export/delete cleanup evidence.

## Requirement trace

- Requirement IDs: R13, R14, R15.
- Business rule IDs: BR9, BR10, BR15.
- Traceability rows: R13, R14, R15.
- Live evidence IDs: L9.

## Contract rows to implement

- System contract sections: copy/export controls, clean persisted source cache/export rules, thumbnail cache, UI cache cleanup warning behavior, S5 MCP delete cleanup regression rule.
- Frontend state rows: copy/export controls appear only in S7B and are disabled for dirty/invalid/stale/locked render.
- Backend/API rows: consume S7A cache IPC; do not redefine cache file rules; do not modify MCP tool schemas or handlers.
- Database/data rows: `.scryer/cache/diagrams/...`; `.scry` stays source/refs only.
- Error codes: `cache.clear-failed`, `controller.export-failed`, plus S7A cache codes when cache calls fail.
- Fixture IDs: FX5, FX8, FX11.

## Required exact implementation names

- Functions: `onCopySvg`, `onExportPng`, UI `clearDiagramCache` integration.
- Components/props: `DiagramReviewExportPayload`, `exportActions?: DiagramReviewViewExportActions`; S7B passes real callbacks, never no-op callbacks.
- MCP handlers: S5 already consumes `clearDiagramCache`; S7B verifies the integrated warning behavior.
- IPC channels/types: S7A cache IPC only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `DiagramReviewView.tsx`, `ArchitectureModelTree.tsx`, `useArchitectureModelController.ts`.
- Backend/API files: cache IPC service from S7A. `mcp-tools.ts` is covered only by rerunning S5 regression tests; S7B must not edit MCP schemas or handlers.
- Database/data files: `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/`, FX5, FX8, FX11.
- Existing tests: S2 render tests, S5 MCP delete tests, S7A cache tests.

## Real data path

- User action or MCP call: user copies SVG, exports PNG, sees thumbnails, or deletes a diagram through UI; S5 MCP delete is rerun as a regression path only.
- Frontend state transition: S7B passes real `exportActions?: DiagramReviewViewExportActions` callbacks that receive current `DiagramReviewExportPayload`, and enables review SVG cache usage in DiagramReviewView only for clean persisted-source renders.
- Backend/API call: existing cache IPC from S7A.
- Persistence/cache path: `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/`; never `.scry`.
- Reload/read-back proof: cache miss rebuilds from source; delete clears cache or reports warning.

## What to build

Add copy SVG, export PNG, thumbnail cache UI, and UI delete cleanup integration on top of the S7A cache service. MCP delete cleanup remains owned by S5 and is only regression-tested here.

## Scope

- Frontend: S7B-only copy/export controls, review SVG cache reads/writes, and thumbnail cache reads.
- Backend/API: consume S7A cache IPC; do not add new cache path rules and do not modify MCP tool schemas or handlers.
- Database/data: Derived cache files only.
- Business rules: cleanup failure warns but does not roll back `.scry`.

## Acceptance Criteria

- [x] Copy SVG writes the sanitized SVG from the current `DiagramReviewExportPayload`; it must not refetch by diagram id.
- [x] Export PNG is generated from the current `DiagramReviewExportPayload.svg` and asks for a destination through native save dialog or the existing Orca save-file flow.
- [x] Export PNG default filename is sanitized diagram name, falls back to diagram id when empty, and always uses `.png`.
- [x] User cancel during export is not an error and writes no file, cache, or `.scry`; export write failure shows `controller.export-failed`.
- [x] copy/export controls only appear in S7B; dirty/invalid/stale/locked render disables them.
- [x] `DiagramReviewView` receives copy/export only through `exportActions?: DiagramReviewViewExportActions`; S7B passes real callbacks with `DiagramReviewExportPayload` and S2 remains `exportActions` absent.
- [x] Review SVG cache for DiagramReviewView is first wired in S7B; S2 remains cache-free; S7B only reads/writes cache when draft is clean and the render payload sourceHash equals persisted `Diagram.source`.
- [x] Thumbnail cache key uses S7A `computeDiagramCacheKey` from persisted sourceHash.
- [x] Modifying source/theme/rendererVersion invalidates old cache.
- [x] UI delete diagram requests real cache cleanup; cleanup failure warns but does not roll back `.scry` deletion.
- [x] S5 MCP delete cleanup behavior remains covered after S7B; S7B must not change MCP tool schemas, handler signatures, or CLI bridge schema.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Copy/export | FX5 | Real sanitized SVG; clipboard may be mocked only with paired export test | `DiagramReviewExportPayload.svg` is copied, PNG export is generated from that same SVG, and no diagram-id refetch occurs. |
| Export destination | FX5 | Real save dialog abstraction or existing save-file flow | Default filename is sanitized, `.png` extension is fixed, cancel writes nothing, write failure returns `controller.export-failed`. |
| Copy/export keyboard | FX5/FX7 | Component/E2E test | Toolbar buttons are reachable and labelled; dirty/invalid/stale/locked disabled states are exposed and no disabled action writes clipboard, files, cache, or `.scry`. |
| Thumbnail cache | FX5/FX8 | Real temp cache path | Thumbnail cache uses S7A cache key from persisted sourceHash and invalidates on source/theme/version change. |
| Review SVG cache | FX5/FX8 | Real temp cache path | DiagramReviewView uses `outputProfile: 'review'` SVG cache only for clean persisted-source renders and rebuilds from source on `cache.read-miss`. |
| Thumbnail batch performance | FX11 | Real render queue plus temp cache path | 20 thumbnails are queued through the shared queue and do not block typing or tree navigation. |
| UI delete cleanup | FX5/FX8 | Real temp cache path and `.scry` write | UI delete removes refs and requests cache cleanup. |
| S5 MCP delete regression | FX2/FX8 | Existing S5 MCP test path | S5 `delete_diagram` still calls real `context.clearDiagramCache`; S7B changes do not alter MCP schemas or handlers. |
| No render output in `.scry` | FX5 | Real `.scry` inspection | `.scry` contains source/refs only after copy/export/thumbnail. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Dirty/invalid/stale render export | none; disabled state | FX7 or FX5 then unsaved/invalid source | Copy/export buttons are disabled and no cache write occurs. |
| Export cancelled | none; state assertion | FX5 | Cancel closes export without error and writes no file/cache/model data. |
| Export write failed | `controller.export-failed` | FX5 | Failure is user-visible and `.scry` plus cache remain unchanged. |
| Cache cleanup failure | `cache.clear-failed` warning | FX8 | `.scry` deletion persists and warning is visible/returned. |
| Thumbnail cache miss | `cache.read-miss` | FX8 | UI rebuilds from current source instead of changing `.scry`. |

## Live verification steps

1. [x] Copy FX5/FX8/FX11 into a temp workspace.
2. [x] Render, copy SVG, export PNG through the save dialog or save-dialog abstraction, and record output/cache path plus default filename.
3. [x] Load Diagram library twice and record thumbnail cache behavior.
4. [x] Load the FX11 thumbnail batch path and record that UI remains responsive while thumbnails render.
5. [x] Delete a diagram through UI and record cache cleanup warning/success behavior.
6. [x] Rerun the S5 MCP delete cleanup regression and record that S7B did not change MCP schemas or handlers.

## Completion evidence

- Focused E2E regression: `npx playwright test tests/e2e/architecture-diagram-library.spec.ts --config tests/playwright.config.ts --project electron-headless -g "binds a rendered SVG element"` -> 1 passed.
- Diagram library Electron E2E: `npx playwright test tests/e2e/architecture-diagram-library.spec.ts --config tests/playwright.config.ts --project electron-headless` -> 6 passed. Real `.scry` reload assertions verify no `<svg`, `sourceHash`, or `diagnostics` render output is persisted.
- Targeted Vitest: `corepack pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/DiagramReviewView.element-navigation.test.tsx src/renderer/src/components/architecture/ArchitectureModelTree.test.ts src/renderer/src/components/architecture/diagram-export-actions.test.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/main/ipc/export.test.ts src/main/ipc/diagram-cache.test.ts src/shared/scryer/diagram-cache.test.ts src/main/scryer/mcp-tools.test.ts` -> 10 files, 74 tests passed.
- Type/lint/build checks: `corepack pnpm run tc` passed; `corepack pnpm run lint` found 0 warnings and 0 errors; `corepack pnpm run build:cli` TypeScript build passed and reported only the existing `/usr/local/bin/orca-dev` symlink permission notice.
- Diff checks: `git diff --check` and `git diff --cached --check` passed.
- Real path evidence: `src/main/ipc/diagram-cache.test.ts` writes/reads review SVG and PNG profiles under `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/`; `diagram-export-actions.test.ts` proves current-payload SVG copy/export, cancel without cache write, and `controller.export-failed`; `architecture-diagram-library.spec.ts` proves real `.scry` save/reload paths keep render outputs out of model data.

## Mock policy

- Mocks used: clipboard may be mocked only in a paired UI unit test.
- Why the mock is allowed: OS clipboard can be flaky in CI.
- Non-mocked test proving completion: real temp cache path tests and html-to-image/export integration where available.

## Drift and PR evidence

- Drift check required: verify S7B uses S7A cache contracts, does not duplicate cache path logic, and does not modify MCP tool schemas or handlers.
- PR evidence fields to fill: copy/export evidence, thumbnail cache path, delete cleanup warning/success.
- Traceability rows to mark complete only after tests and live evidence pass: R13, R14, R15.

## Blockers

- None. LOCAL-S2, LOCAL-S5, and LOCAL-S7A are complete.
