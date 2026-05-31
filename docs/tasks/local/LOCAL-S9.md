# LOCAL-S9 - Full verification and traceability

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S9.md`
- Current status: complete
- Coding gate: closed. LOCAL-F1A, LOCAL-F1B, LOCAL-S1A, LOCAL-S1B, LOCAL-S2 through LOCAL-S8, LOCAL-S3A, LOCAL-S7A, and LOCAL-S7B are complete.

## Context Checklist

- [x] Requirement IDs: R1-R16.
- [x] Business rules: BR1-BR16.
- [x] Contract sections: all Scryer Diagram Library contracts.
- [x] Fixture IDs: FX1-FX17.
- [x] Traceability rows: all rows in traceability matrix.
- [x] Existing files: all changed files from prior slices.
- [x] Real data path: real UI and real MCP paths for every touched feature.

## Requirement trace

- Requirement IDs: R1-R16.
- Business rule IDs: BR1-BR16.
- Traceability rows: all rows in traceability matrix.
- Live evidence IDs: L1-L11.

## Contract rows to implement

- System contract sections: all Scryer Diagram Library contracts.
- Frontend state rows: final Architecture UI state and user flows.
- Backend/API rows: final IPC, MCP, CLI bridge, prompt, drift, cache.
- Database/data rows: `.scry`, `.scryer/cache/diagrams`, standalone round trip.
- Error codes: full error-code matrix.
- Fixture IDs: FX1-FX17.

## Required exact implementation names

- Functions: all names required by implementation contracts.
- Components/props: `DiagramReviewView`, `DiagramReviewViewBaseProps`, `DiagramReviewViewRefActions`, `DiagramReviewViewExportActions`, Architecture tree/panel changes.
- MCP handlers: all diagram tool handlers.
- IPC channels/types: all diagram cache IPC/preload types.
- CLI bridge names: all diagram MCP tool names.

## Existing code to inspect before coding

- Frontend files: all changed Architecture and standalone UI/storage files.
- Backend/API files: all changed model-store, MCP, CLI, IPC, prompt, drift, and cache files.
- Database/data files: FX1-FX17, real temp `.scry`, real temp cache path.
- Existing tests: all tests added or changed by F1A-S8 plus S3A, S7A, and S7B.

## Real data path

- User action or MCP call: every real user/MCP path from verification doc.
- Frontend state transition: model, flow, diagram, ref, render, export, and reload states.
- Backend/API call: model write, MCP, CLI bridge, cache IPC, prompt/drift.
- Persistence/cache path: `.scry`, `.scryer/cache/diagrams`, standalone round trip.
- Reload/read-back proof: final full verification evidence L1-L11.

## What to build

Run final verification, drift check, traceability update, and PR evidence collection for the complete Scryer Diagram Library feature, including the S3A create-diagram-then-link user flow and S7A/S7B cache split.

## Scope

- Frontend: final user-flow verification.
- Backend/API: final MCP/IPC/prompt/drift verification.
- Database/data: `.scry`, cache, standalone round trip.
- Business rules: no requirement marked complete without real-path test and live evidence.

## Acceptance Criteria

- [x] Every requirement R1-R16 has code, tests, and live evidence or an explicit risk.
- [x] Full comprehensive suite passes or failures are triaged to unrelated causes.
- [x] Live evidence L1-L11 is recorded.
- [x] Mock usage is paired with real-path evidence.
- [x] Contract docs, task docs, tests, and implementation match after drift check.
- [x] Git tracking confirms PRD, contract, architecture, task, local task, and testing docs are not ignored.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| Full changed test suite | FX1-FX17 | Real changed suite | All changed contracts covered. |
| Performance threshold | FX11 | Real render queue/UI performance path | 200-node render and 20-thumbnail batch meet verification threshold or record a blocker. |
| E2E/live spec | FX2/FX5/FX7/FX8 | Real Orca UI/MCP/cache paths | Create, render, invalid, refs, MCP, cache, export. |
| Standalone round trip | FX10 | Real app/storage round trip | Data compatibility preserved. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Invalid Mermaid | `renderer.invalid-source` | FX7 | Diagnostic visible; invalid source persists only after explicit Save. |
| Bad refs | `parser.missing-diagram`, `parser.missing-target`, or `parser.missing-flow-step` | FX3 | Dangling warning visible and app does not crash. |
| Malicious cache request | `cache.invalid-diagram-id`, `cache.path-outside-cache`, or `cache.unauthorized-project` | FX8 | Request rejected and no outside file touched. |
| MCP invalid payload | MCP validation code | FX3 | Failure has `data.code`; `.scry` unchanged. |

## Live verification steps

1. Execute all relevant live paths from verification doc.
2. Record screenshots/logs/files for L1-L11.
3. Run final drift check against PRD, contracts, tasks, tests, and code.

## Completion evidence

- Task-local repair: `src/renderer/src/store/slices/worktrees.test.ts` now includes the Architecture tab state that `createWorktreeSlice` reads when restoring a worktree. Focused rerun: `corepack pnpm vitest run --config config/vitest.config.ts src/renderer/src/store/slices/worktrees.test.ts` -> 1 file, 66 tests passed.
- PR-closeout repairs: `src/main/git/upstream.test.ts` now expects the normalized non-repo Git error surfaced by production code; `src/main/startup/run-electron-vite-dev-web.test.ts` now stashes `out/web` on the repo filesystem instead of `/tmp`, avoiding cross-device `rename` failures. Focused reruns: `src/main/git/upstream.test.ts` -> 10 passed; `src/main/startup/run-electron-vite-dev-web.test.ts` -> 2 passed.
- Full changed test suite: `corepack pnpm exec vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts src/shared/scryer/prompts.test.ts src/shared/scryer/diagram-cache.test.ts src/shared/scryer/diagram-ids.test.ts src/shared/scryer/diagram-kind.test.ts src/main/scryer/model-store.test.ts src/main/scryer/mcp-tools.test.ts src/main/scryer/drift.test.ts src/main/scryer/diagram-controller-model-store.test.ts src/main/ipc/architecture.test.ts src/main/ipc/register-core-handlers.test.ts src/main/ipc/diagram-cache.test.ts src/main/ipc/diagram-source-targets.test.ts src/main/ipc/export.test.ts src/cli/scryer-mcp-server.test.ts src/renderer/src/components/architecture/ArchitectureModelTree.test.ts src/renderer/src/components/architecture/useArchitectureModelController.test.ts src/renderer/src/components/architecture/DiagramReferenceControls.test.tsx src/renderer/src/components/architecture/DiagramReviewView.element-navigation.test.tsx src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/DiagramSourceDraftView.test.tsx src/renderer/src/components/architecture/diagram-controller.test.ts src/renderer/src/components/architecture/diagram-export-actions.test.ts src/renderer/src/components/architecture/diagram-ref-controller.test.ts src/renderer/src/components/architecture/diagram-renderer.test.ts src/renderer/src/store/slices/worktrees.test.ts` -> 26 files, 231 tests passed.
- Static/type/build checks: `corepack pnpm run tc` passed; `corepack pnpm run lint` passed with 0 warnings and 0 errors; `corepack pnpm run build:cli` exited 0 after TypeScript compile and reported only the existing `/usr/local/bin/orca-dev` symlink permission notice.
- Full Vitest suite: `corepack pnpm test` -> 979 files passed, 2 skipped, 10035 tests passed, 15 skipped.
- E2E/live: `npx playwright test tests/e2e/architecture-diagram-library.spec.ts --config tests/playwright.config.ts --project electron-headless` -> 9 passed after adding the comprehensive human daily-use journey, a mission-style architecture review handoff journey, and a multi-diagram Mermaid UML/flowchart review packet. The spec opened a real Electron app and temp repo, then verified create/save/reload/delete, comprehensive browsing/editing/dirty-switch/invalid-render/ref/link/bind/delete daily usage, chained architecture review handoff operations, sufficient generated Mermaid flowchart/sequence/class/state sources, valid render, invalid-source persistence, external reload conflict, large library behavior, target-side ref creation, S3A create-diagram-then-link, and SVG element binding/navigation.
- Standalone compatibility: in `scryer/`, `corepack pnpm test` -> 3 files, 4 tests passed; `corepack pnpm build` passed; Docker Rust command `docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_HOME=/tmp/cargo -e CARGO_TARGET_DIR=/tmp/scryer-target -v /home/ljian/wspace/orca-scryer:/work -w /work/scryer rust:1.85-bookworm cargo test -p scryer-core --test standalone_v2_roundtrip` -> 1 test passed.
- Diff checks: `git diff --check && git diff --cached --check` passed in both `orca/` and `scryer/`.
- Git tracking proof: `git ls-files --error-unmatch` passed for the PRD, contracts, architecture doc, task slice doc, local task README, `LOCAL-S9.md`, fixture doc, and verification doc.

## Live evidence L1-L11

- L1-L7: covered by the Electron E2E run above using real temp workspaces and real `.scry` reload paths, including the comprehensive human daily-use journey that clicks through Diagram library browsing, keyboard group collapse/expand, explicit save, dirty switch Cancel/Save, invalid Mermaid, C4 and flow-step refs, target-side create-and-link, SVG element binding/navigation, delete cleanup, and `.scry` render-output exclusion. The mission-style handoff journey adds a more complex task chain: create a review handoff diagram, link it to Worker, repair Signup Sequence after an invalid Mermaid attempt, link the nested flow step, handle collaborator disk changes through compare/reload conflict controls, save the accepted source, bind an SVG element, navigate back to Worker from the SVG picker, delete the temporary handoff diagram, and verify diagramRef cleanup plus `.scry` source-only persistence. The multi-diagram review-packet journey verifies the original product goal more directly by creating and rendering a flowchart, sequence UML, class UML, and state UML with required business fragments, persisting them under top-level `diagrams`, keeping them out of C4 `nodes` and `flows`, linking them through `diagramRefs`, reloading them from real `.scry`, and confirming render output stays out of `.scry`.
- L8: covered by `src/cli/scryer-mcp-server.test.ts` and `src/main/scryer/mcp-tools.test.ts` in the changed suite; diagram MCP tools are listed and tool write paths persist to `.scry`.
- L9: covered by `src/main/ipc/diagram-cache.test.ts`, `src/shared/scryer/diagram-cache.test.ts`, `src/main/ipc/export.test.ts`, and S7B E2E/regression evidence; valid cache writes stay under `.scryer/cache/diagrams` and malicious cache requests are rejected.
- L10: covered by `src/shared/scryer/prompts.test.ts` and `src/main/scryer/drift.test.ts`; prompt payloads omit bulk diagram source, include scoped diagram guidance, and drift reports diagram refs separately.
- L11: covered by the standalone TypeScript tests and Docker Rust `standalone_v2_roundtrip` test; v2 `diagrams`, `diagramRefs`, and unknown top-level fields survive round trip.

## Mock policy

- Mocks used: component-level render adapters, clipboard/save-dialog boundaries, direct handler imports, and focused filesystem failure injection from prior slices.
- Why the mock is allowed: each mock isolates UI state, OS integration, or hard-to-trigger failure behavior without replacing completion evidence.
- Non-mocked test proving completion: full changed suite, Electron E2E/live spec, MCP CLI/schema tests, real temp cache path tests, real `.scry` model-store reload tests, and standalone TypeScript/Rust round trips.

## Drift and PR evidence

- Drift check result: PRD R1-R16, contract rows, traceability rows, local tasks, fixture IDs, tests, and implementation surfaces are represented by the final changed suite, full Vitest suite, and E2E/live evidence above.
- PR evidence fields filled: L1-L11 evidence, full test command output, mock usage, known residual risks, and Git tracking proof.
- Traceability rows marked complete: R1-R16 after tests and live evidence.
- Git tracking proof: `git ls-files --error-unmatch` passed for PRD, contract, architecture, task, local task, and testing docs.

## Final review

- Findings: no blocking spec, contract, or verification findings remain after PR closeout.
- Standards: changes follow the local-task fallback workflow because GitHub Issues are disabled; docs, contracts, tests, and live evidence are linked through local task docs.
- Spec and contracts: `.scry` source/refs, cache IPC, MCP/CLI bridge, prompt/drift, renderer/controller, and standalone compatibility contracts are covered by the tests above.
- GitNexus scope: `detect_changes` reports high risk for Orca because shared Architecture controller/IPC/MCP paths changed, and critical risk for standalone Scryer because schema/storage paths changed. Key affected symbols (`useArchitectureModelController`, `registerCoreHandlers`, standalone `C4ModelData`, and `useModelStorage`) were reviewed; coverage is the full Vitest suite, Electron E2E, and standalone TypeScript/Rust round trips above.
- Verification gaps: none known for the Scryer Diagram Library completion gate.

## Blockers

- None for LOCAL-S9.
