# LOCAL-S5 - MCP and CLI bridge end-to-end

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S5.md`
- Current status: complete
- Coding gate: open after LOCAL-F1A and LOCAL-S7A were confirmed complete; `delete_diagram` can use real cache cleanup.

## Context Checklist

- [x] Requirement IDs: R11, R12.
- [x] Business rules: BR7, BR8, BR11.
- [x] Contract sections: MCP tools, CLI bridge, MCP failure shape, existing MCP tool diagram context.
- [x] Required exact names: `handleSetDiagrams`, `handleGetDiagram`, `handleDeleteDiagram`, `handleUpdateDiagramRefs`, `ScryerDiagramToolReadContext`, `ScryerDiagramToolWriteContext`, `ScryerDiagramToolDeleteContext`, `detectMermaidDiagramKind`, `CompactDiagramSummary`, `ExistingToolDiagramContext`.
- [x] CLI bridge names: `set_diagrams`, `get_diagram`, `delete_diagram`, `update_diagram_refs`.
- [x] Fixture IDs: FX2, FX3.
- [x] Existing files: `model-types.ts`, `mcp-tools.ts`, `src/cli/scryer-mcp-server.ts`.
- [x] Real data path: external MCP CLI -> tool handler -> `writeModel` -> `.scry` -> Orca reload.

## Requirement trace

- Requirement IDs: R11, R12.
- Business rule IDs: BR7, BR8, BR11.
- Traceability rows: R11, R12.
- Live evidence IDs: L8.

## Contract rows to implement

- System contract sections: MCP tools, CLI bridge, MCP failure shape, delete diagram cleanup rule, existing MCP tool diagram context.
- Frontend state rows: watcher reload after external write.
- Backend/API rows: split MCP tool contexts, tool handlers, CLI allowlist/tool schemas.
- Database/data rows: `.scry` persistent writes; cache cleanup through S7A.
- Error codes: MCP validation codes from error-code matrix, `renderer.kind-conflict` inside `mcp.validation-failed` details, `cache.*` warnings after S7A.
- Fixture IDs: FX2, FX3.

## Required exact implementation names

- Functions: `handleSetDiagrams`, `handleGetDiagram`, `handleDeleteDiagram`, `handleUpdateDiagramRefs`, `detectMermaidDiagramKind`; compact context builders returning `CompactDiagramSummary` and `ExistingToolDiagramContext`.
- Components/props: none.
- MCP handlers: `handleSetDiagrams`, `handleGetDiagram`, `handleDeleteDiagram`, `handleUpdateDiagramRefs`.
- IPC channels/types: existing MCP/model write paths.
- CLI bridge names: `set_diagrams`, `get_diagram`, `delete_diagram`, `update_diagram_refs`.

## Existing code to inspect before coding

- Frontend files: architecture reload/watcher integration.
- Backend/API files: `src/main/scryer/mcp-tools.ts`, `src/cli/scryer-mcp-server.ts`, `src/shared/scryer/model-types.ts`.
- Database/data files: FX2, FX3 temp `.scry` copies.
- Existing tests: MCP tool tests and CLI server tests if present.

## Real data path

- User action or MCP call: external MCP CLI calls `tools/list` and diagram write/read tools.
- Frontend state transition: Orca watcher reloads changed model and highlights affected diagram.
- Backend/API call: handler validates args, mutates normalized model, calls `context.writeModel`.
- Persistence/cache path: `.scryer/model.scry`; delete cleanup calls S7A `context.clearDiagramCache`.
- Reload/read-back proof: Orca UI reload shows MCP-written diagram/ref.

## What to build

Expose diagram tools to external Codex/Claude through the MCP CLI bridge with exact schemas and persistent `.scry` writes.

## Scope

- Frontend: reload/highlight after external write only.
- Backend/API: MCP handlers, schemas, CLI bridge allowlist.
- Database/data: `.scry` writes and S7A cache cleanup on delete.
- Business rules: no handler success without real `writeModel`; no no-op cache cleanup.

## Acceptance Criteria

- [x] Tool list exposes all diagram tools with `additionalProperties: false`.
- [x] Write tools call `context.writeModel`.
- [x] Validation failures return `{ ok:false, content, data:{ code, details? } }`.
- [x] `set_diagrams` rejects payload kind/source directive conflicts using shared `detectMermaidDiagramKind`, returns `mcp.validation-failed` and `details.validationCodes: ['renderer.kind-conflict']`, and does not partially write.
- [x] `update_diagram_refs` rejects unsafe source targets with `mcp.validation-failed` and `details.validationCodes` containing `parser.invalid-source-target`.
- [x] `update_diagram_refs mode:'delete'` only accepts `ref_ids`; missing `ref_ids` returns `mcp.mode-argument-missing`, and `data` in delete mode returns `mcp.validation-failed`.
- [x] MCP-created diagrams and refs require explicit ids.
- [x] Existing `get_model`, `get_node`, `get_changes`, and `validate_model` outputs include the exact diagram context/additive fields from the system contract and omit full `diagram.source` by default.
- [x] UI reloads after external MCP write.
- [x] `get_diagram` receives read context only; it must not require `writeModel` or `clearDiagramCache`.
- [x] `set_diagrams` and `update_diagram_refs` receive write context; `delete_diagram` alone receives delete context with real `context.clearDiagramCache` after LOCAL-S7A; no no-op cleanup is allowed.
- [x] The MCP dispatcher/CLI bridge consumes optional `model`, loads the selected model, and passes `context.modelName`; handlers do not parse `model` from args.
- [x] S5 owns MCP `delete_diagram` cleanup behavior. Later S7B may rerun this as a regression test, but must not change MCP tool schemas, handler signatures, or CLI bridge schema.

## Required automated tests

| Test                          | Fixture                 | Real path or mock                | Exact assertions                                                                                                               |
| ----------------------------- | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tool schemas                  | none                    | External CLI bridge              | CLI `tools/list` exposes names, descriptions, schemas.                                                                         |
| Set diagrams                  | FX2                     | Real `.scry` write/reload        | Upsert and replaceAll persist and update refs.                                                                                 |
| MCP context split             | FX2                     | Handler unit plus real tool path | `get_diagram` works with read context only; write tools require `writeModel`; delete requires `clearDiagramCache`.             |
| Get/delete diagram            | FX2                     | Real handler plus temp `.scry`   | Data shape and delete refs behavior.                                                                                           |
| Ref modes                     | FX2/FX3                 | Real handler plus temp `.scry`   | upsert, replaceForDiagram, delete, validation codes.                                                                           |
| Model dispatcher              | FX2 two-model temp copy | Real MCP dispatcher/CLI path     | Optional `model` selects the correct `.scry`; handler args do not contain `model`, and `context.modelName` is used for writes. |
| Existing tool diagram context | FX2                     | Real MCP tool path               | `get_model`, `get_node`, `get_changes`, and `validate_model` include compact diagram fields and omit full source by default.   |

## Required negative tests

| Failure                            | Expected code                                                      | Fixture         | Exact assertion                                                         |
| ---------------------------------- | ------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------- |
| Missing id from MCP diagram        | validation code from MCP contract                                  | FX2             | Handler rejects and does not call `writeModel`.                         |
| Duplicate id                       | validation code from MCP contract                                  | FX2             | Handler rejects duplicate and leaves `.scry` unchanged.                 |
| Kind/source conflict               | `mcp.validation-failed` with `renderer.kind-conflict` detail       | FX2             | Handler rejects and does not call `writeModel`.                         |
| Bad ref target                     | `mcp.target-not-found`                                             | FX3             | Failure includes `data.code` and details.                               |
| Unsafe source target               | `mcp.validation-failed` with `parser.invalid-source-target` detail | FX3             | Handler rejects and does not call `writeModel`.                         |
| Delete refs without `ref_ids`      | `mcp.mode-argument-missing`                                        | FX3             | Delete mode rejects and leaves `.scry` unchanged.                       |
| Delete refs with `data`            | `mcp.validation-failed`                                            | FX3             | Delete mode rejects ids embedded in `data`; only `ref_ids` is accepted. |
| Cache cleanup failure after delete | `cache.*` warning                                                  | FX2 + S7A cache | Diagram delete persists; success data includes warning.                 |

## Live verification steps

1. Copy FX2 into a temp workspace.
2. Run external MCP CLI `tools/list`.
3. Call one write tool through CLI.
4. Record `.scry` before/after and Orca UI reload.

## Mock policy

- Mocks used: handler unit tests may mock `writeModel` only to assert it is called or not called.
- Why the mock is allowed: unit tests isolate validation behavior.
- Non-mocked test proving completion: external CLI `tools/list` or real tool call against a temp `.scry` file.

## Drift and PR evidence

- Drift check required: verify `mcp-tools.ts` and `src/cli/scryer-mcp-server.ts` expose the same tool list and schemas.
- PR evidence fields to fill: CLI command output, before/after `.scry`, UI reload screenshot.
- Traceability rows to mark complete only after tests and live evidence pass: R11, R12.

## Completion evidence

- Implemented `set_diagrams`, `get_diagram`, `delete_diagram`, and `update_diagram_refs` in the MCP tool surface and external CLI `tools/list`/`tools/call` bridge.
- Added split diagram tool contexts so `get_diagram` runs with read context, write tools require `writeModel`, and `delete_diagram` uses the real S7A cache cleanup helper.
- Added compact diagram context to existing MCP tools: `get_model`, `get_node`, `validate_model`, and `get_changes`; full diagram source is omitted by default and can be fetched through `get_diagram`.
- Added validation coverage for explicit ids, duplicate ids, Mermaid kind/source conflicts, unsafe source targets, missing targets, delete mode arguments, dispatcher-selected `model`, and cache cleanup warnings.

## Verification evidence

- `corepack pnpm exec vitest run --config config/vitest.config.ts src/main/scryer/mcp-tools.test.ts src/cli/scryer-mcp-server.test.ts`
- `corepack pnpm run build:cli`
- `node out/cli/index.js scryer-mcp --project /tmp/orca-s5-live-qPiQq0` with JSON-RPC line input for `tools/list` and `tools/call set_diagrams`
  - exit status: `0`
  - `tools/list`: 26 tools returned; `set_diagrams`, `get_diagram`, `delete_diagram`, and `update_diagram_refs` all had `additionalProperties: false`
  - `tools/call set_diagrams`: `isError:false`, text `Set 1 diagram(s)`
  - real `.scry` before sha: `ef5f134e4c99176ce3816b6a9c7a7c2d4671e42bc8d67297d0459e89df71b50c`
  - real `.scry` after sha: `e5c7443efa602f2a1be4c7f4948ca0e3ab0c11d4059bed910d4aec86916bca0a`
  - read-back proof: `/tmp/orca-s5-live-qPiQq0/.scryer/model.scry` contains `diagram-live-cli` and `Live CLI`
- UI reload regression evidence: `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` covers real `.scry` reload, external disk changes, diagram source conflicts, ref reloads, and element binding reload.
- Static checks: `corepack pnpm run tc`, `corepack pnpm run lint`, `corepack pnpm exec oxfmt --check ...`, and `git diff --check`.

## Blockers

- None. LOCAL-F1A and LOCAL-S7A are complete.
