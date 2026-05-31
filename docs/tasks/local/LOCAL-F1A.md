# LOCAL-F1A - Schema and parser foundation

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-F1A.md`
- Current status: complete
- Coding gate: completed from this local task doc while GitHub Issues are disabled.

## Context Checklist

- [x] PRD/local fallback: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- [x] Contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- [x] Implementation contracts: parser/helper, id generation, updatedAt rules, shared Mermaid kind detection.
- [x] Architecture: schema/parser baseline.
- [x] Fixture IDs: FX1, FX3, FX4.
- [x] Error codes: `parser.*`.
- [x] Traceability rows: R1, R2, R14.
- [x] Existing code paths: `src/shared/scryer/model-types.ts`, `src/shared/scryer/parse-model.ts`, `src/main/scryer/model-store-core.ts`.
- [x] Real data path: read fixture `.scry` -> `parseModelData` -> normalized model -> write through model-store when explicit save occurs.
- [x] Mock usage: none for completion evidence.

## Requirement trace

- Requirement IDs: R1, R2, R14.
- Business rule IDs: BR1, BR2, BR3, BR7, BR11.
- Traceability rows: R1, R2, R14.
- Live evidence IDs: L1, L2.

## Contract rows to implement

- System contract sections: `.scry data contract`, `Migration and validation rules`, `DiagramRef deletion policy`, `Diagram id, ref id, and library ordering rules`, Mermaid directive detection rules.
- Frontend state rows: not applicable except shared sort/id helpers.
- Backend/API rows: parser/helper implementation contracts.
- Database/data rows: `.scry` v1 read, v2 explicit save, no render output in `.scry`.
- Error codes: `parser.invalid-diagram`, `parser.duplicate-diagram-id`, `parser.duplicate-ref-id`, `parser.missing-diagram`, `parser.missing-target`, `parser.missing-flow-step`, `parser.invalid-source-target`, `parser.invalid-updated-at`, `renderer.unsupported-kind` as a warning from shared kind detection.
- Fixture IDs: FX1, FX3, FX4.

## Required exact implementation names

- Functions: `normalizeDiagrams`, `normalizeDiagramRefs`, `validateDiagramRefs`, `pruneDiagramRefsForDeletedTarget`, `createDiagramId`, `createDiagramRefId`, `getMermaidSourceDirective`, `detectMermaidDiagramKind`.
- Types: `SCRY_SCHEMA_VERSION`, `Diagram`, `DiagramRef`, `C4ModelDataV2`.

## Existing code to inspect before coding

- Frontend files: no UI files in this slice.
- Backend/API files: `src/shared/scryer/model-types.ts`, `src/shared/scryer/parse-model.ts`, `src/shared/scryer/diagram-kind.ts`, `src/main/scryer/model-store-core.ts`.
- Database/data files: `.scryer/model.scry` fixtures FX1, FX3, FX4.
- Existing tests: parser/model-store tests near current Scryer model parsing.

## Real data path

- User action or MCP call: open existing `.scry`, then explicit save through existing model-store path.
- Frontend state transition: none required.
- Backend/API call: `parseModelData` normalizes v2 fields; model-store writes only on explicit save.
- Persistence/cache path: `.scryer/model.scry`; no Derived cache.
- Reload/read-back proof: reload temp copy and assert v2 fields plus preserved existing fields.

## What to build

Add schema v2 fields and shared Mermaid kind detection to the existing `.scry` model without deleting current C4, flow, group, sourceMap, refPositions, or validation fields.

## Scope

- Frontend: shared pure helpers only; no UI.
- Backend/API: parser, type, and model-store normalization.
- Database/data: `.scry` only; no cache.
- Business rules: preserve old fields, add v2 fields, never persist render output.

## Acceptance Criteria

- [x] Old v1 `.scry` reads as `schemaVersion: 2`, `diagrams: []`, `diagramRefs: []` in memory.
- [x] Read-only open does not rewrite the fixture file.
- [x] Explicit save writes v2 fields.
- [x] Invalid refs are preserved with parser warnings.
- [x] `updatedAt` invalid values are handled by parser warning, not silent crash.
- [x] Undo/redo fingerprint includes diagrams and diagramRefs.
- [x] Shared `detectMermaidDiagramKind` maps Mermaid directives from the system contract and skips comments/init/frontmatter before detection.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Parser migration | FX1 | Real temp `.scry` read | Normalized v2 in memory; fixture bytes unchanged on read. |
| Bad refs | FX3 | Real temp `.scry` read | `parser.*` warnings include diagram/ref/target details. |
| Nested steps | FX4 | Real temp `.scry` read | Recursive flow step lookup and cleanup rules hold. |
| ID helpers | inline plus FX2 ids | Pure unit test | Slug fallback, allowed chars, collision retry, max length. |
| Mermaid kind detection | FX5/FX6/FX12/FX13/FX14 plus inline directives | Pure shared test | Directive mapping, skipped comments/init/frontmatter, and unknown directive warning. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Duplicate diagram id | `parser.duplicate-diagram-id` | FX3 | First valid diagram kept; duplicate warning includes id. |
| Duplicate diagramRef id | `parser.duplicate-ref-id` | FX3 | First valid ref kept; duplicate warning includes id. |
| Invalid updatedAt | `parser.invalid-updated-at` | FX3 | Invalid value is dropped in memory and warning includes diagram id. |
| Dangling diagram | `parser.missing-diagram` | FX3 | Ref remains dangling; parser does not rewrite diagram id. |
| Dangling target | `parser.missing-target` or `parser.missing-flow-step` | FX3 | Ref remains dangling; parser does not rewrite target. |
| Unsafe source target | `parser.invalid-source-target` | FX3 variant | Absolute paths, `..`, URL schemes, and unsupported glob syntax are preserved as warnings and never opened, glob-expanded, or statted. |

## Live verification steps

1. Copy FX1 into a temp Orca workspace.
2. Open Architecture tab.
3. Record empty Diagram library and unchanged `.scry` before save.
4. Trigger explicit save and record v2 fields after save.

## Mock policy

- Mocks used: none for completion evidence.
- Why the mock is allowed: not applicable.
- Non-mocked test proving completion: parser/model-store tests read and write real temp `.scry` fixture files.

## Drift and PR evidence

- Drift check required: compare implementation names against implementation contracts and traceability rows R1, R2, R14.
- PR evidence fields to fill: local task doc, fixtures used, parser warnings, before/after `.scry` excerpts.
- Traceability rows to mark complete only after tests and live evidence pass: R1, R2, R14.

## Blockers

- None.

## Completion evidence

- Automated checks: `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts src/shared/scryer/diagram-kind.test.ts src/shared/scryer/diagram-ids.test.ts src/main/scryer/model-store.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts` passed with 40 tests.
- Real `.scry` path evidence: model-store test copies FX1 to a temp project, reads without rewriting, explicitly saves, and reads back `schemaVersion: 2`, `diagrams: []`, and `diagramRefs: []`.
- Type/lint checks recorded in implementation evidence: `tc:node`, `tc:web`, targeted `oxlint`, and `git diff --check`.
- Live evidence: UI live evidence L1/L2 remains deferred because F1A has no user-visible UI; R1/R2/R14 traceability rows remain incomplete until later UI/live slices record screenshots and before/after excerpts.
