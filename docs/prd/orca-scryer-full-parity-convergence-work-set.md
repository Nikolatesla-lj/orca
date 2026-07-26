# PRD: Orca Scryer Full-Parity Convergence And Landing Work Set

Status: Published as GitHub PRD #67; implementation open
Date: 2026-07-14
Last updated: 2026-07-15
GitHub Parent: https://github.com/Nikolatesla-lj/orca/issues/67

## Source

This work set operationalizes the binding decisions in
`docs/orca-scryer-decision-map.md`, especially Decisions #26, #27, #28, #34,
#35, #37, #38, and #39.

It does not redefine the 33 operation contracts already documented in
`docs/scryer-cli-tool-parity.md` or the historical operation-migration PRDs.
Those documents remain contract and provenance references. This work set is the
current execution authority for convergence, verification, product cutover, and
landing.

## Problem Statement

The active Orca Scryer worktree contains valuable Engine, CLI, IPC, parity, and
Container Generation work, but the slice is not ready to be called complete or
landed. The current tree still has structural blockers, known Container
Generation invariant gaps, incomplete edit-lease and Completion Gate ownership,
legacy semantic compatibility paths, incomplete machine parity evidence,
untrusted upstream fixture provenance, and a visible `Fill with AI` workflow that
still instructs the agent to use legacy `set_node` semantics.

The work is also distributed across committed code, dirty working-tree code,
historical design documents, and a second dirty reference worktree. Without one
bounded work set, later implementation agents can mistake test presence for
verification, working-tree code for landed code, or adapter coverage for product
integration.

## Scope Decision

Freeze Scryer feature expansion and converge the current slice through seven
ordered child issues:

1. clear structural blockers;
2. close Container Generation invariants;
3. complete edit-lease and Completion Gate ownership;
4. retire legacy semantic ownership;
5. build the catalog-derived 33-operation machine gate;
6. cut the visible `Fill with AI` workflow over to `scryer.container.fill`;
7. run the exact-tree release gate and assemble reviewable commits.

The native Engine seam remains intentionally small:

- reads cross `readView(...)`;
- catalog operations cross `executeOperation(...)`;
- CLI, IPC, renderer, agent runtime, and compatibility code remain adapters;
- Engine modules own planned/committed semantics, source routing, id minting,
  group/link legality, transactions, lease policy, fold behavior, and result
  envelopes.

## Current Baseline

As of 2026-07-15:

- active worktree: `orca-scryer-release-gate-clean`;
- checked-out branch: `scryer/convergence-integration`;
- original committed base: `eca93d0954da7fae297a0f1390f1427cc6167ff4`;
- local preservation checkpoint:
  `227cc8b16906733ac3a37f78a2d9320577d33d93`;
- the checkpoint contains the pre-convergence Container Generation, Engine
  contracts/schemas/catalog, CLI/IPC adapter tests, and local regression fixtures;
- the checkpoint is local-only, not pushed, not landed, not release-ready, and
  not final verification evidence;
- the visible container `Fill with AI` path still directs the agent to legacy
  `set_node` behavior.

### Checkpoint Baseline Evidence

The exact checkpoint code passed:

- 39 focused Engine/Container Generation tests across seven files;
- 39 focused CLI/IPC tests across five files;
- Node, CLI, and Web typecheck;
- targeted oxfmt on 21 files;
- targeted React Doctor;
- 22 existing Architecture Electron E2E tests after a fresh e2e build in 8.3
  minutes;
- `git diff --check`.

The checkpoint did not pass the convergence/release lint gate. Targeted oxlint
reported 52 findings: 29 Node protocol imports, 20 array-style findings, and 3
max-lines failures. Switch exhaustiveness also reports one failure in unchanged
baseline code. Nine Scryer max-lines suppressions, the planner literal NUL, six
Container Generation invariant gaps, `lease: 'none'`, two `0000000` provenance
fixtures, and the missing catalog-derived 33-operation gate remain open.

These results establish a reproducible implementation baseline only. They do not
promote S2 to verified, S6 to product-integrated, or any slice to landed.

## Status Definitions

The task matrix and issue comments must use evidence-bearing states:

