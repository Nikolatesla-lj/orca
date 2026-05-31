# LOCAL-S3 - Attach diagram refs from C4, flow, and source

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S3.md`
- Current status: complete
- Coding gate: completed after LOCAL-F1A, LOCAL-S1A, LOCAL-S1B, LOCAL-F1B, LOCAL-S1, and LOCAL-S2 were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R9, R10.
- [x] Business rules: BR2, BR3, BR4, BR6, BR16.
- [x] Contract sections: DiagramRef creation workflow, deletion policy, sourceMap vs source refs, pure source target pattern validation.
- [x] Required exact names: `createDiagramRef`, `upsertDiagramRefs`, `deleteDiagramRefs`, `validateDiagramRefs`, `validateWorkspaceRelativeSourcePattern`.
- [x] Fixture IDs: FX2, FX3, FX4.
- [x] Existing files: `ArchitectureContextPanel.tsx`, `FlowScriptView.tsx`, `parse-model.ts`, `mcp-tools.ts`.
- [x] Real data path: target panel action -> controller -> `.scry` `diagramRefs` -> reload -> target and reverse lists.

## Requirement trace

- Requirement IDs: R9, R10.
- Business rule IDs: BR2, BR3, BR4, BR6, BR16.
- Traceability rows: R10.
- Live evidence IDs: L6.

## Contract rows to implement

- System contract sections: DiagramRef contract, DiagramRef creation workflow, DiagramRef deletion policy, sourceMap vs source refs, source target safety rules.
- Frontend state rows: target-side reference panels and reverse reference list.
- Backend/API rows: controller ref functions, parser validation, and pure source target pattern validation helper. S3 must not open files, expand globs, stat paths, or call project authorization.
- Database/data rows: `.scry` top-level `diagramRefs`.
- Error codes: `parser.missing-diagram`, `parser.missing-target`, `parser.missing-flow-step`, `parser.invalid-source-range`, `parser.invalid-source-target`, `controller.missing-role`, `controller.other-note-required`, `controller.missing-target`, `controller.invalid-source-target`.
- Fixture IDs: FX2, FX3, FX4.

## Required exact implementation names

- Functions: `createDiagramRef`, `upsertDiagramRefs`, `deleteDiagramRefs`, `validateDiagramRefs`, `validateWorkspaceRelativeSourcePattern`.
- Components/props: target-side reference controls in `ArchitectureContextPanel` and `FlowScriptView`.
- MCP handlers: none in S3.
- IPC channels/types: existing model save only.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `ArchitectureContextPanel.tsx`, `FlowScriptView.tsx`, `ArchitecturePanel.tsx`.
- Backend/API files: `parse-model.ts`, `mcp-tools.ts`, existing controller/model save path, and shared `source-targets.ts` helper if added.
- Database/data files: FX2, FX3, FX4 temp `.scry` copies.
- Existing tests: parser ref validation and flow step tests if present.

## Real data path

- User action or MCP call: user opens target panel and adds/removes a ref to an existing diagram.
- Frontend state transition: selected target panel updates ref list and reverse diagram ref list.
- Backend/API call: controller validates refs and saves through existing model path.
- Persistence/cache path: `.scryer/model.scry` `diagramRefs`; no cache.
- Reload/read-back proof: reload temp project and verify both target-side and diagram-side ref lists.

## What to build

Add target-side reference management for existing diagrams from node, edge, group, flow, nested flow step, and source file.

## Scope

- Frontend: existing diagram picker, role selection, target-side add/remove, reverse list.
- Backend/API: ref validation and deletion cleanup.
- Database/data: `.scry` `diagramRefs`.
- Business rules: S3 links existing diagrams only; inline create belongs to LOCAL-S3A.

## Acceptance Criteria

- [x] Add reference uses existing diagram picker; no inline diagram creation in S3.
- [x] Role is explicit; `other` requires note.
- [x] Whole-diagram refs omit `elementKey`.
- [x] Source refs accept only project-relative safe patterns from synchronous pure `validateWorkspaceRelativeSourcePattern(...)`; S3 validates but does not open files, expand globs, stat paths, or call project authorization.
- [x] For source refs, `DiagramRefTarget.source.line/endLine` means code-file line range; `DiagramRef.sourceRange` means Mermaid source range and must not be used as the code-file location.
- [x] Recursive `flowStep` lookup works through nested branches.
- [x] Delete node/edge/group/flow/step applies deletion policy.
- [x] Bad external refs show dangling warning without crashing.

## Required automated tests

| Test                     | Fixture | Real path or mock               | Exact assertions                                                                                                                     |
| ------------------------ | ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Create refs              | FX2     | Real `.scry` write/reload       | `.scry` contains expected refs after reload.                                                                                         |
| Bad refs                 | FX3     | Real `.scry` parse              | Warnings and preserved dangling refs.                                                                                                |
| Nested step refs         | FX4     | Real `.scry` parse/write        | Move step keeps ref; delete step removes child refs.                                                                                 |
| Role validation          | FX2     | Component/controller validation | Missing role and `other` without note fail.                                                                                          |
| Source target validation | FX3     | Shared helper test              | Parser path returns `parser.invalid-source-target`; controller path returns `controller.invalid-source-target`; neither opens files. |

## Required negative tests

| Failure                 | Expected code                      | Fixture     | Exact assertion                                                                                                          |
| ----------------------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Missing diagram         | `parser.missing-diagram`           | FX3         | Ref is preserved as dangling and warning is visible.                                                                     |
| Missing target          | `parser.missing-target`            | FX3         | Ref is preserved as dangling and does not crash UI.                                                                      |
| Invalid sourceRange     | `parser.invalid-source-range`      | FX3         | Invalid range is omitted from normalized model and warned.                                                               |
| Unsafe source target    | `parser.invalid-source-target`     | FX3 variant | Syntax-unsafe source pattern is preserved as warning, not opened, not glob-expanded, and not normalized to another path. |
| UI unsafe source target | `controller.invalid-source-target` | FX3 variant | Ref creation rejects absolute paths, `..`, URL schemes, and unsupported glob syntax before saving.                       |
| Ref picker keyboard     | none                               | FX2         | Keyboard opens picker, moves through existing diagrams, selects role, saves, and Cancel restores focus without writing.  |
| Missing role            | `controller.missing-role`          | FX2         | Save is rejected and `.scry` unchanged.                                                                                  |
| `other` without note    | `controller.other-note-required`   | FX2         | Save is rejected and message explains note requirement.                                                                  |

## Live verification steps

1. Copy FX2 into a temp workspace.
2. Add refs from one C4 node and one nested flow step.
3. Reload and record target-side and diagram-side reference lists.

Completed evidence:

- `tests/e2e/architecture-diagram-library.spec.ts` copies FX2, adds a ref from C4 node `worker`, adds a ref from nested flow step `step-nested-review`, reloads, and asserts both target-side and diagram-side reverse lists.
- `src/main/scryer/diagram-controller-model-store.test.ts` copies FX2/FX4 into temp projects and proves real `.scry` write/reload, top-level-only `diagramRefs`, nested step move persistence, and nested step deletion pruning.
- `src/renderer/src/components/architecture/diagram-controller.test.ts` proves controller role, `other` note, missing target, missing diagram, source target safety, upsert, and delete codes.
- `src/shared/scryer/parse-model.test.ts` proves dangling bad refs are preserved with parser warnings and recursive flow-step lookup works.

## Mock policy

- Mocks used: picker UI callbacks may be mocked in component tests.
- Why the mock is allowed: picker behavior can be isolated from persistence.
- Non-mocked test proving completion: real temp `.scry` ref add/remove/reload test.

## Drift and PR evidence

- Drift check required: verify refs are not added to `nodes` or `flows`, only top-level `diagramRefs`.
- PR evidence fields to fill: target panel screenshot, reverse list screenshot, before/after `.scry` ref excerpt.
- Traceability rows to mark complete only after tests and live evidence pass: R10.

## Blockers

- Element-level SVG creation is completed in LOCAL-S4. Inline "Create diagram then link" is LOCAL-S3A and must not be implemented in S3.
