# LOCAL-S3A - Create diagram then link

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S3A.md`
- Current status: complete
- Coding gate: completed after LOCAL-S1A, LOCAL-S1B, LOCAL-S2, and LOCAL-S3 were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R9, R10.
- [x] Business rules: BR4, BR6, BR16.
- [x] Contract sections: DiagramRef creation workflow, frontend state contract, source editor save rules.
- [x] Required exact names: `createDiagram`, `createDefaultDiagramSource`, `createDiagramRef`, `upsertDiagramRefs`, `requestArchitectureNavigation`; internal `selectDiagram` is allowed only after guard success.
- [x] Fixture IDs: FX2, FX5.
- [x] Existing files: `ArchitectureContextPanel.tsx`, `ArchitectureModelTree.tsx`, `DiagramReviewView.tsx`, `useArchitectureModelController.ts`.
- [x] Real data path: target-side Add diagram reference -> create diagram -> save source -> create `DiagramRef` -> `.scry` reload.
- [x] Mock usage: component tests may mock picker callbacks only with paired real `.scry` persistence test.

## Requirement trace

- Requirement IDs: R9, R10.
- Business rule IDs: BR4, BR6, BR16.
- Traceability rows: R10.
- Live evidence IDs: L6.

## Contract rows to implement

- System contract sections: DiagramRef creation workflow, Diagram library ordering, Source editor save rules.
- Frontend state rows: preserve pending target while switching to diagram creation/review.
- Backend/API rows: controller create diagram plus create ref through existing save path.
- Database/data rows: `.scry` top-level `diagrams` and `diagramRefs`.
- Error codes: `controller.missing-role`, `controller.missing-target`, `controller.persist-failed`, `controller.revision-conflict`, `parser.missing-target`.
- Fixture IDs: FX2, FX5.

## Required exact implementation names

- Functions: `createDiagram`, `createDefaultDiagramSource`, `createDiagramRef`, `upsertDiagramRefs`, `requestArchitectureNavigation`; do not call internal `selectDiagram` from UI event handlers.
- Components/props: target-side Add diagram reference UI, Diagram library create flow, `DiagramReviewView`.
- MCP handlers: none.
- IPC channels/types: existing model save only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `ArchitectureContextPanel.tsx`, `ArchitectureModelTree.tsx`, `DiagramReviewView.tsx`, `useArchitectureModelController.ts`.
- Backend/API files: existing model-store write path.
- Database/data files: FX2 temp `.scry`, FX5 Mermaid source.
- Existing tests: S1A create/persist tests, S1B navigation guard tests, and S3 ref persistence tests.

## Real data path

- User action or MCP call: from a selected node/edge/group/flow/flow step/source panel, user clicks Add diagram reference and chooses Create diagram then link.
- Frontend state transition: keep pending target, create the new diagram, navigate to it through `requestArchitectureNavigation({ type: 'diagram', diagramId })`, let user edit/save source, then confirm ref role and save ref.
- Backend/API call: existing model save path writes diagram first, then ref.
- Persistence/cache path: `.scryer/model.scry`; no Derived cache.
- Reload/read-back proof: reload shows the new diagram in Diagram library and the new ref on both target side and diagram side.

## What to build

Add a user flow that creates a new diagram from the reference picker and returns to the original target with the new diagram already selected for linking.

## Scope

- Frontend: Create diagram then link flow, pending target state, role selection after source save.
- Backend/API: existing model save only.
- Database/data: `.scry` diagrams and diagramRefs.
- Business rules: if diagram creation or source save fails, no half-created ref is written.

## Acceptance Criteria

- [x] Add diagram reference offers both Select existing diagram and Create diagram then link.
- [x] Pending target survives navigation to the diagram creation/review screen.
- [x] Navigating to the newly created diagram uses `requestArchitectureNavigation`; direct UI calls to internal `selectDiagram` are forbidden.
- [x] Create diagram then link uses `createDefaultDiagramSource(...)` and never creates a diagram with empty source.
- [x] After the new diagram is saved, the user returns to role selection for the original target.
- [x] Saving the role writes one `DiagramRef` to the new diagram and target.
- [x] Cancel at any step leaves `.scry` unchanged except for an explicitly saved new diagram when the user already confirmed saving it; in that case the UI shows "Diagram created, not linked yet." with `Link now`.
- [x] `Link now` resumes role selection when the original pending target still exists; if the target was deleted, it opens the diagram-side ref recovery path and shows target unavailable.
- [x] Reload shows the diagram and ref consistently.

## Completion evidence

- Targeted Vitest: `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/DiagramReferenceControls.test.tsx src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/diagram-controller.test.ts src/main/scryer/diagram-controller-model-store.test.ts` -> 4 files / 23 tests passed.
- Typecheck: `corepack pnpm run tc` passed.
- Lint: `corepack pnpm run lint` passed with 0 warnings and 0 errors.
- Format: `corepack pnpm exec oxfmt --check ...` passed.
- Diff hygiene: `git diff --check` passed.
- Live/real path: `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` -> 5 passed. The new S3A scenario copied FX2 into a temp workspace, used FX5 source, created a diagram from the target-side ref picker, saved source, wrote one `DiagramRef`, reloaded, and asserted both target-side and diagram reverse lists.

## Required automated tests

| Test                    | Fixture   | Real path or mock                            | Exact assertions                                                                                                                                                                       |
| ----------------------- | --------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create then link        | FX2 + FX5 | Real `.scry` write/reload                    | New diagram and ref persist after reload.                                                                                                                                              |
| Preserve pending target | FX2       | Component/state test                         | Flow returns to the original target, not the currently selected tree item.                                                                                                             |
| Cancel behavior         | FX2       | Component/state test plus real `.scry` check | No ref is written when user cancels before final link save; if a diagram was explicitly saved first, the "Diagram created, not linked yet." message and `Link now` action are visible. |
| Link now resume         | FX2       | Component/state test                         | Existing target resumes role selection; deleted target opens diagram-side picker with target unavailable warning.                                                                      |
| Create/link keyboard    | FX2       | Component/state test                         | Keyboard reaches Create diagram then link, source save, role selection, `Link now`, and cancel controls with predictable focus.                                                        |

## Required negative tests

| Failure                    | Expected code                                                 | Fixture     | Exact assertion                                                 |
| -------------------------- | ------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| Diagram save fails         | `controller.persist-failed` or `controller.revision-conflict` | FX2         | No ref is created and pending target remains visible.           |
| Missing role               | `controller.missing-role`                                     | FX2         | Ref is not saved and `.scry` remains unchanged.                 |
| Target deleted during flow | `controller.missing-target` or `parser.missing-target`        | FX2 variant | User sees target unavailable; no dangling ref is created by UI. |

## Live verification steps

1. Copy FX2 into a temp Orca workspace.
2. Select a C4 node and choose Add diagram reference -> Create diagram then link.
3. Create and save a Mermaid source from FX5.
4. Select role, save the ref, reload, and record target-side plus diagram-side ref lists.
5. Repeat cancel after saving the diagram, click `Link now`, and record that the flow resumes instead of leaving the user at a dead end.

## Mock policy

- Mocks used: component tests may mock modal callbacks.
- Why the mock is allowed: modal sequencing can be isolated from persistence.
- Non-mocked test proving completion: real temp `.scry` create-diagram-then-link reload test.

## Drift and PR evidence

- Drift check required: verify S3 remains existing-diagram-only and S3A owns inline create.
- PR evidence fields to fill: before/after `.scry`, target panel screenshot, diagram reverse list screenshot.
- Traceability rows to mark complete only after tests and live evidence pass: R10.

## Blockers

- None. LOCAL-S1A, LOCAL-S1B, LOCAL-S2, and LOCAL-S3 are complete.