- **Declared**: the contract and acceptance criteria exist.
- **Working-tree implemented**: implementation exists only in a dirty local tree.
- **Committed at `<sha>`**: the implementation is present in an identified commit.
- **Verified by `<gate>`**: the named gate passed on the same exact tree.
- **Adapter verified**: required transport adapters cross the Engine seam and
  prove Engine-owned effects.
- **Product-integrated**: a real visible product path completes through the Engine
  seam with observable lifecycle and file effects.
- **Landed on `<ref>`**: the identified implementation commit is reachable from
  the named target ref.

No later state may be inferred from an earlier one. A test file is not a passing
gate, 33 CLI mappings are not full parity, and a dirty implementation is not a
landed feature.

## Binding Architecture Decisions

### Deep modules and locality

Keep operation files thin. Split oversized contract, schema, catalog, and
planning hubs into focused deep modules whose interfaces expose behavior rather
than internal assembly steps. Do not create vague `helpers`, `utils`, `common`,
or equivalent dumping-ground modules.

### One semantic owner

The Engine is the only Scryer state-semantics owner. Adapters may translate
names, transport DTOs, and renderer-facing shapes, but they may not retry a
failed Engine operation through legacy model-store, MCP, raw-document, or C4
round-trip behavior.

### Atomic primary state

Operations that change committed and planned state must validate the final
snapshots and write them as one primary transaction. History and maintenance
artifacts may be best-effort sidecars only when their contract explicitly says
so. A failed primary write must leave no partial semantic state.

### Lease and completion ownership

All committed/planned semantic writes, including `scryer.model.set` and
`scryer.container.fill`, must honor the active edit lease. Lease tokens stay in
trusted main-process/controller/Engine context and never enter renderer DTOs,
prompts, logs, generic IPC requests, or error envelopes.

Agent process completion is not Scryer completion. The required lifecycle is:

`agent done -> plan.pending -> model.validate -> Completion Gate -> fold | nothing_to_fold | needs_attention -> visible final state`

A blocker must prevent terminal success, workflow cleanup, and sync/drift
baseline advancement.

### Product cutover

The visible container-generation workflow must invoke
`executeOperation("scryer.container.fill", ...)` through adapters. It must not
instruct the agent to use `set_node`, retry `set_node` after Engine failure, or
reimplement generation semantics in the renderer.

## Reference Worktree Disposition

`orca-scryer-sync` is a read-only migration reference, not an active development
branch. Do not continue development there, commit it wholesale, merge it as a
branch, or cherry-pick its dirty tree as a unit.

The following behaviors and test intentions may be rewritten against the active
Engine interfaces:

| Reference evidence | Owning slice |
| --- | --- |
| lease-token redaction | S3 |
| `model.set` active-lease policy | S3 |
| edit lease, controller, Completion Gate, cancel, and crash tests | S3 |
| committed-plus-planned generation emptiness | S2 |
| generated group `parentNodeId` | S2 |
| whole-symbol plain-responsibility anchors | S2 |
| executor-warning pre-commit validation | S4 |
| state-store final-snapshot validation | S4 |
| Architecture static ownership tests | S4 |
| internal model-file filtering | S4 |

The following reference behavior must not be migrated:

- legacy C4 model round trips;
- the old `mode` / `fullModel` read stack;
- legacy raw-document fallback;
- old MCP dispatch that maps strict operations back to `set_node`;
- placeholder fixtures described as upstream parity without real provenance;
- the older single-file edit-session controller design.

The dirty reference worktree becomes eligible for a separate, explicitly
approved cleanup only after every unique path is classified, the accepted
behaviors are rewritten and verified in the active worktree, and no unclassified
content remains. Never force-delete, reset, clean, or auto-stash that worktree.

## Work Slices

