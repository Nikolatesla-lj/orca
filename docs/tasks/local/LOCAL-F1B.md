# LOCAL-F1B - Render queue and adapter shell

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-F1B.md`
- Current status: complete
- Coding gate: completed after LOCAL-F1A landed schema/types and shared Mermaid kind detection.

## Context Checklist

- [x] PRD/local fallback linked.
- [x] Contracts: render result, element key algorithm, SVG click binding, kind detection.
- [x] Implementation contracts: `DiagramRenderAdapter`, renderer wrapper `detectDiagramKind`, `renderDiagram`, `extractRenderedElements`; shared `detectMermaidDiagramKind` is provided by F1A.
- [x] Fixture IDs: FX5, FX6, FX7, FX12, FX13, FX14, FX15, FX16, FX17.
- [x] Error codes: `renderer.*`, related `parser.*`.
- [x] Existing code paths: `MermaidBlock.tsx`, `mermaid-config.ts`.
- [x] Real path: fixture Mermaid source -> existing Mermaid queue -> sanitized SVG/diagnostic result.
- [x] Mock usage: none for adapter completion evidence.

## Requirement trace

- Requirement IDs: R7, R8.
- Business rule IDs: BR5, BR14, BR15.
- Traceability rows: R7, R8.
- Live evidence IDs: L4; L3B is completed by LOCAL-S2 because F1B has no user-visible review view.

## Contract rows to implement

- System contract sections: Render result contract, RenderAdapter support matrix, SVG click binding rules.
- Frontend state rows: diagram render result feeds `DiagramReviewView`.
- Backend/API rows: not applicable; no IPC in this slice.
- Database/data rows: no `.scry` or cache writes.
- Error codes: `renderer.invalid-source`, `renderer.unsupported-kind`, `renderer.sanitization-failed`, related `parser.*`.
- Fixture IDs: FX5, FX6, FX7, FX12, FX13, FX14, FX15, FX16, FX17.

## Required exact implementation names

- Module: `src/renderer/src/components/architecture/diagram-renderer.ts`
- Module: `src/renderer/src/components/architecture/mermaid-render-queue.ts`
- Functions: renderer wrapper `detectDiagramKind`, `renderDiagram`, `extractRenderedElements`; do not duplicate shared `detectMermaidDiagramKind`.

## Existing code to inspect before coding

- Frontend files: `src/renderer/src/components/editor/MermaidBlock.tsx`, `src/renderer/src/components/editor/mermaid-config.ts`.
- Backend/API files: none.
- Database/data files: Mermaid source fixtures FX5, FX6, FX7, FX12, FX13, FX14, FX15, FX16, FX17.
- Existing tests: current editor Mermaid block tests if present.

## Real data path

- User action or MCP call: renderer receives a real `Diagram` from `.scry` data in later slices.
- Frontend state transition: source changes produce render result or diagnostic.
- Backend/API call: none.
- Persistence/cache path: none; render output is runtime only.
- Reload/read-back proof: fixture source renders through existing Mermaid and DOMPurify without cache.

## What to build

Extract or reuse the existing Mermaid render queue and create the default `DiagramRenderAdapter` without cache, copy/export, or UI library work.

## Scope

- Frontend: render queue, default adapter, diagnostics, sanitized SVG, element key extraction.
- Backend/API: none.
- Database/data: none.
- Business rules: no `beautiful-mermaid` unless a real fixture proves a capability gap.

## Acceptance Criteria

- [x] `renderDiagram(diagram, options)` is the only adapter render function.
- [x] Renderer `detectDiagramKind` delegates to shared `detectMermaidDiagramKind`; it does not reimplement directive mapping.
- [x] Valid FX5/FX6/FX12/FX13/FX14 render through existing Mermaid and DOMPurify; failure for these five required kinds blocks completion.
- [x] FX15 architecture-beta, FX16 gitGraph, and FX17 C4Context are read from disk and have explicit support-matrix assertions: each either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter/version details.
- [x] Invalid FX7 returns `renderer.invalid-source` without changing source.
- [x] Bindable SVG elements include `data-diagram-element-key`.
- [x] No direct parallel `mermaid.render()` calls outside the shared queue.
- [x] No `beautiful-mermaid` dependency unless a real adapter test proves a capability gap.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Real flowchart render | FX5 | Real Mermaid adapter | Sanitized SVG and stable element keys. |
| Real sequence render | FX6 | Real Mermaid adapter | Renders with existing Mermaid adapter. |
| Real class render | FX12 | Real Mermaid adapter | Renders sanitized SVG. |
| Real state render | FX13 | Real Mermaid adapter | Renders sanitized SVG. |
| Real ER render | FX14 | Real Mermaid adapter | Renders sanitized SVG. |
| Architecture-beta support matrix | FX15 | Real Mermaid adapter | Either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter/version details. |
| GitGraph support matrix | FX16 | Real Mermaid adapter | Either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter/version details. |
| C4Context support matrix | FX17 | Real Mermaid adapter | Either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter/version details. |
| Invalid source | FX7 | Real Mermaid adapter | `ok:false`, code `renderer.invalid-source`, source untouched. |
| Queue serialization | FX5/FX6 | Real shared queue | Concurrent calls are serialized through shared queue. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Invalid Mermaid | `renderer.invalid-source` | FX7 | Result is `ok:false`; original source remains unchanged. |
| Unsupported kind | `renderer.unsupported-kind` | FX7 variant | Diagnostic names detected kind and says unsupported. |
| Unsafe SVG content | `renderer.sanitization-failed` or sanitized success | FX5 variant | Raw event handlers are absent from returned SVG. |

## Live verification steps

1. Use a temp UI or component harness with FX5.
2. Record sanitized SVG output and absence of raw event handlers.

## Mock policy

- Mocks used: no renderer mock may count as completion evidence.
- Why the mock is allowed: UI-only tests may mock the adapter later, but F1B must use real Mermaid.
- Non-mocked test proving completion: FX5/FX6/FX7/FX12/FX13/FX14/FX15/FX16/FX17 adapter tests through existing Mermaid queue and DOMPurify.

## Drift and PR evidence

- Drift check required: ensure all calls use `renderDiagram(diagram, options)` and no parallel `mermaid.render()` path is introduced.
- PR evidence fields to fill: supported kinds, unsupported kinds, fixtures, sanitized SVG proof.
- Traceability rows to mark complete only after tests and live evidence pass: R7, R8.

## Completion evidence

- Implemented shared Mermaid render queue in `src/renderer/src/components/architecture/mermaid-render-queue.ts`; `MermaidBlock` and the diagram adapter both render through `renderMermaidSvg`, so direct `mermaid.render()` is centralized.
- Implemented default adapter in `src/renderer/src/components/architecture/diagram-renderer.ts` with `detectDiagramKind`, `renderDiagram`, `extractRenderedElements`, required result shape, `sourceHash`, `rendererVersion`, sanitized SVG, `renderer.invalid-source`, structured `renderer.unsupported-kind`, and flowchart `data-diagram-element-key` annotation.
- Added real fixture files FX5, FX6, FX7, FX12, FX13, FX14, FX15, FX16, and FX17 under `src/shared/scryer/__fixtures__/diagram-library/`.
- Added real jsdom Mermaid adapter tests in `src/renderer/src/components/architecture/diagram-renderer.test.ts`; no renderer mocks are used for F1B completion evidence.
- Added `jsdom` as a dev dependency so Vitest can run real `mermaid.render()` with a DOM-like test harness.
- Automated checks run:
  - `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/diagram-renderer.test.ts`
  - `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/shared/scryer/diagram-kind.test.ts src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/renderer/src/components/architecture/DiagramSourceDraftView.test.tsx src/renderer/src/components/architecture/ArchitectureModelTree.test.ts`
  - `corepack pnpm run lint`
  - `corepack pnpm run tc`
  - `corepack pnpm exec oxfmt --check src/renderer/src/components/architecture/diagram-renderer.ts src/renderer/src/components/architecture/mermaid-render-queue.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/renderer/src/components/editor/MermaidBlock.tsx`
  - `git diff --check`
  - `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts`
- Live/component-harness evidence: the jsdom adapter test reads FX5 from disk, calls real Mermaid through the shared queue, returns sanitized SVG, verifies raw event handlers are absent, verifies stable `elementKey`, and verifies `data-diagram-element-key` annotation. The Electron headless E2E also rebuilt the app and reran the existing real `.scry` Architecture flow without regression.
- Drift evidence: `rg "mermaid\\.render|renderMermaidSvg|enqueueMermaidRender" src/renderer/src/components -g '*.{ts,tsx}'` shows `mermaid.render()` only in `mermaid-render-queue.ts`; no `beautiful-mermaid` dependency was added.
- Broader regression note: `corepack pnpm test` was attempted and still fails outside the F1B diff in `src/main/git/upstream.test.ts`, `src/main/runtime/orchestration-cli-subprocess.test.ts`, `src/main/startup/run-electron-vite-dev-web.test.ts`, and `src/renderer/src/store/slices/worktrees.test.ts`. F1B's new `diagram-renderer.test.ts` passes inside that run.

## Blockers

- None for LOCAL-F1B.
