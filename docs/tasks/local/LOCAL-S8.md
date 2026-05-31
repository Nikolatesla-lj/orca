# LOCAL-S8 - Standalone Scryer data compatibility

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local task doc: `docs/tasks/local/LOCAL-S8.md`
- Current status: complete
- Coding gate: open after LOCAL-F1A data contract was stable.

## Context Checklist

- [x] Requirement IDs: R16.
- [x] Business rules: BR12.
- [x] Contract sections: standalone explicit-plus-preserve rule, migration and validation.
- [x] Required exact names: standalone `C4ModelData`, parser/save functions, Rust schema fields.
- [x] Fixture IDs: FX10.
- [x] Existing files: `../scryer/src/types.ts`, `../scryer/src/hooks/useModelStorage.ts`, `../scryer/crates/scryer-core/src/lib.rs`.
- [x] Real data path: Orca writes v2 `.scry` -> standalone opens/saves -> Orca reopens.

## Requirement trace

- Requirement IDs: R16.
- Business rule IDs: BR12.
- Traceability rows: R16.
- Live evidence IDs: L11.

## Contract rows to implement

- System contract sections: standalone explicit-plus-preserve rule, migration and validation rules.
- Frontend state rows: standalone Diagram UI is out of scope.
- Backend/API rows: standalone TypeScript storage and Rust parse/save.
- Database/data rows: same `.scry` file round-trips between Orca and standalone.
- Error codes: `standalone.save-blocked` if safe preservation is unavailable.
- Fixture IDs: FX10.

## Required exact implementation names

- Functions: standalone `C4ModelData`, parser/save functions, Rust schema fields.
- Components/props: none; standalone Diagram library UI is out of scope.
- MCP handlers: none.
- IPC channels/types: standalone storage/save APIs.
- CLI bridge names: none.

## Existing code to inspect before coding

- Frontend files: `../scryer/src/types.ts`, `../scryer/src/hooks/useModelStorage.ts`.
- Backend/API files: `../scryer/crates/scryer-core/src/lib.rs`.
- Database/data files: FX10 `.scry` fixture.
- Existing tests: standalone storage and Rust serialization tests if present.

## Real data path

- User action or MCP call: Orca writes v2 `.scry`, standalone opens and saves it, Orca reopens it.
- Frontend state transition: standalone Diagram library UI is out of scope; standalone storage must preserve v2 fields even though no diagram UI is shown.
- Backend/API call: standalone TypeScript/Rust parse and save.
- Persistence/cache path: same `.scry`; no cache.
- Reload/read-back proof: diagrams, diagramRefs, schemaVersion, and compatible unknown top-level fields remain.

## What to build

Ensure standalone Scryer can round-trip Orca v2 `.scry` files without showing Diagram library UI.

## Scope

- Frontend: standalone types/storage preservation only.
- Backend/API: Rust schema parse/save preservation.
- Database/data: `.scry` round trip.
- Business rules: if safe preservation cannot be guaranteed, block save instead of losing fields.

## Acceptance Criteria

- [x] TypeScript standalone types include schemaVersion, diagrams, diagramRefs.
- [x] Rust `C4ModelData` explicitly includes schemaVersion, diagrams, diagramRefs.
- [x] Rust uses flatten extra map or equivalent to preserve compatible unknown top-level fields.
- [x] If safe preservation is unavailable, standalone blocks save for v2 with a clear error.
- [x] Standalone UI for Diagram library remains out of scope.
- [x] Release gate is enforced: any user-visible Orca build that can save v2 `.scry` must include this compatibility slice, unless standalone save support is explicitly removed or disabled with a documented product decision.

## Required automated tests

| Test | Fixture | Real path or mock | Exact assertions |
|---|---|---|---|
| TS parse/save | FX10 | Real temp `.scry` | v2 fields and unknown compatible fields preserved. |
| Rust parse/save | FX10 | Real Rust parse/save test | v2 fields and unknown compatible fields preserved. |
| Orca round trip | FX10 | Real app/storage round trip | Orca -> standalone -> Orca keeps diagrams/refs. |

## Required negative tests

| Failure | Expected code | Fixture | Exact assertion |
|---|---|---|---|
| Unknown compatible field | none; preservation assertion | FX10 | Field survives standalone save. |
| v2 field missing in Rust | `standalone.save-blocked` | FX10 variant | Save is blocked instead of dropping fields. |
| Nested flowStep ref | parser warning or preservation assertion | FX10 | Standalone does not corrupt nested ref target. |

## Live verification steps

1. [x] Open FX10 in Orca parser and record v2 fields.
2. [x] Open and save the same file in standalone TypeScript storage through a real temp `.scry` file.
3. [x] Reopen in Orca parser and record preserved fields.

## Completion evidence

- TDD red evidence: `corepack pnpm test -- src/hooks/useModelStorage.test.ts` failed before implementation because `parsed.schemaVersion` was `undefined`.
- Standalone TS focused tests: `corepack pnpm test -- tests/standalone-v2-storage.test.ts src/hooks/useModelStorage.test.ts` -> 3 files, 4 tests passed. `tests/standalone-v2-storage.test.ts` copies FX10 to a real temp `model.scry`, parses, saves, rereads, and asserts `schemaVersion`, `diagrams`, nested `flowStep` `diagramRefs`, and `compatibleUnknownTopLevel`.
- Standalone full test suite: `corepack pnpm test` -> 3 files, 4 tests passed.
- Standalone frontend build: `corepack pnpm build` -> passed.
- Orca parser red/green evidence: `corepack pnpm vitest run --config config/vitest.config.ts src/shared/scryer/parse-model.test.ts` initially failed on missing `compatibleUnknownTopLevel`, then passed after preserving unknown top-level fields -> 1 file, 7 tests passed.
- Orca checks after S8 changes: `corepack pnpm run tc` passed; `corepack pnpm run lint` found 0 warnings and 0 errors; `corepack pnpm run build:cli` TypeScript build passed and reported only the existing `/usr/local/bin/orca-dev` symlink permission notice.
- Diff checks: `git diff --check && git diff --cached --check` passed in both `orca/` and standalone `scryer/`.
- Rust test file added: `scryer/crates/scryer-core/tests/standalone_v2_roundtrip.rs`.
- Local Rust fallback evidence: direct host `cargo` was unavailable, so verification ran in Docker with `rust:1.85-bookworm`.
- Rust verification: `docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_HOME=/tmp/cargo -e CARGO_TARGET_DIR=/tmp/scryer-target -v /home/ljian/wspace/orca-scryer:/work -w /work/scryer rust:1.85-bookworm cargo test -p scryer-core --test standalone_v2_roundtrip` -> 1 passed.

## Mock policy

- Mocks used: none for completion evidence.
- Why the mock is allowed: not applicable.
- Non-mocked test proving completion: real Orca -> standalone -> Orca fixture round trip.

## Drift and PR evidence

- Drift check required: verify standalone and Orca data types agree on v2 fields and preservation strategy.
- PR evidence fields to fill: before/after FX10 excerpts and standalone save result.
- Traceability rows to mark complete only after tests and live evidence pass: R16.

## Blockers

- None.