| Slice | Outcome | Execution | Current planning status | Blocked by |
| --- | --- | --- | --- | --- |
| S1 | Split Engine contract hubs and clear structural blockers | AFK | Open; blocker-bearing checkpoint preserved | None |
| S2 | Close atomic Container Generation invariants | AFK | Locally checkpointed with known blockers; not verified | S1 |
| S3 | Complete edit-lease and Completion Gate ownership | AFK | Partial | S1 |
| S4 | Retire legacy semantic ownership and harden state validation | AFK | Partial | S1, S3 where completion paths overlap |
| S5 | Add the catalog-derived 33-operation parity gate | AFK | Local regression evidence checkpointed; machine gate absent | S2, S3, S4 |
| S6 | Cut the visible `Fill with AI` workflow over to Container Generation | AFK | Declared, not product-integrated | S2, S3, S4, S5 |
| S7 | Run the exact-tree release gate and assemble reviewable commits | HITL | Declared | S1-S6 |

## Slice Definitions

### S1: Split Scryer Engine Contract Hubs

Remove Scryer `max-lines` disables, split oversized types/schemas/catalog/planner
modules into focused deep modules, eliminate the known import cycles, and remove
literal NUL bytes. Preserve the external Engine seam and operation contracts.

Exit gate:

- no Scryer `max-lines` disable remains;
- target import cycles are absent;
- TypeScript source contains no literal NUL;
- focused tests and typecheck pass after each extraction;
- no new vague module names or parallel semantic owners are introduced.

### S2: Close Container Generation Invariants

Make `scryer.container.fill` honor the full Decision #34 contract: effective-state
emptiness, thin-symbol source identity, group ownership, whole-symbol anchors,
partial build-edge evidence, atomic primary state, strict final validation, and
active-lease enforcement.

Exit gate:

- every invariant has an interface-level focused test;
- transaction failures leave no partial committed/planned state;
- generated source maps and groups preserve ownership and identity;
- the operation is Engine executable through the catalog with strict schemas.

### S3: Complete Lease And Completion Gate Ownership

Protect all semantic writes with the active lease, redact authorization material,
reject renderer-supplied authorization fields, connect the controller to the
native agent runtime, and make the Completion Gate own terminal Scryer state.

Exit gate:

- lease conflict and matching-token paths are covered;
- renderer, preload, logs, prompts, and errors are token-free;
- `nothing_to_fold`, warnings-only, blockers, destructive risk, cancel, and crash
  paths have focused tests;
- a blocked gate cannot produce a terminal success state.

### S4: Retire Legacy Semantic Ownership

Convert or delete remaining legacy semantic paths in sync, MCP, Architecture IPC,
preload compatibility channels, and Architecture adapters. Add final-state and
warning validation so malformed output cannot partially write semantic state.

Exit gate:

- default Scryer 0.3 paths use only `readView(...)` or `executeOperation(...)`;
- Engine failure never triggers legacy retry;
- unsupported legacy aliases are rejected explicitly;
- static ownership tests prevent renderer/raw-document/legacy semantic bypass;
- invalid warnings or final snapshots leave primary state unchanged.

### S5: Add The Catalog-Derived 33-Operation Gate

Generate machine evidence from the catalog for schemas, executors, policies,
transport mappings or waivers, ownership, contracts/goldens, legacy-fallback
absence, and product-entry coverage or UI waivers. Repair golden provenance with
a real upstream revision and independently generated expected state.

Exit gate:

- all 33 operation rows are derived from the catalog;
- missing evidence fails the gate;
- the report separates declared, Engine executable, adapter verified,
  product-integrated, and landed states;
- no placeholder upstream revision is reported as parity.

### S6: Cut Over `Fill with AI`

Replace the visible container generation prompt path with a renderer intent,
preload/IPC adapter, agent/system adapter, Engine transaction, watcher/view
refresh, Completion Gate result, and visible final state.

Exit gate:

- the visible workflow calls `scryer.container.fill` through the Engine seam;
- no prompt or fallback directs the agent to `set_node`;
- Electron E2E covers start, success, validation failure, cancellation, agent
  completion, lease conflict, file effects, refresh, and final visible state.

### S7: Prove And Land The Convergence Slice

Run all required gates on one exact review tree, update evidence-bearing status,
and assemble the work into four reviewable commit groups without upgrading the
status of work that has not landed.

Exit gate:

