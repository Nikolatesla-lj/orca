# Orca Scryer Full-Parity Convergence Issue Slices

Status: Published as GitHub PRD #67 with seven linked child issues
Date: 2026-07-14
Last updated: 2026-07-15
Parent work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`
Task matrix: `docs/tasks/orca-scryer-full-parity-convergence-task-slices.md`
Target repository: `Nikolatesla-lj/orca`
GitHub Parent: https://github.com/Nikolatesla-lj/orca/issues/67

This document contains the published Parent Epic and seven child issue bodies.
The issue bodies operationalize the Decision Map; they do not replace operation
contracts or redefine the 33-operation inventory.

## Pre-Execution Checkpoint

Local commit `227cc8b16906733ac3a37f78a2d9320577d33d93` preserves the
pre-convergence code, tests, adapters, and local regression fixtures on
`scryer/convergence-integration`. Its baseline passed 78 focused tests, all three
typecheck targets, targeted formatting and React Doctor, and 22 existing
Architecture Electron E2E tests. Targeted oxlint still reports 52 findings and
the documented S1/S2/S5 blockers remain. The checkpoint is not pushed, landed,
release-ready, or product-integrated, and it does not complete any child issue
acceptance checkbox. #68 remains the first implementation slice.

This repository-only note records execution state after issue publication. The
issue bodies below remain the publication source and are not silently promoted
by the checkpoint.

## Publication Labels

- Parent: `prd`, `enhancement`, `needs-triage`
- Child: `task-slice`, `enhancement`, `needs-triage`, `pipeline:prd-67`

After triage, replace `needs-triage` with `ready-for-agent` only when the child is
fully specified and unblocked. Keep explicit Parent and Blocked By links even
when GitHub sub-issue relationships are available.

---

# Parent Epic

## Title

`[PRD] Orca Scryer full-parity convergence and landing`

## Problem Statement

The active Orca Scryer development tree contains valuable Engine, CLI, IPC,
parity, and Container Generation work, but the slice cannot yet be described as
fully verified, product-integrated, or landed. Structural file-size and import
cycle blockers remain. Container Generation does not yet satisfy all binding
invariants. Edit leases and the Completion Gate do not fully own semantic writes
and terminal product state. Compatibility paths can still retain or revive
legacy semantics. The 33-operation catalog lacks one machine-derived evidence
gate. Golden provenance is not sufficient for an upstream parity claim. The
visible container `Fill with AI` workflow still directs the agent through legacy
`set_node` behavior.

The work also spans committed code, dirty working-tree code, historical design
material, and a second dirty reference worktree. Without one ordered work set,
future agents can mistake test presence for verification, working-tree code for
landed code, or adapter mapping for product integration.

## Solution

Freeze new Scryer feature expansion and converge the existing slice through
seven bounded child issues:

1. split Engine contract hubs and clear structural blockers;
2. close atomic Container Generation invariants;
3. complete edit-lease and Completion Gate ownership;
4. retire legacy semantic ownership and harden final-state validation;
5. add a catalog-derived 33-operation machine gate with real provenance;
6. cut the visible `Fill with AI` workflow over to
   `scryer.container.fill`;
7. run one exact-tree release gate and assemble reviewable commits.

The native Engine remains the only Scryer state-semantics owner. Reads cross
`readView(...)`; operations cross `executeOperation(...)`; CLI, IPC, renderer,
agent runtime, and compatibility code remain adapters.

## Commits

The implementation should proceed through the smallest working commits possible.
Each commit must leave its exercised interface and focused tests working.

### S1 commit sequence

1. Extract pending/diff leaf contracts so Engine types no longer depend on diff
   implementation details.
2. Redirect existing callers to those leaf contracts and remove the
   `diff`/types import cycle.
3. Extract generation request/result contracts from the general Engine type hub.
4. Extract generation schemas without changing runtime validation behavior.
5. Split catalog declarations by operation family while preserving one public
   catalog interface.
6. Extract proposal validation from the Container Generation planner.
7. Extract subtree identity and minting behavior.
8. Extract source-anchor planning.
9. Extract generated group/link construction.
10. Extract result/history planning.
11. Replace literal NUL delimiters with readable source-safe encoding.
12. Remove Scryer `max-lines` disables after the files satisfy repository rules.
13. Add or update cycle, typecheck, and focused regression evidence.

### S2 commit sequence

1. Add an effective committed-plus-planned target-emptiness test, then implement
   the invariant.
2. Add thin-symbol source-identity coverage, then preserve identity for every
   generated symbol.
3. Add generated-group ownership coverage, then set the correct parent.
4. Add whole-symbol anchor coverage for plain responsibilities, then correct the
   planner behavior.
5. Add partial/unresolved build-edge evidence cases, then implement the result
   states.
6. Validate final committed and planned snapshots before primary writes.
7. Commit committed/planned/source-map changes through one transaction.
8. Apply active-lease policy to Container Generation.
9. Complete strict schemas, structured results, and operation-level regression
   tests.

### S3 commit sequence

1. Redact lease tokens and trusted authorization identifiers from all Engine
   error details.
2. Protect `model.set` and `container.fill` with active-lease policy.
3. Make renderer and preload DTOs reject unknown authorization fields.
4. Adapt the edit-session controller to the native Orca agent runtime.
5. Make the Completion Gate own terminal Scryer state.
6. Prevent blocked completion from cleaning up workflows or advancing baselines.
7. Add cancel and crash lease cleanup.
8. Add manual-fold, automatic-fold, nothing-to-fold, warnings-only, blocker,
   conflict, and destructive-risk tests.

### S4 commit sequence

1. Validate final state-store snapshots before committing semantic files.
2. Validate executor warnings before any semantic write.
3. Convert remaining default sync paths into Engine adapters or remove them.
4. Remove default `mode`, `fullModel`, and raw-document compatibility behavior.
5. Make unsupported MCP aliases reject explicitly.
6. Remove Engine-failure legacy retry paths.
7. Add Architecture ownership and no-bypass static tests.
8. Add no-partial-write and no-fallback regression tests.

### S5 commit sequence

1. Define the catalog-derived evidence row and maturity-state result contracts.
2. Derive all operation ids and declared policies from the catalog.
3. Add strict input/success schema and non-placeholder executor checks.
4. Add CLI mapping checks.
5. Add generic IPC support or explicit waiver checks.
6. Add ownership and contract/golden evidence checks.
7. Add visible-product-entry E2E or explicit UI-waiver checks.
8. Replace placeholder upstream provenance with a real revision and independently
   produced expected state.
9. Wire the complete gate into focused release verification.

### S6 commit sequence

1. Replace the legacy container-fill prompt instruction with a typed generation
   intent.
2. Add the preload/IPC adapter for that intent.
3. Add the agent/system adapter that invokes the Engine operation.
4. Connect visible start, progress, failure, cancel, and completion states.
5. Connect watcher/view refresh to the Engine-owned transaction result.
6. Add visible success and file-effect E2E coverage.
7. Add validation-failure, cancellation, agent-completion, and lease-conflict E2E
   coverage.
8. Remove remaining product-path `set_node` guidance and fallback.

### S7 commit sequence

1. Run and repair focused Engine, transaction, ownership, and adapter gates.
2. Run and repair the catalog-derived parity gate.
3. Run and repair Node/CLI/Web typecheck and lint.
4. Run and repair release-critical Electron E2E.
5. Run `git diff --check` and GitNexus cycle/impact review.
6. Update Decision Map, migration status, task evidence, commit SHAs, and target
   refs from the exact review tree.
7. Assemble Engine implementation commits.
8. Assemble Engine tests/parity commits.
9. Assemble adapter/product integration commits.
10. Assemble decision and execution documentation commits.

## Decision Document

- The Engine is the only owner of Scryer state semantics.
- `readView(...)` and `executeOperation(...)` are the external seams.
- Operation files remain thin adapters into focused deep modules.
- Semantic writes validate final state and commit atomically.
- History and maintenance side effects are best-effort only when explicitly
  declared by the operation contract.
- All committed/planned semantic writes obey the active edit lease.
- Lease tokens remain in trusted main-process/controller/Engine context.
- Agent process completion triggers the Completion Gate; it is not itself Scryer
  completion.
- Legacy adapters never retry failed Engine operations through old semantics.
- Full parity is derived from the catalog and reported as separate maturity
  states.
- Visible Container Generation must cross `scryer.container.fill` and the
  Completion Gate.
- The dirty reference worktree is read-only input for selective rewrites, never a
  wholesale merge source.
- A partial commit or landing does not upgrade unlanded work.

## Testing Decisions

Good tests cross the same interface used by callers and assert observable state,
errors, warnings, lifecycle, and file effects. They do not lock tests to internal
helper call order or duplicate semantic implementation in fixtures.

The work set requires:

- planner/Engine interface tests for generation invariants;
- transaction tests for atomic primary state;
- lease/controller/Completion Gate lifecycle tests;
- ownership/static tests for no-bypass guarantees;
- catalog/pipeline tests for executable operations and strict schemas;
- CLI and generic IPC black-box adapter tests;
- catalog-derived parity evidence tests;
- visible Electron E2E only for real product entrypoints;
- no-write fingerprints for read-only paths;
- exact-tree typecheck, lint, diff, cycle, and impact gates.

Prior art includes the existing Decision #31-#33 focused tests, Architecture
ownership tests, operation migration gate patterns, pipeline task slices, and the
Architecture zero-partial release audit.

## Out Of Scope

- New Scryer operations or Architecture product features.
- Redefining the existing 33 operation contracts.
- Reintroducing legacy C4 round trips or raw-document semantics.
- A second catalog, state store, operation pipeline, or generation planner.
- Fake renderer controls for CLI/agent-only operations.
- Wholesale merge, commit, reset, clean, stash, or deletion of the dirty reference
  worktree.
- Claiming tests, product integration, commits, or landing without exact evidence.

## Further Notes

Parent work set:
`docs/prd/orca-scryer-full-parity-convergence-work-set.md`

Task matrix:
`docs/tasks/orca-scryer-full-parity-convergence-task-slices.md`

Decision authority:
`docs/orca-scryer-decision-map.md`

## Child Issues

- #68 — S1: Split Scryer Engine contract hubs and clear structural blockers
- #69 — S2: Close atomic Container Generation invariants
- #70 — S3: Complete edit-lease and Completion Gate ownership
- #71 — S4: Retire legacy Scryer semantic ownership
- #72 — S5: Add the catalog-derived 33-operation parity gate
- #73 — S6: Cut Fill with AI over to atomic Container Generation
- #74 — S7: Run the exact-tree Scryer release gate and assemble reviewable commits

---

# S1: Split Scryer Engine Contract Hubs And Clear Structural Blockers

## Title

`[S1] Split Scryer Engine contract hubs and clear structural blockers`

## Parent

- Parent Epic: #67
- Decision coverage: #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Restructure the oversized Scryer Engine contract, schema, catalog, and Container
Generation planning modules into focused deep modules. Remove the known import
cycles, literal NUL source bytes, and Scryer `max-lines` disables while preserving
the existing external Engine seam and operation behavior.

## Accepted Decisions

- Keep one public Engine operation interface; do not expose every extracted
  internal module to callers.
- Move leaf contracts to dependency-minimal modules instead of adding lazy
  imports or runtime indirection.
- Split modules by domain responsibility, not arbitrary line count.
- Keep operation files thin.
- Do not use vague filenames such as helpers, utils, common, or misc.
- Do not change operation schemas or behavior merely to simplify the split.

## Files To Inspect First

- `src/main/scryer/engine/types.ts`
- `src/main/scryer/engine/schemas.ts`
- `src/main/scryer/engine/catalog.ts`
- `src/main/scryer/engine/diff.ts`
- `src/main/scryer/engine/container-generation-planner.ts`
- pending intent-planner modules in the reference worktree, if still required
- Scryer-specific lint and ownership tests

## Implementation Scope

- extract pending/diff leaf contracts;
- extract generation contracts and schemas;
- divide catalog declarations into operation-family modules behind one catalog;
- split generation planning into proposal validation, identity/minting,
  source-anchor planning, group/link construction, and result/history planning;
- remove literal NUL bytes;
- remove file-size disables after the split;
- preserve cross-platform and SSH-compatible path behavior.

## Commits

1. Extract pending/diff leaf contracts and remove the first cycle.
2. Extract generation contracts.
3. Extract generation schemas.
4. Split catalog families behind the existing interface.
5. Extract proposal validation.
6. Extract identity and minting.
7. Extract source-anchor planning.
8. Extract group/link construction.
9. Extract result/history planning.
10. Replace literal NUL delimiters.
11. Remove Scryer file-size disables and add structural evidence.

## Acceptance Criteria

- [ ] No Scryer `max-lines` disable remains.
- [ ] `diff` and general Engine types no longer form a cycle.
- [ ] Ported intent/group planning does not recreate the known cycle.
- [ ] TypeScript source contains no literal NUL bytes.
- [ ] Extracted modules have concrete responsibility-based names.
- [ ] The public Engine seam and operation ids remain unchanged.
- [ ] Focused Engine tests pass after each extraction.
- [ ] Node typecheck passes.
- [ ] GitNexus cycle check reports no target cycle.
- [ ] `git diff --check` passes.

## Verification

Run focused tests for each affected Engine family, Node typecheck, lint or static
rule checks, the literal-NUL scan, `git diff --check`, and GitNexus cycle review.

## Forbidden

- adding or moving a `max-lines` disable;
- introducing lazy runtime imports to hide a cycle;
- adding a second catalog or operation dispatcher;
- changing operation behavior without a separate acceptance criterion;
- creating generic dumping-ground modules.

## Out Of Scope

Container Generation semantic fixes, lease behavior, legacy retirement, parity
proof, and product cutover belong to S2-S6.

## Blocked By

None.

---

# S2: Close Atomic Container Generation Invariants

## Title

`[S2] Close atomic Container Generation invariants`

## Parent

- Parent Epic: #67
- Decision coverage: #34 and #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Bring `scryer.container.fill` into full compliance with Decision #34. Validate the
proposal against effective committed-plus-planned state, preserve every generated
symbol's source identity, construct owned groups and links, report incomplete
build-edge evidence honestly, route source anchors correctly, and commit primary
state atomically under the active lease.

## Accepted Decisions

- Either committed or planned component children make the target non-empty.
- Every generated symbol retains source identity, including thin symbols.
- Generated groups belong to the target container and include only direct
  generated component children.
- Plain responsibilities use whole-symbol anchors; only explicitly ranged
  responsibilities carry subranges.
- Build-edge evidence distinguishes missing, empty, available, and partially
  unresolved states.
- Committed, planned, and semantic source-map updates form one primary
  transaction.
- History remains a best-effort sidecar.
- The operation is a semantic write and must obey the active lease.

## Files To Inspect First

- Container Generation planner and its focused tests
- build-edge cache adapter
- `scryer.container.fill` operation adapter
- catalog policy and schemas
- state-store transaction implementation
- source router and ID minter
- relevant Container Generation CLI and IPC tests

## Implementation Scope

- implement the six known invariant corrections;
- add final committed/planned snapshot validation;
- preserve thin-symbol source identity;
- correct group parent ownership;
- represent partial edge resolution;
- correct plain responsibility anchors;
- enforce lease policy;
- keep the operation result compact and structured.

## Commits

1. Fix effective-state target emptiness.
2. Preserve thin-symbol source identity.
3. Correct generated group ownership.
4. Correct whole-symbol responsibility anchors.
5. Add partial/unresolved build-edge evidence.
6. Validate final snapshots before primary writes.
7. Make the primary state transaction atomic.
8. Enforce active-lease policy.
9. Complete strict operation and regression coverage.

## Acceptance Criteria

- [ ] A target with children in either state layer rejects generation.
- [ ] Thin symbols keep durable source identity without fabricated behavior.
- [ ] Generated groups set the target container as parent and contain legal
  direct members only.
- [ ] Plain responsibilities use whole-symbol source anchors.
- [ ] Partially unresolved build evidence is distinguishable from complete
  evidence.
- [ ] Invalid proposals and final snapshots leave committed, planned, and source
  maps unchanged.
- [ ] A failed primary write leaves no partial semantic state.
- [ ] History failure produces only the documented warning behavior.
- [ ] Lease conflict rejects the semantic write.
- [ ] Strict input and success schemas validate the operation envelope.
- [ ] Generic `executeOperation(...)` coverage proves the real Engine path.

## Verification

Run planner interface tests, transaction/no-partial-write tests, source identity,
group, anchor, edge-evidence, lease, catalog/pipeline, CLI/IPC adapter, typecheck,
and `git diff --check` gates.

## Forbidden

- implementing generation as a sequence of raw intent calls;
- writing committed and planned state in separate primary transactions;
- guessing complete build-edge evidence;
- operation-local source-map mutation;
- bypassing the active lease;
- copying the reference planner wholesale.

## Out Of Scope

Completion Gate lifecycle belongs to S3. Legacy adapter retirement belongs to S4.
Full machine parity belongs to S5. Visible `Fill with AI` cutover belongs to S6.

## Blocked By

- #68 (S1).

---

# S3: Complete Edit-Lease And Completion Gate Ownership

## Title

`[S3] Complete edit-lease and Completion Gate ownership`

## Parent

- Parent Epic: #67
- Decision coverage: #27, #34, and #38
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Make edit leases protect every committed/planned semantic write and make the
Completion Gate the sole authority for terminal Scryer edit-session state. Keep
lease authorization inside trusted main-process/controller/Engine context,
connect the controller to the native Orca agent runtime, and cover normal,
blocked, cancel, and crash lifecycles.

## Accepted Decisions

- `model.set` and `container.fill` are lease-protected semantic writes.
- Read, validate, health inspection, and pending inspection remain available
  during an active lease when their contracts allow it.
- Lease tokens never enter renderer DTOs, preload contracts, prompts, logs,
  generic IPC input, or error envelopes.
- Unknown renderer authorization fields are rejected, not silently ignored.
- Agent `done` triggers pending/validate/completion evaluation; it is not terminal
  success.
- Only a passing Completion Gate may fold automatically or report final success.
- Blockers prevent workflow cleanup and baseline advancement.
- Cancel and crash release or reconcile lease state safely.

## Files To Inspect First

- edit lease store and tests
- edit-session controller and gate
- Engine pipeline error mapping
- catalog lease policies
- main-process Architecture IPC
- preload and renderer-facing DTO schemas
- agent runtime completion/cancel/crash integration
- reference-worktree lease and completion tests

## Implementation Scope

- redact lease authorization from errors;
- correct catalog lease policies;
- close renderer/preload schemas;
- adapt native agent runtime events;
- centralize terminal-state decisions in the Completion Gate;
- prevent blocked cleanup/baseline advancement;
- add cancel/crash handling;
- port test intentions, not the old controller implementation.

## Commits

1. Redact trusted lease details from error envelopes.
2. Protect all semantic-write policies.
3. Reject renderer/preload authorization fields.
4. Adapt native agent runtime events.
5. Make the Completion Gate own terminal state.
6. Block cleanup and baseline advancement on attention states.
7. Add cancel and crash lease handling.
8. Add complete focused lifecycle coverage.

## Acceptance Criteria

- [ ] Semantic writes reject conflicts and accept the trusted matching lease.
- [ ] Renderer/preload requests cannot provide or observe a lease token.
- [ ] Logs, prompts, and errors contain no token.
- [ ] Agent completion always evaluates pending and validation state.
- [ ] `nothing_to_fold` is represented explicitly.
- [ ] Warnings-only state follows the documented fold policy.
- [ ] Validation blockers and unknown pending kinds produce `needs_attention`.
- [ ] Destructive risk cannot auto-fold.
- [ ] Blocked completion cannot display final success.
- [ ] Cancel and crash clean up the active session safely.
- [ ] Read/validate/pending paths remain usable under an active lease as designed.

## Verification

Run lease-store, controller, Completion Gate, pipeline error-redaction,
renderer/preload DTO, agent runtime, cancel/crash, and fold-lifecycle tests plus
typecheck and `git diff --check`.

## Forbidden

- renderer-generated or prompt-visible tokens;
- token values in error details;
- treating process exit as Scryer completion;
- automatic fold when blockers or destructive risk exist;
- replacing the active split design with the old single-file controller;
- using a generic app lifecycle controller to own Scryer semantic safety.

## Out Of Scope

Container Generation proposal semantics belong to S2. Legacy adapter removal
belongs to S4. The visible product cutover belongs to S6.

## Blocked By

- #68 (S1).

---

# S4: Retire Legacy Scryer Semantic Ownership

## Title

`[S4] Retire legacy Scryer semantic ownership`

## Parent

- Parent Epic: #67
- Decision coverage: #26, #28, #36, and #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Make sync, MCP, Architecture IPC, preload compatibility channels, and
Architecture adapters pure adapters or remove them. Ensure the default Scryer 0.3
path cannot retry failed Engine operations through legacy C4/model-store/raw
semantic behavior. Harden warning and final-snapshot validation so malformed
executor output cannot partially write state.

## Accepted Decisions

- Default reads use `readView(...)`; default operations use
  `executeOperation(...)`.
- Compatibility code may translate names and DTOs only.
- Engine errors are terminal for that operation; no semantic retry is permitted.
- `mode`, `fullModel`, raw-document reads/writes, and C4 round trips are not
  default Scryer 0.3 behavior.
- Supported strict aliases are documented; unsupported legacy aliases reject.
- Final primary snapshots and warning envelopes validate before write.
- Static ownership tests enforce the hard cutover.

## Files To Inspect First

- Scryer sync adapter
- Scryer MCP tools/dispatcher
- Architecture IPC and its tests
- preload Architecture channels and DTOs
- Architecture view adapter
- renderer Architecture imports and IPC usage
- Engine pipeline warning validation
- state-store final-snapshot validation
- Architecture ownership tests from the reference worktree

## Implementation Scope

- remove or narrow compatibility aliases;
- eliminate semantic fallback and round trips;
- validate warnings and final snapshots pre-write;
- retain internal model-file filtering if it remains applicable;
- add static no-bypass and runtime no-fallback tests;
- keep provider-specific behavior behind adapters where relevant.

## Commits

1. Add final-snapshot validation.
2. Add warning-envelope validation.
3. Convert default sync paths to Engine adapters.
4. Remove default `mode`, `fullModel`, and raw-document paths.
5. Make unsupported aliases reject.
6. Remove Engine-failure semantic retry.
7. Add Architecture ownership/static gates.
8. Add no-fallback and no-partial-write regression tests.

## Acceptance Criteria

- [ ] Default renderer paths do not import legacy C4 semantic types.
- [ ] Default preload/IPC paths do not expose raw model-document mutation.
- [ ] Sync and MCP paths cross the Engine seam.
- [ ] Engine failure cannot invoke a legacy semantic implementation.
- [ ] Supported compatibility aliases have strict mappings.
- [ ] Unsupported aliases return explicit validation or unsupported-operation
  errors.
- [ ] Malformed warnings fail before semantic writes.
- [ ] Invalid final snapshots leave committed/planned state unchanged.
- [ ] Ownership/static tests prevent direct semantic file writes from adapters.
- [ ] Architecture zero-partial release evidence remains accurate.

## Verification

Run Architecture ownership tests, compatibility alias matrix, malformed-warning,
invalid-final-snapshot, Engine-failure no-fallback, no-partial-write, typecheck,
and `git diff --check` gates.

## Forbidden

- C4-to-Scry-to-C4 semantic round trips;
- raw-document fallback;
- legacy retry after Engine failure;
- adapters that write `.scryer` semantic files directly;
- renderer ownership of Engine contracts;
- wholesale migration of the reference sync/MCP stack.

## Out Of Scope

New operation semantics belong to their Engine slices. Machine parity belongs to
S5. Visible Container Generation belongs to S6.

## Blocked By

- #68 (S1).
- Completion-path retirement work also waits for #70 (S3).

---

# S5: Add The Catalog-Derived 33-Operation Parity Gate

## Title

`[S5] Add the catalog-derived 33-operation parity gate`

## Parent

- Parent Epic: #67
- Decision coverage: #35, #37, and #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Derive a machine-readable parity report from the Scryer operation catalog. For
every operation, prove strict schemas, a real executor, declared policies,
transport support or waiver, ownership evidence, contract/golden evidence,
legacy-fallback absence, and visible product coverage or an explicit UI waiver.
Repair golden provenance so upstream parity claims cite a real upstream revision
and independently produced expected state.

## Accepted Decisions

- The catalog is the operation inventory source of truth.
- The gate reports separate maturity states: declared, Engine executable, adapter
  verified, product-integrated, and landed.
- A catalog count, CLI count, or partial golden set cannot promote maturity.
- CLI/agent-only operations use explicit UI waivers instead of fake renderer
  tests.
- Upstream parity requires a real upstream revision, independent expected state,
  and explicit Orca differences.
- Existing placeholder fixtures remain local regression fixtures unless rebuilt.

## Files To Inspect First

- Scryer operation catalog and family declarations
- strict schema declarations
- CLI operation specs and dispatch
- generic Architecture IPC operation bridge
- ownership/static tests
- parity golden runner and fixtures
- `docs/scryer-cli-tool-parity.md`
- visible Architecture product entry inventory

## Implementation Scope

- define evidence row and report schemas;
- derive all rows from the catalog;
- verify executor and policy declarations;
- verify CLI and IPC/waiver coverage;
- verify ownership and contract/golden evidence;
- verify visible product E2E or UI waiver;
- validate provenance;
- provide actionable failure output.

## Commits

1. Define parity evidence contracts.
2. Derive operation rows and policies from the catalog.
3. Add schema/executor checks.
4. Add CLI mapping checks.
5. Add IPC support/waiver checks.
6. Add ownership and contract/golden checks.
7. Add visible-entry/UI-waiver checks.
8. Rebuild or downgrade placeholder provenance.
9. Wire the complete gate into release verification.

## Acceptance Criteria

- [ ] The gate enumerates exactly the cataloged operation ids.
- [ ] Every row reports strict input and success schema status.
- [ ] Placeholder or `unimplemented` executors fail Engine-executable status.
- [ ] Lock, lease, and write policies are explicit.
- [ ] CLI mapping exists for every required operation.
- [ ] IPC support or a documented transport waiver exists.
- [ ] Ownership evidence exists.
- [ ] Contract/golden evidence exists.
- [ ] No legacy fallback is reachable.
- [ ] Every visible product entry has E2E evidence; every non-visible operation has
  an explicit UI waiver where required.
- [ ] Provenance placeholders cannot be described as upstream parity.
- [ ] Failure output identifies the operation and missing evidence.

## Verification

Run the parity gate against all catalog rows, validate failure fixtures for each
evidence category, run CLI and generic IPC black-box tests, verify provenance,
run typecheck, and run `git diff --check`.

## Forbidden

- maintaining a second hand-written 33-row inventory;
- treating 33 CLI mappings as full parity;
- promoting local regression fixtures to upstream parity without provenance;
- adding fake UI to satisfy coverage;
- accepting a legacy fallback as adapter support.

## Out Of Scope

Changing operation semantics to make the gate pass belongs to the owning Engine
slice. The visible Container Generation workflow belongs to S6.

## Blocked By

- #69 (S2).
- #70 (S3).
- #71 (S4).

---

# S6: Cut Fill With AI Over To Atomic Container Generation

## Title

`[S6] Cut Fill with AI over to atomic Container Generation`

## Parent

- Parent Epic: #67
- Decision coverage: #35, #38, and #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Replace the visible container `Fill with AI` legacy prompt path with a typed
renderer generation intent that crosses preload/IPC and agent/system adapters,
invokes `executeOperation("scryer.container.fill", ...)`, observes edit lease and
Completion Gate behavior, refreshes the Architecture view, and displays the final
visible state.

## Accepted Decisions

- The renderer expresses intent and lifecycle; it does not build a Scryer
  proposal or own generation semantics.
- The agent/system adapter invokes the catalog operation.
- Prompts and adapters do not instruct or retry `set_node`.
- Lease authorization remains trusted and token-free at renderer-facing seams.
- The Completion Gate owns final success or attention state.
- Watcher/view refresh follows Engine-owned file effects.
- Product integration requires visible Electron E2E, not only IPC tests.

## Files To Inspect First

- shared Scryer prompt construction
- renderer Architecture `Fill with AI` action
- preload Architecture interface
- main-process Architecture IPC
- agent runtime/system adapter
- edit-session controller and Completion Gate
- Architecture view watcher/refresh path
- existing Architecture Electron E2E fixtures

## Implementation Scope

- define the renderer generation intent;
- connect preload/IPC transport;
- connect agent/system execution;
- replace legacy prompt instructions;
- expose start, progress, validation failure, cancel, conflict, completion, and
  attention states;
- refresh the visible model after Engine-owned effects;
- add live Electron coverage.

## Commits

1. Introduce the typed generation intent.
2. Connect preload/IPC transport.
3. Connect the agent/system Engine adapter.
4. Replace legacy prompt instructions.
5. Connect visible lifecycle and Completion Gate state.
6. Connect watcher/view refresh.
7. Add success/file-effect E2E.
8. Add failure/cancel/completion/conflict E2E.
9. Remove remaining product-path `set_node` fallback.

## Acceptance Criteria

- [ ] The visible action invokes `scryer.container.fill` through the Engine seam.
- [ ] No default prompt directs the agent to `set_node` for container generation.
- [ ] Engine failure does not trigger legacy retry.
- [ ] Renderer/preload DTOs contain no lease token.
- [ ] Start and progress are visible.
- [ ] Validation failure is visible and leaves no partial state.
- [ ] Cancellation cleans up the session and is visible.
- [ ] Agent completion passes through the Completion Gate.
- [ ] Lease conflict is visible without token disclosure.
- [ ] Successful committed/planned file effects are asserted.
- [ ] Watcher/view refresh displays the new generated subtree.
- [ ] Final success appears only after the Completion Gate passes.

## Verification

Run renderer/preload/IPC adapter tests, agent/system adapter tests,
lease/completion integration tests, Electron E2E for every lifecycle state,
file-effect fingerprints, view-refresh assertions, typecheck, lint, and
`git diff --check`.

## Forbidden

- renderer-owned proposal validation or id minting;
- prompt-directed `set_node` generation;
- legacy retry after Engine failure;
- renderer-visible lease tokens;
- terminal success before Completion Gate evaluation;
- tests that stop at mocked IPC without observing the visible product path.

## Out Of Scope

Other visible operation entrypoints and non-container generation features are not
part of this cutover.

## Blocked By

- #69 (S2).
- #70 (S3).
- #71 (S4).
- #72 (S5).

---

# S7: Run The Exact-Tree Release Gate And Assemble Reviewable Commits

## Title

`[S7] Run the exact-tree Scryer release gate and assemble reviewable commits`

## Parent

- Parent Epic: #67
- Decision coverage: #36 and #39
- Work set: `docs/prd/orca-scryer-full-parity-convergence-work-set.md`

## What To Build

Produce the final evidence and review shape for the converged Scryer slice. Run
all focused and product gates on one exact tree, review cycle and change impact,
update every evidence-bearing document, and assemble four reviewable commit
groups without claiming that unlanded groups are complete.

## Accepted Decisions

- Verification evidence belongs to one exact commit or identified dirty tree.
- There is no partial pass for a release-critical gate: it is covered, a gap, or
  explicitly scoped out by a binding decision.
- Known unrelated failures require an existing tracking issue and evidence.
- Final review includes semantic ownership and no-fallback inspection, not only
  test counts.
- Commit groups are Engine implementation, Engine tests/parity,
  adapters/product integration, and decision/execution documentation.
- Human review owns the final landing/ref claim.

## Files To Inspect First

- all S1-S6 test and evidence outputs
- Decision Map #26-#39
- Architecture zero-partial audit
- operation parity document
- convergence task matrix
- migration status document
- changed-symbol and affected-process reports

## Implementation Scope

- run and repair final gates;
- document exact commands and results;
- reconcile Decision Map and task status;
- review affected execution flows;
- split the dirty tree into reviewable commit groups;
- prepare final landing evidence.

## Commits

1. Repair any remaining focused Engine/transaction/ownership failures.
2. Repair any remaining adapter/parity failures.
3. Repair typecheck/lint/cycle failures.
4. Repair release-critical Electron E2E failures.
5. Update exact-tree evidence and status documents.
6. Assemble Engine implementation commits.
7. Assemble Engine tests/parity commits.
8. Assemble adapter/product commits.
9. Assemble documentation commits.

## Acceptance Criteria

- [ ] S1-S6 are closed with exact-tree evidence comments.
- [ ] Focused Engine and operation tests pass.
- [ ] Transaction and no-partial-write tests pass.
- [ ] Ownership and no-fallback tests pass.
- [ ] CLI and generic IPC adapter tests pass.
- [ ] The catalog-derived 33-operation gate passes.
- [ ] Node/CLI/Web typecheck passes.
- [ ] Lint passes without Scryer `max-lines` disables.
- [ ] Release-critical Electron E2E passes.
- [ ] `git diff --check` passes.
- [ ] GitNexus cycle check passes.
- [ ] GitNexus impact review finds no unreviewed legacy bypass.
- [ ] Decision Map, migration docs, task matrix, issue state, commit SHAs, and
  target refs agree.
- [ ] Four reviewable commit groups exist.
- [ ] Partial groups are not described as fully landed.
- [ ] Any scoped-out workflow has a binding decision and explicit follow-up.

## Verification

Record the exact tree, every command, pass/fail result, skipped gate, related
issue, GitNexus cycle output, and affected-process review in the issue. Re-run
any gate invalidated by commit reordering or conflict resolution.

## Forbidden

- combining evidence from different trees;
- calling an issue closed because test files exist;
- ignoring a failed release-critical gate;
- silently scoping out a product workflow;
- claiming landing before the commits are reachable from the named ref;
- force-cleaning or deleting dirty reference worktrees during release assembly.

## Out Of Scope

New feature work and unrelated repository-wide failures are not part of this
release gate. Track unrelated failures separately with evidence.

## Blocked By

- #68 (S1).
- #69 (S2).
- #70 (S3).
- #71 (S4).
- #72 (S5).
- #73 (S6).
