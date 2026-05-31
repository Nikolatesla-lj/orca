# LOCAL-S7A - Cache service and clear API

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S7A.md`
- Current status: complete
- Coding gate: completed after LOCAL-F1A and LOCAL-F1B were confirmed complete.

## Context Checklist

- [x] Requirement IDs: R13, R14, R15.
- [x] Business rules: BR9, BR10, BR15.
- [x] Contract sections: cache IPC, hash/cache rules, outputProfile, cache safety, workspace/project authorization.
- [x] Required exact names: `computeDiagramSourceHash`, `computeDiagramCacheKey`, `readDiagramCache`, `writeDiagramCache`, `clearDiagramCache`, `assertAuthorizedArchitectureProjectPath`, `MAX_DIAGRAM_CACHE_SVG_BYTES`, `MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES`.
- [x] Fixture IDs: FX5, FX8.
- [x] Existing files: `architecture.ts`, `src/main/ipc/filesystem-auth.ts`, optional thin `architecture-project-auth.ts`, `src/preload/api-types.ts`, `src/preload/index.ts`, `diagram-cache-client.ts`.
- [x] Real data path: authorized main-process project session -> cache IPC -> `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/` -> read/clear/rebuild.

## Requirement trace

- Requirement IDs: R13, R14, R15.
- Business rule IDs: BR9, BR10, BR15.
- Traceability rows: R13, R14, R15.
- Live evidence IDs: L9.

## Contract rows to implement

- System contract sections: cache IPC, hash/cache rules, outputProfile, cache safety, workspace/project authorization.
- Frontend state rows: no copy/export/thumbnail UI in S7A.
- Backend/API rows: Electron IPC, preload API, workspace authorization, cache clear service.
- Database/data rows: `.scryer/cache/diagrams/...`; `.scry` stays source/refs only.
- Cache failure codes: `cache.invalid-cache-key`, `cache.unauthorized-project`, `cache.invalid-diagram-id`, `cache.path-outside-cache`, `cache.empty-payload`, `cache.payload-too-large`, `cache.payload-profile-mismatch`, `cache.write-failed`, `cache.clear-failed`. Cache read miss is a successful result with `code: 'cache.read-miss'`, not a failure.
- Fixture IDs: FX5, FX8.

## Required exact implementation names

- Functions: `computeDiagramSourceHash`, `computeDiagramCacheKey`, `readDiagramCache`, `writeDiagramCache`, `clearDiagramCache`, `assertAuthorizedArchitectureProjectPath`, `MAX_DIAGRAM_CACHE_SVG_BYTES`, `MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES`.
- Components/props: none.
- MCP handlers: none; S5 consumes `clearDiagramCache` after S7A.
- IPC channels/types: `architecture:readDiagramCache`, `architecture:writeDiagramCache`, `architecture:clearDiagramCache`.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `diagram-cache-client.ts` if created in this slice.
- Backend/API files: `architecture.ts`, `src/main/ipc/filesystem-auth.ts`, optional thin `architecture-project-auth.ts`, `src/preload/api-types.ts`, `src/preload/index.ts`.
- Database/data files: `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/`, FX5, FX8.
- Existing tests: IPC/preload tests if present.

## Real data path

- User action or MCP call: renderer/cache client asks main process to read, write, or clear diagram cache.
- Frontend state transition: none in S7A.
- Backend/API call: existing `filesystem-auth.ts` allowed roots / registered worktree roots -> preload -> main IPC -> `assertAuthorizedArchitectureProjectPath(projectPath, store)` -> cache service.
- Persistence/cache path: `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/`; never `.scry`.
- Reload/read-back proof: cache miss rebuild can happen later from source; S7A only proves cache path safety and clear ability.

## What to build

Add the real cache service, hash/cache helpers, preload surface, and cache clear API that S5 can call safely.

## Scope

- Frontend: typed cache client only; no toolbar, no copy/export, no thumbnail UI.
- Backend/API: cache IPC read/write/clear and preload API.
- Database/data: Derived cache files only.
- Business rules: cache is rebuildable; S7A does not claim UI or MCP delete integration.

## Acceptance Criteria

- [x] `outputProfile: 'review'` reads/writes SVG only.
- [x] `outputProfile: 'thumbnail' | 'export'` reads/writes PNG data URL only.
- [x] Payload/profile mismatch returns `cache.payload-profile-mismatch`.
- [x] Cache path containment and `assertAuthorizedArchitectureProjectPath(projectPath, store)` authorization are enforced before resolving any cache path.
- [x] S7A reuses `src/main/ipc/filesystem-auth.ts`; if `architecture-project-auth.ts` is added, it is only a thin wrapper and keeps no separate authorization table.
- [x] Authorization comes from existing `filesystem-auth.ts` allowed roots / registered worktree roots; cache IPC must not authorize a path merely because renderer provided it or because `architecture:readModel` was called earlier.
- [x] Existing but unauthorized temp project paths return `cache.unauthorized-project`; the same path works only after the existing filesystem-auth trusted seam authorizes it.
- [x] SVG payloads over `MAX_DIAGRAM_CACHE_SVG_BYTES` and PNG data URLs over `MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES` return `cache.payload-too-large` and write no partial file.
- [x] `modelName: null | undefined` is normalized by the same `sanitizeProjectModelName` path as existing model read/write.
- [x] `clearDiagramCache` is real and callable by S5; no no-op cleanup is allowed.
- [x] No copy/export buttons, thumbnail list, or delete backfill is implemented in S7A.
- [x] S7A supports the service contract for `review`, `thumbnail`, and `export` profiles but does not wire any profile into UI.

## Completion evidence

- Targeted Vitest: `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/architecture/DiagramReferenceControls.test.tsx src/renderer/src/components/architecture/DiagramReviewView.test.tsx src/renderer/src/components/architecture/diagram-controller.test.ts src/main/scryer/diagram-controller-model-store.test.ts src/shared/scryer/diagram-cache.test.ts src/main/ipc/diagram-cache.test.ts src/main/ipc/architecture.test.ts src/main/ipc/register-core-handlers.test.ts` -> 8 files / 42 tests passed.
- Typecheck: `corepack pnpm run tc` passed.
- Lint: `corepack pnpm run lint` passed with 0 warnings and 0 errors.
- Format: `corepack pnpm exec oxfmt --check ...` passed.
- Diff hygiene: `git diff --check` passed before status update.
- Live/real cache path: `src/main/ipc/diagram-cache.test.ts` uses real temporary project directories, FX5 source, FX8 malicious request fixture, filesystem-auth authorization, and real `.scryer/cache/diagrams/<normalizedModelName>/<diagramId>/` read/write/clear assertions. It also verifies `.scry` does not receive SVG/PNG render output.
- UI regression/live evidence: `corepack pnpm run test:e2e -- architecture-diagram-library.spec.ts` -> 5 passed.

## Required automated tests

| Test                        | Fixture | Real path or mock                                        | Exact assertions                                                                                                          |
| --------------------------- | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cache valid write/read      | FX5/FX8 | Real temp cache path                                     | Files stay under `.scryer/cache/diagrams`.                                                                                |
| Cache malicious inputs      | FX8     | Real temp cache path                                     | Reject unauthorized/path traversal/invalid key/oversize/mismatch.                                                         |
| Authorization source        | FX8     | Real temp cache path plus unauthorized path              | Valid-looking path outside the existing filesystem-auth allowed roots is rejected with `cache.unauthorized-project`.      |
| Filesystem-auth reuse       | FX8     | Main-process unit/integration test                       | Cache auth delegates to `filesystem-auth.ts`; renderer/cache IPC cannot register arbitrary paths or bypass allowed roots. |
| Cache clear                 | FX8     | Real temp cache path                                     | `clearDiagramCache` removes only the targeted diagram/model cache directory.                                              |
| Cache failure injection     | FX8     | Real temp path plus allowed filesystem failure injection | `cache.write-failed` and `cache.clear-failed` are returned without corrupting `.scry`.                                    |
| No render output in `.scry` | FX5     | Real `.scry` inspection                                  | `.scry` contains source/refs only.                                                                                        |

## Required negative tests

| Failure                  | Expected code                                            | Fixture | Exact assertion                                                                |
| ------------------------ | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Path traversal           | `cache.invalid-diagram-id` or `cache.path-outside-cache` | FX8     | No file outside project cache is read or written.                              |
| Unauthorized project     | `cache.unauthorized-project`                             | FX8     | Renderer-provided arbitrary path is rejected even if syntactically valid.      |
| Empty payload            | `cache.empty-payload`                                    | FX8     | Write request with no `svg` or `pngDataUrl` is rejected before any file write. |
| Payload/profile mismatch | `cache.payload-profile-mismatch`                         | FX8     | `review` rejects PNG and `export` rejects SVG.                                 |
| Oversize payload         | `cache.payload-too-large`                                | FX8     | Write fails and no partial cache file remains.                                 |
| Write failure            | `cache.write-failed`                                     | FX8     | Filesystem failure returns structured failure and no success response.         |
| Corrupt cache read       | `cache.read-miss`                                        | FX8     | Returns `{ ok:true, hit:false, outputProfile, code }`.                         |
| Clear failure            | `cache.clear-failed`                                     | FX8     | Failure returns structured failure; unrelated cache directories remain.        |

## Live verification steps

1. Copy FX8 into a temp workspace test.
2. Run one valid cache write/read for each `outputProfile`.
3. Run malicious cache requests and record rejected `cache.*` codes.
4. Clear one diagram cache and record that sibling diagram/model cache entries remain.

## Mock policy

- Mocks used: filesystem may be mocked only for failure injection.
- Why the mock is allowed: it can simulate write/clear failure.
- Non-mocked test proving completion: real temp cache path read/write/clear tests.

## Drift and PR evidence

- Drift check required: verify cache metadata is not stored in `.scry`, and preload/main/renderer types match.
- PR evidence fields to fill: cache path, malicious request rejection, clear behavior.
- Traceability rows to mark complete only after tests and live evidence pass: R13, R14, R15.

## Blockers

- None. LOCAL-F1A and LOCAL-F1B are complete.
