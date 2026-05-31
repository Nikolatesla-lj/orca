# LOCAL-S6 - Deep Build and Sync maintain diagrams without bloat

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S6.md`
- Current status: complete
- Coding gate: open after LOCAL-S3 and LOCAL-S5 were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R11, R12.
- [x] Business rules: BR8, BR13.
- [x] Contract sections: prompt/rules contract, DriftReport contract, sourceMap vs source diagramRefs.
- [x] Required exact names: `serializeModelForPrompt`, `diagramRefTargetMatchesPromptScope`, `buildDiagramPromptInstructions`, `initialModelPrompt`, `nodeFillPrompt`, `deepModelPrompt`, `syncPrompt`, `TASK_INSTRUCTIONS`, `SCRYER_RULES`, `MCP_INSTRUCTIONS`, `DriftReportV2`, `get_diagram`.
- [x] Fixture IDs: FX2, FX9.
- [x] Existing/new files: `prompt-diagram-instructions.ts`, `prompts.ts`, `rules.ts`, `drift.ts`, `mcp-tools.ts`, `prompts.test.ts`.
- [x] Real data path: source file change -> drift -> prompt compact diagram context -> MCP `get_diagram` for full source when needed. External AI provider output is not required for completion evidence.

## Requirement trace

- Requirement IDs: R11, R12.
- Business rule IDs: BR8, BR13.
- Traceability rows: R11, R12.
- Live evidence IDs: L10.

## Contract rows to implement

- System contract sections: prompt/rules contract, DriftReport contract, sourceMap vs source diagramRefs.
- Frontend state rows: no new UI state beyond existing Deep Build/Sync triggers.
- Backend/API rows: prompt serialization, shared diagram prompt instructions, drift report, MCP `get_diagram` dependency, `TASK_INSTRUCTIONS` diagram-to-code guidance.
- Database/data rows: read `.scry` diagrams/refs; do not bulk-copy diagram source into prompt.
- Error codes: no new prompt/drift error codes in S6; MCP `get_diagram` failures use `mcp.diagram-not-found` or `mcp.validation-failed` from the error-code matrix.
- Fixture IDs: FX2, FX9.

## Required exact implementation names

- Functions: `serializeModelForPrompt`, `diagramRefTargetMatchesPromptScope`, `buildDiagramPromptInstructions`, `initialModelPrompt`, `nodeFillPrompt`, `deepModelPrompt`, `syncPrompt`, `DriftReportV2`.
- Components/props: none.
- MCP handlers: `get_diagram` must be available from LOCAL-S5.
- IPC channels/types: existing Deep Build/Sync paths.
- CLI bridge names: `get_diagram`.

## Existing code to inspect before coding

- Frontend files: existing Deep Build/Sync trigger components if touched.
- Backend/API files: `prompt-diagram-instructions.ts`, `prompts.ts`, `rules.ts`, `drift.ts`, `mcp-tools.ts`.
- Database/data files: FX2 and FX9 `.scry` fixtures.
- Existing tests: prompt serialization and drift tests if present.

## Real data path

- User action or MCP call: user runs Deep Build, Sync, or a Codex/Claude implementation task on a real model with linked diagrams.
- Frontend state transition: existing action starts prompt/drift generation.
- Backend/API call: prompt serializer emits compact diagram context; Deep Build/Sync/task prompts use shared diagram instructions; agent calls `get_diagram` for full source before editing omitted diagrams.
- Persistence/cache path: reads `.scry`; does not write cache.
- Reload/read-back proof: drift/prompt output cites diagram ids and source hashes, not full sources by default.

## What to build

Make the existing Orca-Scryer prompt files maintain diagrams only when they add real design detail, without putting full diagram source into every prompt. This includes code-to-diagram in Deep Build/Sync and diagram-to-code context in the `get_task` implementation prompt.

## Scope

- Frontend: no new UI beyond existing Deep Build/Sync entry points.
- Backend/API: prompt serialization, shared prompt instruction builder, rules, drift report, implementation task instructions.
- Database/data: read `.scry` diagrams and source refs.
- Business rules: avoid duplicate or excessive diagrams; diagrams never replace contracts/tests.

## Acceptance Criteria

- [x] Default prompt omits full diagram sources and includes `sourceOmitted` plus `sourceHash`.
- [x] Agent must call `get_diagram` before editing omitted source.
- [x] Sync reports source-linked diagram refs separately from node drift.
- [x] Deep Build prompt/rules instruct agents to create diagrams only for complex behavior/data/state/deployment detail or explicit user request.
- [x] Existing diagram is updated before creating duplicates.
- [x] `initialModelPrompt` says initial system/container modeling normally skips diagram creation unless the user explicitly requests diagrams.
- [x] `nodeFillPrompt` allows at most one proactive supplemental diagram for the scoped node and requires `update_diagram_refs` when one is created.
- [x] `deepModelPrompt` contains a named Diagram recovery phase using `set_diagrams`, `get_diagram`, and `update_diagram_refs`.
- [x] `syncPrompt` contains a "Potentially drifted diagrams" section when `DriftReportV2.diagramRefs` has entries.
- [x] `TASK_INSTRUCTIONS` tells implementation agents how to use linked diagrams as code implementation context, and says unlinked diagrams are not enough to change code without first resolving a C4/flow/source target.
- [x] `SCRYER_RULES` and `MCP_INSTRUCTIONS` keep C4/flow trees clean and describe diagrams as top-level `diagrams` linked by `diagramRefs`.
- [x] `buildDiagramPromptInstructions(...)` is exported only from `prompt-diagram-instructions.ts`; `prompts.ts` and `rules.ts` import it and do not duplicate diagram prompt text.
- [x] `includeDiagramSourcesForTargets` uses `diagramRefTargetMatchesPromptScope(...)`: exact ids for C4/flow targets, exact `flowId`/`stepId` for flow steps, normalized source pattern equality for source targets, and ignored source `line/endLine`.

## Required automated tests

| Test                         | Fixture | Real path or mock                                                                                                               | Exact assertions                                                                                                                                                                                                                                      |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt compactness           | FX9     | Real fixture prompt serialization                                                                                               | No full sources by default; sourceHash present.                                                                                                                                                                                                       |
| Drift diagram refs           | FX2/FX9 | Real temp source files plus fixture `.scry`                                                                                     | `diagramRefs` section separate from node drift.                                                                                                                                                                                                       |
| Prompt rules                 | FX9     | Real fixture prompt serialization                                                                                               | `initialModelPrompt`, `nodeFillPrompt`, `deepModelPrompt`, `syncPrompt`, `TASK_INSTRUCTIONS`, `SCRYER_RULES`, and `MCP_INSTRUCTIONS` contain the correct shared diagram instruction block for their context.                                          |
| Diagram-to-code prompt       | FX9     | Real `get_task` prompt assembly through the existing MCP task path; direct `TASK_INSTRUCTIONS` assertions are supplemental only | Linked diagrams are implementation context; omitted sources require `get_diagram`; unlinked diagrams do not authorize code changes alone.                                                                                                             |
| Scoped full-source inclusion | FX9     | Real fixture prompt serialization                                                                                               | `serializeModelForPrompt(..., { includeDiagramSourcesForDiagramIds })` includes only requested diagram sources.                                                                                                                                       |
| Scoped target matching       | FX9     | Real fixture prompt serialization                                                                                               | `serializeModelForPrompt(..., { includeDiagramSourcesForTargets })` includes source only for targets matched by `diagramRefTargetMatchesPromptScope(...)`, including exact `flowStep` ids and normalized source patterns with ignored `line/endLine`. |

## Required negative tests

| Failure                          | Expected code         | Fixture | Exact assertion                                                                                     |
| -------------------------------- | --------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Many diagrams in model           | none; size assertion  | FX9     | Prompt omits full source and includes `sourceOmitted` plus `sourceHash`.                            |
| Duplicate design intent          | none; rule assertion  | FX9     | Prompt tells agent to update existing diagram before creating a new one.                            |
| Source-linked drift              | none; drift assertion | FX2/FX9 | Drift report uses a separate `diagramRefs` section, not node warnings.                              |
| Unlinked diagram-to-code request | none; rule assertion  | FX9     | Task prompt says to resolve or create a `diagramRef` before changing code from an unlinked diagram. |

## Live verification steps

1. Edit a source-linked file in a temp project.
2. Run sync prompt generation, Deep Build prompt serialization, and real `get_task` prompt assembly without calling an external AI provider.
3. Record prompt sections for affected diagrams, omitted sources, `get_diagram` instruction, Diagram recovery, diagram-to-code guidance, and over-generation limits.
4. Optional smoke evidence may run a real provider, but it cannot replace the deterministic prompt/drift tests.

## Mock policy

- Mocks used: source file change detection may be simulated with real temp files.
- Why the mock is allowed: external AI provider calls are not required for prompt serialization proof.
- Non-mocked test proving completion: prompt/drift tests read real fixture `.scry` plus real temp source files, and diagram-to-code evidence comes from the assembled `get_task` prompt rather than a standalone constant-only assertion.

## Drift and PR evidence

- Drift check required: verify prompt language matches terminology and does not instruct agents to over-generate diagrams.
- PR evidence fields to fill: compact prompt excerpt, drift report excerpt, fixture ids.
- Traceability rows to mark complete only after tests and live evidence pass: R11, R12.

## Completion evidence

- Added shared `buildDiagramPromptInstructions(...)` in `prompt-diagram-instructions.ts`.
- Added compact prompt diagram serialization and `diagramRefTargetMatchesPromptScope(...)` in `prompt-model-serialization.ts`, re-exported through `prompts.ts`.
- Added `DriftReportV2.diagramRefs` and source-linked diagram drift detection.
- Updated Deep Build, initial model, node fill, sync, advisor, MCP rules, and task implementation instructions to use shared diagram guidance.
- Updated real `get_task` assembly to include linked diagram context and `get_diagram` guidance.

## Verification evidence

- `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/prompts.test.ts src/main/scryer/drift.test.ts src/main/scryer/sync.test.ts src/main/scryer/mcp-tools.test.ts src/cli/scryer-mcp-server.test.ts`: 5 files / 41 tests passed.
- `corepack pnpm run tc`: passed.
- `corepack pnpm run lint`: passed.
- `corepack pnpm run build:cli`: passed; only the optional `/usr/local/bin/orca-dev` symlink permission message was printed.
- Live-style deterministic prompt evidence on `/tmp/orca-s6-live-RDdmOy`:
  - `beginSync` reported `ref-source -> diagram-sequence` under `drift.diagramRefs`.
  - sync prompt contained `Potentially drifted diagrams`.
  - sync prompt contained `Call get_diagram before editing omitted diagram source`.
  - FX9 compact prompt contained 21 diagrams, included `sourceHash`, set `sourceOmitted:true`, and did not contain full source text `Token Service`.

## Blockers

- None. LOCAL-S3 and LOCAL-S5 are complete.
