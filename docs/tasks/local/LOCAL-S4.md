# LOCAL-S4 - SVG element binding and target navigation

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S4.md`
- Current status: complete
- Coding gate: open after LOCAL-F1B, LOCAL-S2, LOCAL-S3, and LOCAL-S7A were confirmed complete. S4 uses DiagramReviewView from S2, refs from S3, and S7A project authorization for source target opening.

## Context Checklist

- [x] Requirement IDs: R9, R10.
- [x] Business rules: BR4, BR6, BR16.
- [x] Contract sections: element key algorithm, SVG click binding, DiagramRef creation workflow, source target safety rules.
- [x] Required exact names: `extractRenderedElements`, `DiagramReviewView`, `DiagramReviewViewRefActions`, `DiagramElementTargetPicker`, `DiagramElementTargetPickerProps`, `resolveDiagramElementNavigation`, `onNavigateRefTarget`, `createDiagramRef`, `validateWorkspaceRelativeSourcePattern`, `resolveWorkspaceSourcePattern`, `openDiagramSourceTarget`, `SourceOpenLocation`.
- [x] Fixture IDs: FX2, FX3, FX5.
- [x] Existing files: `DiagramReviewView.tsx`, `ArchitectureCanvas.tsx`, `useArchitectureModelController.ts`, `source-map-paths.ts`.
- [x] Real data path: rendered SVG element -> stable `elementKey` -> `DiagramRef` -> `resolveDiagramElementNavigation` -> direct target navigation or target picker.

## Requirement trace

- Requirement IDs: R9, R10.
- Business rule IDs: BR4, BR6, BR16.
- Traceability rows: R9, R10.
- Live evidence IDs: L7.

## Contract rows to implement

- System contract sections: element key algorithm, SVG click binding, DiagramRef creation workflow, source target safety rules.
- Frontend state rows: delegated SVG click navigation and selected target restore.
- Backend/API rows: source target opening must use pure `validateWorkspaceRelativeSourcePattern(...)`, then S7A-backed `resolveWorkspaceSourcePattern(...)` and `openDiagramSourceTarget(...)`; code file line numbers come from `DiagramRefTarget.source.line/endLine`, not `DiagramRef.sourceRange`.
- Database/data rows: `diagramRefs.elementKey`; no `svgSelector` persisted.
- Error codes: `renderer.invalid-source`, `parser.missing-target`, `parser.invalid-source-target`, `controller.invalid-source-target`, `controller.source-open-failed`.
- Fixture IDs: FX2, FX3, FX5.

## Required exact implementation names

- Functions: `extractRenderedElements`, `resolveDiagramElementNavigation`, `createDiagramRef`, `validateWorkspaceRelativeSourcePattern`, `resolveWorkspaceSourcePattern`, `openDiagramSourceTarget`.
- Components/props: `DiagramReviewView`, `DiagramReviewViewRefActions`, `DiagramElementTargetPicker`, `DiagramElementTargetPickerProps`, `onNavigateRefTarget`.
- MCP handlers: none.
- IPC channels/types: existing source open path only if used.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `DiagramReviewView.tsx`, `ArchitectureCanvas.tsx`, `useArchitectureModelController.ts`, `source-map-paths.ts`.
- Backend/API files: shared source target pattern helper, S7A filesystem-auth wrapper if created, and existing source open IPC/path helpers if source targets are supported; add or reuse the exact helper contracts `validateWorkspaceRelativeSourcePattern(...)`, `resolveWorkspaceSourcePattern(...)`, and `openDiagramSourceTarget(...)` before source targets can open files.
- Database/data files: FX2 temp `.scry`, FX3 unsafe source target fixture, FX5 Mermaid fixture.
- Existing tests: render adapter element extraction and architecture navigation tests if present.

## Real data path

- User action or MCP call: user binds a rendered SVG element to a target, then clicks that element.
- Frontend state transition: click reads `data-diagram-element-key`; `resolveDiagramElementNavigation` returns no navigable target, one direct target, or a multi-target picker. The controller switches view only after a unique target is known or the user chooses one target.
- Backend/API call: none unless opening a source file target.
- Persistence/cache path: `.scryer/model.scry` `diagramRefs[].elementKey`.
- Reload/read-back proof: reload and confirm element click still navigates by stable `elementKey`.

## What to build

Allow users to bind a stable SVG element to a model/source target, then click that element to navigate to its bound C4/flow/source target.

## Scope

- Frontend: element picker/binding, delegated click listener, reverse reference list, navigation.
- Backend/API: source navigation support only through the shared pattern helper plus S7A trusted project authorization. Do not add a second source authorization system in S4.
- Database/data: `diagramRefs.elementKey`.
- Business rules: no raw SVG event handlers and no persisted selectors; default SVG click mode navigates only existing refs, while `Bind element` mode must be explicitly entered and exited.

## Acceptance Criteria

- [x] Element-level ref creation only offers bindable elements from `DiagramRenderedElement[]`.
- [x] Default SVG click mode is navigation; `Bind element` enters binding mode, and `Esc`, `Cancel`, or saving the ref exits binding mode.
- [x] Saved refs use `elementKey`, never `svgSelector`.
- [x] Bound SVG click navigates to the correct C4/flow/source target when the element has exactly one unique navigable target.
- [x] If a bound SVG element has multiple distinct C4/flow/source targets, the UI shows a target picker and does not auto-open the first ref. The picker collapses duplicate refs to the same target and shows roles/notes.
- [x] The target picker uses `DiagramElementTargetPickerProps` exactly: `candidates`, `onChoose`, and `onCancel`. `candidates` must be the array returned by `resolveDiagramElementNavigation(...)`, `onChoose` is the only navigation path, and `onCancel` closes the picker without changing selection or opening source.
- [x] Whole-diagram refs are shown in the reverse reference list; clicking a row navigates to that exact target, while clicking the diagram title or blank render area never guesses among multiple whole-diagram refs.
- [x] Unbound SVG click does nothing.
- [x] Source range unavailable is shown honestly; no fake line numbers.
- [x] Code-file line jumps use `DiagramRefTarget.source.line/endLine`; Mermaid `DiagramRef.sourceRange` is displayed only as diagram-source context and is not used to open code files.
- [x] Source targets reject absolute paths, `..`, `~`, URL schemes, NUL bytes, unsupported globs, unauthorized projects, and escaping glob/symlink matches; every opened source path must resolve inside the authorized project root.
- [x] Source target glob behavior is fixed: zero matches show `controller.source-open-failed` with `reason: 'no-matches'`; one match opens that file; multiple matches show a picker and do not auto-open the first match.

## Required automated tests

| Test                       | Fixture           | Real path or mock                     | Exact assertions                                                                                                                                                                 |
| -------------------------- | ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable keys                | FX5               | Real Mermaid adapter                  | Same source renders same elementKey.                                                                                                                                             |
| Create element ref         | FX2 + FX5         | Real `.scry` write/reload             | Ref saved with elementKey and target.                                                                                                                                            |
| Binding mode transitions   | FX5               | UI state test                         | Default click navigates only when bound; Bind element changes click to selection; Esc/Cancel/save exits binding mode.                                                            |
| Click navigation           | FX2 + FX5         | UI/E2E state test                     | Mode and selected target update correctly.                                                                                                                                       |
| Multi-target element click | FX2 + FX5 variant | UI state test                         | Same `elementKey` with two distinct valid targets shows target picker; no navigation before user selection; selected row navigates to that target.                               |
| Target picker props        | FX2 + FX5 variant | UI state test                         | `DiagramElementTargetPickerProps.candidates` equals resolver output; `onChoose` navigates only to the chosen candidate; `onCancel` has no navigation or source-open side effect. |
| Duplicate same-target refs | FX2 + FX5 variant | UI state test                         | Multiple refs for the same `elementKey` and same target collapse to one picker row or one direct candidate, with roles/notes preserved for display.                              |
| Whole-diagram ref list     | FX2 variant       | UI state test                         | One diagram referenced by two targets shows two reverse-list rows; clicking each row navigates to that row's target; blank diagram clicks do not navigate.                       |
| Unsafe SVG                 | FX5 modified      | Real sanitizer path                   | No raw event handlers survive sanitization.                                                                                                                                      |
| Source target line open    | FX2 temp copy     | Real source file open path            | `DiagramRefTarget.source.line/endLine` opens the matched code file at that line range; `sourceRange` is not used as code location.                                               |
| Source glob selection      | FX2 temp copy     | Real temp files plus runtime resolver | Zero matches return `controller.source-open-failed`; one match opens; multiple matches return `selection-required` and UI opens only the chosen file.                            |

## Required negative tests

| Failure                          | Expected code                      | Fixture                                        | Exact assertion                                                                                                                     |
| -------------------------------- | ---------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unbound element click            | none                               | FX5                                            | No navigation or state mutation occurs.                                                                                             |
| Ambiguous element click          | none                               | FX2 + FX5 variant                              | Multiple distinct targets never auto-select the first target.                                                                       |
| Missing target ref               | `parser.missing-target`            | FX3 or FX2 variant                             | Warning shown; click does not crash.                                                                                                |
| Unsafe SVG handler               | sanitized success                  | FX5 modified                                   | `onclick` and similar attributes are absent.                                                                                        |
| Missing sourceRange              | none; unavailable state            | FX5                                            | UI shows unavailable instead of fake line numbers.                                                                                  |
| Unsafe source target             | `parser.invalid-source-target`     | FX3 variant or inline source target fixture    | Path is not opened, warning is shown, and no navigation outside workspace occurs.                                                   |
| UI unsafe source target          | `controller.invalid-source-target` | FX3 variant                                    | Source ref creation rejects unsafe paths before saving.                                                                             |
| Unauthorized project source open | `controller.invalid-source-target` | FX2 temp copy plus unauthorized project path   | Source opening refuses to resolve or open until the existing filesystem-auth trusted seam authorizes the project path.              |
| Source open failure              | `controller.source-open-failed`    | FX2 temp copy with missing valid relative file | Valid source target that cannot be opened returns structured failure and does not navigate outside workspace.                       |
| Multi-match glob auto-open       | none; state assertion              | FX2 temp copy with two matching files          | UI shows picker; no file opens until the user chooses one.                                                                          |
| Bind mode keyboard exit          | none                               | FX5                                            | `Bind element` mode is entered by explicit button, Escape/Cancel exits, and normal SVG clicks outside bind mode do not create refs. |

## Live verification steps

1. Open FX5 diagram in a temp workspace.
2. Click `Bind element`, select one bindable SVG element, choose a C4 node target, choose role, and save.
3. Click the element and record navigation to topology with the target selected.
4. Add a second valid target to the same SVG element, click the element again, record the target picker, choose one row, and record navigation to that chosen target.

## Mock policy

- Mocks used: UI tests may mock source opening only after a real path containment test exists.
- Why the mock is allowed: source opening is an existing integration and not the primary SVG binding proof.
- Non-mocked test proving completion: SVG render, element bind, `.scry` save, reload, delegated click navigation, and source target containment.

## Drift and PR evidence

- Drift check required: confirm no `svgSelector` is written to `.scry`.
- PR evidence fields to fill: bound element screenshot, `.scry` ref excerpt, navigation screenshot.
- Traceability rows to mark complete only after tests and live evidence pass: R9, R10.

## Blockers

- None. LOCAL-F1B, LOCAL-S2, LOCAL-S3, and LOCAL-S7A are complete.

## Completion evidence

- 2026-05-27 targeted Vitest: `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/DiagramReviewView.element-navigation.test.tsx src/main/ipc/diagram-source-targets.test.ts src/main/ipc/architecture.test.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/diagram-ref-controller.test.ts src/main/scryer/diagram-controller-model-store.test.ts` -> 8 files / 51 tests passed.
- 2026-05-27 extra Bind element exit test: `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/DiagramReviewView.element-navigation.test.tsx` -> 1 file / 5 tests passed.
- 2026-05-27 typecheck: `corepack pnpm run tc` -> passed.
- 2026-05-27 lint: `corepack pnpm run lint` -> passed.
- 2026-05-27 format check for S4 files: `corepack pnpm exec oxfmt --check ...` -> passed.
- 2026-05-27 whitespace drift check: `git diff --check` -> passed.
- 2026-05-27 E2E: `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` -> 6 passed.

## Live verification evidence

- E2E fixture path used a temp repo and real `.scry` model writes.
- The new E2E bound `flowchart:node:api`, saved a `diagramRefs[]` entry with `elementKey`, verified the saved `.scry` did not contain `svgSelector`, reloaded the model, clicked the rendered SVG element, showed `DiagramElementTargetPicker` for multiple targets, and navigated to the chosen node target.