- focused Engine, transaction, ownership, adapter, and parity tests pass;
- Node/CLI/Web typecheck and lint pass;
- release-critical Electron E2E passes;
- `git diff --check` passes;
- GitNexus cycle and impact checks pass;
- Decision Map, migration docs, task matrix, commit SHAs, and target refs agree.

## Dependency Graph

```text
S1
├── S2
├── S3
└── S4 (completion-path changes wait for S3)
     │
     └── S5 (also waits for S2 and S3)
          └── S6
               └── S7
```

The Parent Epic is an ownership relationship, not an artificial runtime
blocker. Child issues record real implementation dependencies in both their body
and the task matrix.

## Shared Completion Definition

A child issue is complete only when all of the following are true:

1. its acceptance criteria are satisfied through the documented Engine or
   product interface;
2. focused behavior tests cover success, validation, and failure paths;
3. no adapter owns or retries semantic behavior;
4. primary writes are atomic and warning/maintenance side effects follow their
   declared policy;
5. the named verification commands pass on one exact tree;
6. a test-result comment records the commit/tree and commands;
7. documentation status is updated without claiming later maturity states;
8. the issue is linked to the Parent Epic and its dependency status is current.

## Verification Gates

The final verification issue owns the complete command set, but each child must
run the smallest relevant subset after every small commit.

Required final categories:

- focused Engine and operation tests;
- transaction and no-partial-write tests;
- architecture ownership/static tests;
- CLI and generic IPC adapter tests;
- catalog-derived parity gate;
- Node, CLI, and Web typecheck;
- lint and source-format checks;
- release-critical Electron E2E;
- `git diff --check`;
- GitNexus cycle check;
- GitNexus changed-symbol and affected-process impact review.

A known unrelated failure must be recorded with its existing issue and evidence.
It may not be silently treated as a passing Scryer gate.

## Reviewable Commit Groups

After S1-S6 pass their focused gates, S7 assembles four reviewable groups:

1. Engine implementation and structural convergence;
2. Engine tests, transactions, ownership, parity, and provenance;
3. CLI/IPC/agent/renderer adapters and product integration;
4. Decision Map, migration, work-set, issue, task, and evidence documentation.

Within each group, use the smallest behavior-preserving commits possible. Each
commit must leave the exercised code in a working state. A partial commit or
partial landing does not promote the remaining groups.

## Issue Publication Policy

The work set is published to `Nikolatesla-lj/orca` as Parent PRD #67 and child
issues #68-#74.

Publication labels:

- Parent: `prd`, `enhancement`, `needs-triage`;
- Child: `task-slice`, `enhancement`, `needs-triage`, and `pipeline:prd-67`.

After triage, replace `needs-triage` with `ready-for-agent` only when the issue is
unblocked and fully specified. Do not mark all children ready merely because
their bodies exist.

All seven children are linked through GitHub sub-issue relationships. Explicit
Parent and Blocked By links remain in issue bodies for portability to other git
providers.

## Non-Goals

- No new Scryer operation or Architecture product feature.
- No redesign of the 33 operation contracts.
- No second state store, catalog, pipeline, or generation implementation.
- No restoration of legacy C4 round trips or raw-document semantics.
- No fake renderer UI for CLI/agent-only operations.
- No automatic cleanup of dirty worktrees or branches.
- No commit, merge, push, or target-ref status claim as part of design-document
  publication.
- No claim that current dirty-tree tests remain valid after convergence without a
  rerun on the exact review tree.

## Historical And Supporting Documents

- `docs/orca-scryer-decision-map.md` — binding decisions and evidence states.
- `docs/scryer-cli-tool-parity.md` — 33-operation inventory and contract map.
- `docs/prd/orca-scryer-operation-migration-work-set.md` — historical migration
  specification and parity reference.
- `docs/prd/orca-scryer-operation-migration-issue-slices.md` — historical issue
  slices; do not republish without re-verification.
- `docs/prd/orca-scryer-engine-catalog-foundation.md` — historical foundation
  specification.
- `docs/orca-scryer-architecture-slice-audit.md` — zero-partial Architecture
  product release audit.
- `docs/orca-scryer-migration.md` — migration history; current execution status
  is maintained by this work set and its task matrix.
