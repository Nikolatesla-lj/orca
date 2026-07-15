# Orca Scryer Decision Map

This map is the compact planning authority for the Orca Scryer migration. Linked ADRs and design assets contain supporting detail; do not copy those assets into this map.

Assets:
- [Glossary](../CONTEXT.md)
- [Operation and command parity map](./scryer-cli-tool-parity.md)
- [Migration plan](./orca-scryer-migration.md)
- [UML gap analysis](./orca-scryer-uml-gap-analysis.md)
- [First implementation PRD](./prd/orca-scryer-native-engine-first-slice.md)
- [Engine catalog foundation PRD](./prd/orca-scryer-engine-catalog-foundation.md)

Status terms in this map are evidence-bearing and independent:

- **Working-tree implemented** means the implementation exists only in the current
  tracked or untracked working tree.
- **Committed at `<sha>`** means a named commit contains the slice.
- **Verified by `<gate>`** means the named acceptance gate passed on that exact
  tree or commit; the existence of test files is not verification.
- **Landed on `<ref>`** means the containing commit is reachable from the named
  target ref.
- **Product-integrated** means a real visible product entrypoint crosses an Orca
  adapter into `readView(...)` or `executeOperation(...)` and completes the
  user-observable workflow.

## #1: Native TS/Node Engine Or Rust Sidecar?

Blocked by:
Type: Discuss

### Question

Should Orca call a packaged Rust Scryer engine, or implement the Scryer engine natively in Orca?

### Answer

Use a Native TypeScript/Node Scryer Engine inside Orca. Rust upstream remains the semantic reference, but the product runtime must share Orca's packaging, IPC, UI refresh, tests, and agent runtime integration. See [ADR 0007](./adr/0007-implement-scryer-engine-natively-in-typescript.md).

## #2: What Is The Canonical Scryer Model?

Blocked by: #1
Type: Research

### Question

Should Orca keep its current `C4ModelData` shape, or adopt upstream Scryer 0.3 `ScryModel` directly?

### Answer

Use upstream Scryer 0.3 `ScryModel` as canonical. Pre-0.3 data can only enter through explicit import tooling; normal runtime reads and writes do not use a compatibility model. See [ADR 0009](./adr/0009-use-scryer-0-3-model-as-canonical-engine-model.md) and [ADR 0010](./adr/0010-follow-upstream-scryer-0-3-model-handling.md).

## #3: Where Do Orca View And Runtime States Belong?

Blocked by: #2
Type: Discuss

### Question

Should Orca UI layout, selection, flow editor data, and agent run state be stored inside `ScryModel`?

### Answer

No. `ScryModel` holds architecture truth only. Orca view state, extension state, render cache, and runtime state stay outside the Scryer model. See [ADR 0011](./adr/0011-keep-orca-view-and-runtime-state-outside-scrymodel.md).

## #4: How Are Planned And Committed Model Changes Separated?

Blocked by: #2, #3
Type: Research

### Question

Which actions write planned state, which actions write committed state, and how does Orca prevent stale writes during agent runs?

### Answer

Preserve upstream planned/committed semantics. Draft edits write planned state; implemented folds, extraction, corrections, and drift verdicts are explicit committed-changing actions. Orca adds Model Edit Lease and Completion Gate enforcement. See [ADR 0012](./adr/0012-use-upstream-planned-committed-semantics-with-orca-gates.md).

## #5: What Owns Scryer State Semantics In Orca?

Blocked by: #1, #2, #4
Type: Discuss

### Question

Can CLI, IPC, UI, drift, and sync each handle their own Scryer model writes?

### Answer

No. The Native Scryer Engine is the only owner of Scryer state semantics. Product callers use the engine interface or typed wrappers; they do not write model files or duplicate state rules. See [ADR 0008](./adr/0008-native-scryer-engine-owns-state-semantics.md) and [ADR 0013](./adr/0013-use-native-scryer-engine-as-the-only-model-semantics-interface.md).

## #6: How Do Agents And Users Invoke Scryer Capabilities?

Blocked by: #5
Type: Discuss

### Question

Should Orca retain Scryer MCP as a product path, or expose Scryer through Orca's existing command surface?

### Answer

Expose Scryer through Orca-native `orca scryer <noun> <verb>` commands backed by the Native Scryer Engine. Upstream MCP names remain behavior anchors, not product commands. See [ADR 0004](./adr/0004-replace-scryer-mcp-with-orca-cli-tool-surface.md) and [ADR 0016](./adr/0016-use-orca-native-scryer-operation-and-command-names.md).

## #7: How Are Operation Names And Field Names Adapted?

Blocked by: #6
Type: Discuss

### Question

Should Orca rename upstream Scryer operation fields to match Orca naming style?

### Answer

Use Orca-native operation ids and CLI commands, but preserve upstream Scryer semantic field names inside engine contracts. Presentation aliases normalize before entering the engine. See [ADR 0016](./adr/0016-use-orca-native-scryer-operation-and-command-names.md) and [ADR 0020](./adr/0020-use-upstream-scryer-field-semantics-in-engine-contracts.md).

## #8: What Is The Engine Contract Surface?

Blocked by: #5, #7
Type: Discuss

### Question

What does every Native Scryer Engine operation need to declare and return?

### Answer

Each operation is a typed operation contract with input, success payload, error, transaction, authority, side-effect, parity, and transport metadata. Every operation returns the shared result envelope and receives explicit Orca operation context. See [ADR 0017](./adr/0017-use-typed-operation-contracts-as-scryer-engine-interface.md), [ADR 0021](./adr/0021-use-shared-operation-result-envelope.md), and [ADR 0022](./adr/0022-use-explicit-orca-operation-context-for-scryer-authority.md).

## #9: What Is The First Implementation Slice?

Blocked by: #8
Type: Discuss

### Question

Should implementation start by porting every upstream tool, or by proving a minimal semantic loop?

### Answer

Start with seven operations: model read, model validate, node update, link add, link delete, plan pending, and plan fold. This first slice is complete and live-tested; it proves the Native Scryer Engine seam, shared envelope, planned/committed files, lock/lease checks, CLI transport, IPC forwarding, and basic Architecture tab coexistence. See [ADR 0018](./adr/0018-land-first-operation-contracts-as-minimal-semantic-loop.md), [ADR 0019](./adr/0019-drive-first-operation-contracts-from-contract-matrix.md), and the [contract matrix](./scryer-cli-tool-parity.md#first-contract-matrix).

## #10: How Is Every Operation Executed Consistently?

Blocked by: #8, #9
Type: Discuss

### Question

Should every operation implement its own project resolution, lock, lease, validation, side effects, and envelope rules?

### Answer

No. Every operation runs through one contract-driven operation execution pipeline. Operation files own domain semantics only; the pipeline enforces cross-cutting rules. See [ADR 0023](./adr/0023-use-unified-operation-execution-pipeline.md) and the [pipeline asset](./scryer-cli-tool-parity.md#operation-execution-pipeline).

## #11: How Do Scryer Agent Runs Use Orca Runtime?

Blocked by: #5, #6
Type: Discuss

### Question

Should Scryer spawn Codex/Claude directly, or should Orca own agent runtime integration?

### Answer

Orca owns process launch, account state, terminal/runtime state, agent status, completion detection, orchestration context, and handoff. Scryer preserves only model-edit run semantics through `ScryerEditSessionController` over Orca's native agent runtime: lease binding, completion-gated folds, cancellation cleanup, and post-run planned pending / validation handoff. Background runs are the default, with visible handoff as an explicit mode. See [ADR 0002](./adr/0002-scryer-agent-runs-use-orca-execution-adapters.md) and [ADR 0003](./adr/0003-background-scryer-runs-with-visible-agent-handoff.md).

## #12: What Detailed Assets Guide Implementation?

Blocked by: #1, #2, #4, #8, #9, #10, #11
Type: Research

### Question

Where should detailed operation parity, migration status, and UI/backend gap analysis live?

### Answer

Keep the decision map compact and link detailed assets. Operation parity and contracts live in [scryer-cli-tool-parity.md](./scryer-cli-tool-parity.md); implementation status lives in [orca-scryer-migration.md](./orca-scryer-migration.md); UI/backend flow comparison lives in [orca-scryer-uml-gap-analysis.md](./orca-scryer-uml-gap-analysis.md).

## #13: What Remaining Frontier Blocks Implementation?

Blocked by: #12
Type: Discuss

### Question

How should Orca handle Scryer source-code licensing while preserving upstream behavior?

### Answer

Migrate Scryer functional semantics and reimplement the code in Orca-owned TypeScript/Node modules. Upstream Scryer remains the behavior, schema, and test reference, but Orca does not directly copy upstream implementation source into the product runtime. The first seven operation contracts established the original committed Engine slice; later issues track broader operation coverage, adapter migration, verification, and named-ref landing. See [ADR 0024](./adr/0024-reimplement-scryer-semantics-in-orca-owned-code.md).

## #14: Which Upstream Operations Remain In Orca Scope?

Blocked by: #9, #13
Type: Research

### Question

After the first seven-operation slice, which upstream Scryer MCP tools are still suitable to migrate into Orca-native operations?

### Answer

Migrate the remaining upstream model, read/query, structural write, source/group, intent, drift/health, and generation tools listed in [scryer-cli-tool-parity.md](./scryer-cli-tool-parity.md#operation-parity-map). The upstream behavior anchors are `crates/scryer-mcp/src/tools/read.rs`, `nodes.rs`, `links.rs`, `misc.rs`, `intent.rs`, `generation.rs`, request structs in `types.rs`, and core state behavior in `scryer-core/src/lib.rs`, `diff.rs`, `validate.rs`, `drift.rs`, `health.rs`, `build_edges.rs`, and `history.rs`. Do not migrate Scryer MCP as an Orca product path, the Tauri app shell, standalone AI provider settings, standalone docs/templates, or normal-runtime pre-0.3 auto-migration.

## #15: What Shared Foundation Must Expand Before Broad Operation Coverage?

Blocked by: #14
Type: Discuss

### Question

Can the next operations be added as one-off files, or must the Native Scryer Engine foundation deepen first?

### Answer

Deepen the engine foundation before broad coverage. Use the upstream operation migration list to define a runtime-enforced `ScryerOperationCatalog` with semantic capabilities, `zod` input/success/error-detail validation, and catalog-owned policy for state reads/writes, lock/lease, validation, and side effects. Success payload or error-detail schema failures are engine contract violations and map to `internal_error`. Do not add parallel engine audit, undo/redo, save, or recovery storage. Implement the 33-operation migration through deep modules for catalog, pipeline, state-store, diff/fold, id minting, validators, error mapping, and adapters rather than one-off operation files. The state-store is the transaction boundary for primary writes and best-effort maintenance warnings. The 33-operation catalog matrix is the implementation source for policy, schemas, operation-specific errors, and upstream anchors. Shared error taxonomy owns stable details schemas for common and operation-specific errors. Detailed schema, capability, state-store, diff/fold, anchors, history, build-edge, and sync-state rules live in the [engine catalog foundation PRD](./prd/orca-scryer-engine-catalog-foundation.md).

The schema field matrix is part of #15's foundation: zod input and success
schemas are implemented from declared fields, defaults, shared helper types, and
upstream field names rather than inferred inside operation files.

Engine operation inputs have one canonical field name per field. Upstream serde
aliases may be accepted at the catalog input boundary for compatibility, but the
pipeline normalizes them, rejects conflicting alias/canonical values, and
operation executors never see alias spellings.

The foundation also uses a canonical model boundary. Native engine modules
operate on `ScryModel` 0.3 and canonical operation inputs only. Legacy
`C4ModelData`, renderer node data, CLI flag objects, and upstream alias-shaped
payloads must be explicitly converted by adapters or catalog input normalization
before they reach executors, validators, state-store, diff/fold, or id-minter.
Field-name overlap with legacy Orca types is acceptable; semantic mixing across
the engine boundary is not.

Shared result types are part of the same foundation. Complex success payloads
such as read views, validation results, pending/fold results, intent added-item
results, health reports, drift scope results, and generation results are defined
once and composed into operation schemas.

The foundation PRD records the upstream implementation lessons that Orca should
reuse without copying source: project-local model references, full-cycle write
locks, planned fallback, single-home source mapping, shared diff/fold, link
legality, boundary ownership, drift scoping, build-edge evidence, id minting,
and best-effort history/baseline maintenance. It also defines the Engine
Foundation Interface Contract: module public interfaces, dependency direction,
legacy field mapping, upstream parity fixture production, current-code migration
roles, and readiness test suite mapping.

#15's interface contract resolves the remaining implementation ambiguities:
operation executors return only `ScryerExecutorResult<TResult>`; expected
domain failures return through the executor failure branch while unexpected
exceptions map to `internal_error`; `ScryerOperationResult<TResult>` is the
single public envelope; `error-mapper` owns failure-to-envelope conversion; the
pipeline converts successful `ScryerStateChanges` into a policy-checked
`ScryerStateCommitPlan`; `ScryerSourceRouter` owns single-home
`sourceMap`/`boundaries` routing; mixed operations such as `scryer.plan.fold`
use catalog policy branches instead of operation-local authorization logic;
deterministic `clock` and request-id factories are injected for tests; transport
metadata maps adapters without granting authority; parity cases load through a
zod-validated fixture loader; architecture ownership is checked by a static
import scanner; and simple success payloads use shared field names such as
`updatedCount`, `deletedCount`, `writtenCount`, `movedCount`, `addedIds`, and
`addedItems`.

Validator policy is part of that foundation: shared validators emit structured findings, `model.validate` reports committed-model warnings without failing, and write operations use catalog policy to turn selected findings into `validation_failed` blockers before state-store commit.

The foundation is complete only after the implementation readiness gate is green: catalog coverage, pipeline contract validation, state-store transaction tests, validators, id-minter, diff/fold, parity fixture harness, first-seven compatibility, and adapter ownership checks all pass.

## #16: How Should Read And Query Operations Migrate?

Blocked by: #15
Type: Research

### Question

Which remaining read operations should land together, and what upstream behavior must they preserve?

### Answer

Land a read/query slice centered on the Scryer Read Selector for model-state reads: one deep engine module turns canonical `ScryModel` state and read requests into validated overview, subtree, full-model, search, and query payloads. The slice covers `scryer.model.search`, `scryer.model.query`, `scryer.rules.read`, and `scryer.codebase.read`, while replacing the foundation-era `scryer.model.read` result with the formal Read Surface before adding the remaining read operations. `scryer.rules.read` and `scryer.codebase.read` are part of the same slice but remain sibling read executors because they read rules assets and the project tree rather than `ScryModel`. Preserve upstream drill-down behavior: default reads return overview, subtree is the normal detail path, search/query locate unknown nodes, full remains explicit for global/export/debug/compatibility/user-request cases, and no schema-level purpose field is required. CLI, IPC, UI, agents, and tests consume Read Selector payloads for model reads; adapters must not construct overview/subtree/search/query shapes from raw model files.

## #17: How Should Core Structural Writes Migrate?

Blocked by: #15
Type: Research

### Question

Which low-level write operations form the next core mutation slice after `node.update`, `link.add/delete`, and `plan.fold`?

### Answer

Land a structural write slice centered on a Scryer Structural Mutation Planner: one deep engine module turns requested structural edits into validated atomic mutation plans before state-store commits them. The slice covers `scryer.model.set`, `scryer.node.set-subtree`, `scryer.node.delete`, `scryer.node.move`, `scryer.node.descope`, `scryer.responsibility.move`, and `scryer.link.update`. Preserve upstream layer intent: generation primitives may write committed and planned when declared; ordinary draft edits write planned; `descope` is a model correction; deletion stages code-removal work until folded. The planner owns batch atomicity, hard-error versus warning classification, node/responsibility/link identity rules, and structural cleanup handoff to validators, source-router, diff/fold, and state-store. Operation executors express intent only; adapters and operation files must not own cleanup, source routing, link legality, fold cleanup, or partial-write recovery.

## #18: How Should Source And Group Ownership Migrate?

Blocked by: #15, #17
Type: Research

### Question

How should Orca migrate operations that own source anchors, boundaries, and group overlays?

### Answer

Land source/group operations together: `scryer.source.update`, `scryer.group.set`, `scryer.group.update`, and `scryer.group.delete`, but do not put their ownership rules directly in operation files. `scryer.source.update` is an operation entrypoint that validates a request to update responsibility anchors, schema anchors, and node boundaries; the `ScryerSourceRouter` owns the single-home routing rule. Entries for elements present in committed state are written to committed state and removed from planned state; entries for elements present only in planned state are written to planned state; empty source lists clear entries from the owning layer; fold writes selected planned source entries into committed state and deletes no-longer-needed planned entries. Missing responsibility ids, missing schema node ids, schema anchors on nodes without properties, missing boundary node ids, malformed input, and conflicting same-key updates are hard errors. Source quality issues such as whole-symbol ranges, absent symbols, unverified file patterns, or broad boundary globs may commit with structured warnings. Whole-symbol source ranges are normalized to symbol-only anchors and returned as warnings. Group operations should use a `ScryerGroupOwnershipPlanner`: a group is a secondary organization axis over sibling nodes in the `ScryModel` C4-style hierarchy, not node status and not the primary parent-child hierarchy. Group operations are semantic model edits and write planned state by default; they do not route between committed and planned or perform committed-side writes. `group.set` remains available as a high-risk generation primitive for raw group JSON, fixtures, migration, and repair, but ordinary agent edits should prefer typed group operations. Orca should enforce group structure more strictly than upstream's current `set_groups` implementation while preserving upstream tool intent: malformed JSON, empty arrays, duplicate group ids, missing or unknown `parentNodeId`, fewer than two members, unknown members, members outside the parent, mixed-level members, unknown `parentGroupId`, nested-group cycles, and duplicate group responsibility ids are hard errors. Missing descriptions, missing responsibilities, and unknown icon names may return warnings. `group.update` is patch-only: it may change name, description, member ids, and responsibilities, but it must not re-parent a group; future interactive re-parenting should be an explicit `group.move` rather than hidden inside update. The planner validates parent-level membership, same-level members, nested groups, group responsibilities, and delete behavior before producing a state-store commit plan. `group.delete` deletes only the target group, keeps member nodes and child groups, and clears `parentGroupId` on direct child groups. Renderer group overlays remain view-derived and do not own model semantics.

## #19: How Should Intent Writer Operations Migrate?

Blocked by: #15, #18
Type: Research

### Question

How should Orca migrate upstream's preferred agent authoring path for adding model elements from intent?

### Answer

Land intent writers as typed operation contracts: `scryer.person.add`, `scryer.system.add`, `scryer.container.add`, `scryer.component.add`, `scryer.group.add`, and `scryer.symbol.add`, implemented through a `ScryerIntentAuthoringPlanner`. Preserve upstream semantics from `intent.rs`: callers provide meaning and source context, while the planner uses the shared `ScryerIDMinter` to mint stable node, group, and responsibility ids, fixes kind from the operation name and parent level, mints responsibility ids across nodes and groups without collision, produces source/boundary update intents for symbol anchors and container boundaries, validates parent kind and group membership, and authors into planned state. The minter scans committed state, planned state, and current batch reservations; ordinary intent add inputs must not accept caller-supplied ids. Ordinary intent add inputs must not accept caller-supplied `kind`: `person.add` and `system.add` create top-level nodes; `container.add` requires a system parent; `component.add` requires a container parent; `symbol.add` requires a component parent; `group.add` creates a group over direct children of an existing parent node. Intent authoring rejects structurally unusable input: empty item arrays, blank names, missing or mismatched parents, invalid group members, blank symbol `sourceFile`, symbols with neither responsibilities nor properties, and blank property labels. It may commit with warnings for quality gaps such as missing descriptions, missing responsibilities on non-symbol nodes or groups, missing technology, skipped blank responsibility statements, incomplete line ranges, unverified source patterns, and absent `boundaryDir`. Multi-item intent add requests are atomic: the planner validates and plans the full batch before state-store writes anything, and any hard error prevents all nodes, groups, responsibilities, sourceMap entries, and boundaries from being committed. Successful intent add results return a structured `added` summary with minted ids, kind, name, parent ids, responsibility ids, property labels, source keys, boundary keys, warnings, and `recommendedNextReads`; they must not return a full model or require agents to parse prose. Responsibility input preserves upstream altitude rules: ordinary node/group add operations accept plain `string[]` responsibilities, while `symbol.add` accepts `string | { statement, line?, endLine? }` entries for line-precise anchors. Intent add must not accept responsibility directives; directives are user-authored constraints or later edits, not the normal agent add path. `external` is accepted only by `system.add` and `container.add`; other intent add inputs must reject it. Source and boundary updates produced by intent authoring go through `ScryerSourceRouter`; because the new elements are planned-only, they normally write planned state, but the routing rule stays centralized. Operation files only express the add intent and must not own id minting, parent/kind rules, responsibility construction, source/boundary side effects, result payload shape, or planned-state commit semantics. Agents should prefer these typed intent operations over raw `model.set`/`node.set-subtree` for interactive modeling.

## #20: How Should Drift And Health Operations Migrate?

Blocked by: #15, #16, #18, #19
Type: Research

### Question

How should Orca migrate the code-to-model drift loop and health reporting?

### Answer

Land `scryer.drift.get`, `scryer.drift.flag`, `scryer.drift.reconcile`, and `scryer.model.health` as one drift/health slice. Preserve upstream separation: `drift.get` crosses a `ScryerDriftScopeDetector` seam that reports boundary-owned scopes whose code changed since the last reconcile anchor; it is not a semantic verdict and must not write stale/vagrant flags or history events. The detector uses `.sync`, file mtimes, git changed-file refinement when a commit anchor exists, most-specific boundary ownership, and first-run bootstrap to avoid reporting the whole project as drifted. If no sync baseline exists, `drift.get` bootstraps sync and source-anchor baselines from the current code state and returns clean; this is a maintenance write, not proof that the model is semantically correct. The detector should preserve upstream internal support for per-node reconcile overrides in sync state and scope calculation, but #20 exposes only the upstream-compatible global `scryer.drift.reconcile`; a future ticket may add explicit node/subtree reconcile. `drift.flag` crosses a `ScryerDriftVerdictRecorder` seam that records reviewed semantic findings into planned state using vagrant responsibilities/properties/nodes, stale flags, stale proposals, source anchor intents, and history events while leaving committed state unchanged. Vagrant finding anchors must pass through `ScryerSourceRouter` rather than recorder-owned `sourceMap` layer routing. Planned-state verdict changes are the semantic source of truth and must commit atomically; history events are transactional sidecars when state-store supports them, otherwise best-effort maintenance writes after the planned commit with warning-on-failure. It must not detect changed files, decide code semantics by itself, advance reconcile anchors, or compute health rollups. `drift.reconcile` preserves upstream semantics: it advances the global sync anchor and source-anchor fingerprint baseline after review, but it does not schema-require reviewed scope ids or prove review happened. Tool guidance must state that callers should run it only after reviewing and flagging all scopes reported by `drift.get`; skipped changes will not resurface as old drift. `model.health` crosses a `ScryerHealthReporter` seam and is a read/report operation with declared maintenance writes: it may bootstrap sync/anchor baselines and perform upstream-compatible silent re-anchor, but it must not record semantic drift verdicts or write planned/committed model meaning. Health payloads must separate core observability fields from conditional evidence: counts, vagrant/stale, anchor coverage, anchor observations, and next-read guidance are core; link audit, edge graph evidence, reanchored counts, and boundary dark files are included when their upstream evidence exists.

## #21: How Should Atomic Container Generation Migrate?

Blocked by: #15, #17, #18, #19
Type: Research

### Question

Should Orca implement `fill_container` as incremental intent calls, or preserve upstream's atomic generation primitive?

### Answer

Preserve `scryer.container.fill` as an atomic generation operation implemented through a `ScryerContainerGenerationPlanner`; the operation registry must mark it as a high-risk `generation_primitive`, with tool metadata guiding agents to use it only for initial code-to-model generation of an empty container. The target must be an existing container with no existing component children; filling an already-modeled component subtree is a hard error and belongs to an explicit replacement, repair, or regenerate operation. The engine validates one complete container proposal, mints ids against the union of committed and planned layers, fills the target container's component/symbol subtree in one plan, writes committed and planned consistently, creates groups through shared group ownership validation, writes source anchors, derives component/symbol links from `.scryer/.build_edges.json`, validates derived and optional links through shared link legality rules, drops unplaceable optional cross-boundary links as reported non-fatal output, and appends best-effort born/history events. Id minting uses the shared `ScryerIDMinter` seeded from committed state, planned state, and current batch reservations; proposals use request-local keys only and must not supply real model ids. Optional links are never allowed to reject an otherwise valid generation proposal: unknown endpoints, self-links, duplicates, illegal topology, and unplaceable cross-boundary links are dropped and returned in `droppedLinks`; structural proposal errors still fail the whole operation. Before any durable write, the planner must run shared model validators against the final committed/planned snapshots it intends to write; final snapshot validation failures are hard errors. Missing or ambiguous build-edge evidence is skipped rather than guessed and is reported through `reports.edgeGraphStatus`. Source anchors still cross `ScryerSourceRouter`, but generation policy differs from ordinary intent authoring: generated elements become committed and planned together, so anchors are written to committed state and mirrored into planned state to keep both layers aligned. Committed and planned writes must be represented as one state-store transaction: either both layers receive the generated subtree and mirrored anchors, or neither layer changes. Successful results return a compact structured generation summary shaped as `commit`, `summary`, `created`, `reports`, and `recommendedNextReads`; `reports` includes `droppedLinks`, `edgeGraphStatus`, and warning counts or evidence summaries, while structured warning objects live in `ScryerOperationResult.meta.warnings`. Results must not return the full model or require parsing prose. A generated component must include at least one symbol, but generated symbols may have no responsibilities or properties if they still have valid source identity; generation must not force agents to invent responsibility text for thin wrappers, re-exports, UI leaves, or entry points. Do not let an agent assemble this through many raw intent calls or raw structural writes. Tests should focus on the planner interface, with only thin engine pipeline smoke coverage for catalog, schema, result envelope, error mapping, and transaction behavior. Match upstream by not refreshing `model.baseline.scry` or advancing drift reconcile baselines in this operation.

## #22: How Do UI And Agent Runtime Move Behind The Expanded Engine?

Blocked by: #16, #17, #18, #19, #20, #21
Type: Discuss

### Question

When remaining operation coverage exists, how should existing Architecture UI, drift/sync helpers, and agent runtime code stop owning Scryer semantics?

### Answer

All product callers must cross the Native Scryer Engine seam through `readView(...)` or `executeOperation(...)`; UI, IPC, CLI, agent runtime, tests, and compatibility adapters may express user or agent intent, but they must not own Scryer model semantics. Move adapters in stages. First, `ArchitectureViewAdapter.readArchitectureView(...)` returns a UI-specific view DTO rather than raw `ScryModel`, mapping engine read results to renderer data while keeping selection, expanded path, layout, diff glow, and flow extension state outside `ScryModel`. Follow upstream Scryer v0.3: selected item, expanded ids, workspace view, and diagram focus live in UI state, while positioned diagram scenes are derived by a layout adapter and are not persisted into `.scryer/model.scry`. Next, UI intents call `executeOperation(...)` instead of mutating `C4ModelData` or calling legacy storage helpers; old model-store helpers may remain only as temporary compatibility scaffolding, not wrapped as a long-term semantic write path. CLI and IPC commands then route through the same catalog operation names, input/result schemas, result envelopes, and error mapping used by UI; transport flags, IPC channel names, progress events, and exit-code mapping are adapter details only. Then `ScryerEditSessionController` reuses Orca's native agent runtime instead of owning process launch, terminal/account state, model selection, generic run status, completion detection, or orchestration context; it owns only Scryer-specific lease binding, completion-gated fold coordination, Scryer lease cleanup on cancellation/crash, visible handoff mapping, post-run planned pending foldability / validation checks, and conversion of agent outcomes into engine reads or catalog operations. Finally, demote `mcp-tools.ts` to a thin compatibility adapter that only normalizes legacy entrypoints into `executeOperation(...)` or `readView(...)`; remove it or keep a pure shim once all product callers cross the engine seam. Adapter ownership tests must prove adapters convert and call the engine seam rather than reimplementing source routing, group/link legality, drift, fold, id minting, state-store commits, or runtime process ownership.

## #23: What Stays Out Of The Operation Migration?

Blocked by: #14
Type: Discuss

### Question

Which Scryer capabilities should not be migrated into the Orca Native Scryer Engine operation set?

### Answer

Keep these out of normal operation migration: Scryer MCP server as a product path, Scryer Tauri shell, standalone provider/settings UI, standalone docs/templates marketplace, implicit pre-0.3 model migration, audit/undo/redo/save/recovery storage, Rust sidecar runtime, and transport-specific hidden operation semantics. Audit, undo, redo, save, and recovery storage are not planned Scryer features; do not reserve engine interfaces, storage files, transaction hooks, or adapter flows for them unless a separate future PRD changes product scope. Scryer MCP server is fully excluded from the Orca product path: upstream MCP tools may remain behavior references, but Orca must not run that server or reserve parallel MCP-specific command contracts beside the Native Scryer Engine catalog. The upstream Scryer Tauri shell, provider/settings UI, and docs/templates marketplace are fully excluded app surfaces; Orca may build its own settings, template, or documentation surfaces later, but #16-#24 must not migrate or embed the upstream shell, UI, marketplace, routing, or release model. Rust sidecar runtime is fully excluded from the Orca product path: upstream Rust remains a behavior reference only, and Orca must not ship or reserve dual-runtime seams for a Scryer Rust sidecar. Do not consider old Orca/Scryer model compatibility in the normal product runtime: no implicit migration, no explicit import in this work set, no fallback parser, no best-effort field mapping, and no silent discard of legacy fields. Incompatible model reads return a structured `incompatible_model` error with detected/expected version or unknown-field details; they must not write model files, baselines, planned/committed state, or sidecars. These exclusions keep #16-#24 focused on the Orca-native engine catalog, shared engine modules, and adapters rather than migrating the whole upstream Scryer application.

## #24: How Should The 33-Operation Migration Be Implemented Safely?

Blocked by: #15, #17, #18, #19, #20, #21
Type: Discuss

### Question

How should Orca implement all 33 migrated operations without spreading state, fold, id, error, adapter, and parity logic across one-off files?

### Answer

Implement through deep Native Scryer Engine modules, not through one-off operation files. Operation files stay thin: receive catalog-validated input, call the appropriate planner/reporter/router/validator/shared module, and return the standard operation result. `catalog` and `pipeline` own operation metadata, policy, zod input/result/warning/error-detail validation, and result envelope checks. `state-store` owns transaction-like commits, best-effort maintenance warnings, declared sidecars, and all `.scryer/*` IO. `diff/fold` owns the complete element fold table for nodes, links, groups, properties, responsibilities, source entries, stale flags, and vagrant markers. `id-minter` owns upstream id formats and mints against committed plus planned state plus current batch reservations. `source-router` owns single-home `sourceMap` and `boundaries` routing. Validators and error mapping own structured semantic paths, warning/blocking classification, and failure taxonomy. CLI/IPC/UI remain adapters that cross `executeOperation(...)` or `readView(...)`. Tests prove upstream parity with fixtures, golden state assertions, illegal-input behavior, and representative adapter mapping rather than source similarity. See [ADR 0025](./adr/0025-use-deep-engine-modules-for-scryer-operation-migration.md).

Validators also own the warning-versus-blocking rule matrix. Operation files may call validators, but they must not invent ad hoc English validation messages or bypass the shared semantic path format.

Parity fixtures compare structured behavior against upstream anchors: operation success/error envelope fields, committed/planned Scryer file results, warning/error detail codes, semantic paths, structured details, diff/fold output state, sourceMap/boundary ownership, and illegal-input failure classification. They do not compare Rust source, MCP natural-language messages, request ids, timestamps, absolute paths, JSON key order, or non-semantic wording.

Broad operation migration starts only after the implementation readiness gate proves the shared modules and first seven catalog-routed operations are green. Implement remaining operations by dependency maturity, not raw tool-list order: stabilize catalog/pipeline/state-store/schema/error-mapper/id-minter/validators/source-router/diff-fold first; migrate read/query next; then structural/source/group/intent writes; then drift/health/container generation; finally adapters and remaining coverage. Mixed engine/legacy behavior paths are allowed only as short-lived compatibility for operations not yet registered in the catalog. Once an operation is cataloged, all callers for that operation must route through `executeOperation(...)` or `readView(...)`; the same operation must not retain both engine and legacy semantic implementations, and engine failures must not fall back to a legacy implementation. Failure should return the standard `ScryerOperationResult` error envelope so tests prove the engine path, not a hidden legacy rescue path. Final readiness checks require adapters not to bypass the engine seam and legacy semantic paths to be gone or pure shims. UI refactor readiness specifically requires adapter contract tests for `ArchitectureViewAdapter.readArchitectureView(...)`, view-state separation tests, UI write-intent tests through `executeOperation(...)`, legacy bypass/import tests, IPC bridge envelope tests, renderer DTO tests, agent-run UI lease/runtime tests, focused end-to-end smoke tests, and Electron Playwright live human-operation tests that drive real visible controls and prove reads/writes cross the engine seam. The implementation blueprint in the operation migration PRD turns these decisions into module interface drafts, catalog row requirements, test checklists, stable error/warning codes, fixture format, adapter mapping, UI live scenarios, and implementation issue templates. This prevents temporary operation-local rules from becoming hidden architecture.

## #25: How Do We Reconcile Docs With The Completed Operation Migration?

Blocked by: #24
Type: Maintenance

### Question

How should Orca keep the Scryer migration docs accurate when the stable
Architecture renderer path exists but full 33-operation engine, adapter, and
product parity are at different states?

### Answer

Update the linked migration status documents so they match current code, not the
older completion intent. The decision map remains the compact planning
authority, but `docs/orca-scryer-migration.md`,
`docs/orca-scryer-uml-gap-analysis.md`, PRD status notes, and issue-slice
summaries must distinguish three states:

- The 33 operation ids have catalog contracts, schemas, policies, and upstream
  anchors.
- The stable Architecture product path has executable operations and live UI
  coverage through #26-#29.
- Full Scryer operation parity is still open for the catalog-only operations
  that currently fall through to `unimplemented(...)`.

Do not use this ticket to add new Scryer behavior. Its purpose is documentation
correctness: remove stale claims that read/query, full structural mutation,
health, drift flag, and container generation are already executable when the
current code only registers their contracts. Keep explicit future work separate
from the completed Architecture integration slice.

Scope this ticket to repository docs only. The detailed status table belongs in
`docs/orca-scryer-migration.md`; this decision map should stay compact.
Acceptance means linked status docs no longer equate Architecture slice
completion with full Scryer operation parity, and every remaining executable,
adapter, and product-integration gap is assigned to tracked decision-map issues.
As of HEAD `eca93d095`, the #31 read, #32 structural, and #33 health/drift engine
slices are committed. #34 Container Generation and the current #35 CLI, IPC,
and regression-fixture increments are only working-tree implemented. Their
verification, landing, and visible product integration remain separate gates.
Verification for this maintenance decision is documentation-level:
`git diff --check` plus targeted stale-phrase searches.

## #26: How Should Legacy Scryer Semantic Paths Be Retired?

Blocked by: #24
Type: Discuss

### Question

Which old Scryer model read/write paths can remain, and which must stop owning model behavior after cataloged operations have moved behind the Native Scryer Engine?

### Answer

Retire legacy semantic ownership by turning old paths into compatibility adapters or deleting them. `model-store.ts`, `model-store-core.ts`, `mcp-tools.ts`, legacy drift/sync helpers, IPC handlers, and renderer code may still handle file management, old command names, prompt preparation, test fixtures, notifications, and UI compatibility. They must not decide Scryer business rules for cataloged operations: planned versus committed writes, source-map ownership, group/link validation, drift verdicts, fold behavior, id minting, lock/lease policy, or result/error envelopes.

For every cataloged operation, product callers must route through `executeOperation(...)` or `readView(...)`. If an engine operation fails, adapters must return the engine result; they must not silently retry the old implementation. Keep ownership tests and focused adapter tests that fail if legacy files import engine internals, write `.scryer/*` directly for migrated operations, or bypass the public engine seam.

Implementation status: partial. Main-process default model reads, node patching,
drift reads, and drift reconcile cross the Native Scryer Engine seam without an
`incompatible_model` retry through legacy helpers. Catalog-backed aliases such
as `update_nodes` and `add_edges` call engine operations, while unsupported
strict-model aliases such as `add_nodes` are rejected. However, `sync.ts`,
`mcp-tools.ts`, and main/preload compatibility adapters still require ownership
and no-fallback proof for the default Scryer 0.3 path. They may retain file or
name adaptation, but must not select a second semantic implementation, write
planned/committed meaning directly, or treat an engine error as permission to
retry legacy storage.

## #27: How Should Scryer Agent Runs Complete Safely In Orca?

Blocked by: #22, #24
Type: Discuss

### Question

When an Orca agent edits a Scryer model, what should happen before Orca treats the run as complete?

### Answer

Use an Orca-owned `ScryerEditSessionController` for Scryer model-edit sessions. This is an in-process application service / workflow coordinator, not a microservice, not a second agent runtime, and not a second Scryer engine. Orca still owns process launch, terminal state, account state, generic agent status, cancellation, and crash/done detection. The controller owns only Scryer model-edit safety: binding an edit lease to the agent run, blocking conflicting semantic writes while the lease is active, cleaning up the lease on completion/cancel/crash, running the completion gate after the agent stops, and returning a UI-ready completion result.

The controller should expose a small interface: `beginAgentEditSession(...)`, `completeAgentEditSession(...)`, `cancelAgentEditSession(...)`, and `readEditSession(...)`. It depends on the public Native Scryer Engine seam (`executeOperation(...)` and `readView(...)`), a small Orca agent-run status interface, a clock, an id/token source, and a lease-store seam. It must not start agent processes, supervise terminals, select accounts, stream logs, directly write `.scryer/model.scry` / `.scryer/planned.scry`, or import engine internals.

Edit leases are session/concurrency state, not modeling operations. Lease lifecycle
stays outside the operation catalog behind a small `ScryerEditLeaseStore`, while
lease enforcement stays inside engine/state-store write policy. A lease is stored
under `.scryer` while active and contains only small control data such as token,
owner, agent run id, `createdAt`, and optional `expiresAt`. Every operation that
changes committed or planned model meaning must require the matching token while
a lease is active, including high-risk whole-model and generation writes such as
`scryer.model.set` and `scryer.container.fill`. Reads, validation, pending checks,
prompt preparation, and view-only UI state are not blocked by the lease.

The lease token is trusted main-process context, not renderer-facing state.
`ScryerEditSessionController` and engine/state-store policy may read and pass the
token through `ScryerOperationContext`, but React, preload DTOs, DOM state, logs,
prompts, and generic renderer IPC inputs must not expose or accept it. Renderer-
facing operation and edit-session DTOs are closed schemas: `leaseToken`, internal
lease ids, and unknown authorization fields are rejected at the IPC seam rather
than silently stripped. `beginAgentEditSession(...)` returns only token-free
session identity, `readEditSession(...)` returns sanitized status, and
`completeAgentEditSession(...)` resolves the token internally before crossing
the engine seam. This keeps the module deep: callers learn "begin, complete,
cancel, read status", not token lifecycle or write-authorization rules.

An agent process reporting `done` is not the same as Scryer work being complete.
It only begins completion evaluation. After `done`, the controller must check
planned state through `scryer.plan.pending` and `scryer.model.validate`. The
completion gate must not require `pending.total === 0`; planned changes are
expected after an edit session. Instead, it decides whether pending changes are
foldable: every change kind is known to diff/fold, no blocking validation finding
exists, no dangling link/source/group/member reference exists, no lease conflict
exists, and verified-state contract gates are satisfied. Warnings and
destructive-but-valid changes may still be foldable, but the result must surface
warning/risk details to UI. `pending.total === 0` means `nothing_to_fold`, not
failure. Renderer and legacy sync adapters must not announce a terminal finished
state, clear the workflow, or advance a sync/drift baseline while the gate returns
`fix_validation`, `manual_review`, `blocked_by_lease`, or another blocker.

`completeAgentEditSession(...)` defaults to `foldPolicy: "never"` and returns a `CompletionGateResult`. Optional `foldPolicy: "when_gate_passes"` may call `scryer.plan.fold` only if the gate passes. Gate failure never folds. Force fold is a separate explicit human action through `executeOperation("scryer.plan.fold", ...)`, not an agent-controlled override.

Implementation slices:

- #27A Controller skeleton + completion gate evaluator: add `src/main/scryer/edit-session-controller.ts` and tests for no changes, foldable changes with warnings, blocking validation, unknown pending changes, destructive risk, and conflicting lease.
- #27B Lease store + engine policy tests: add `src/main/scryer/edit-lease-store.ts`, wire active lease reads into engine write policy, and prove semantic writes need the matching token while reads/validate/pending do not.
- #27C Agent runtime minimal integration: inject a small agent-run status/event interface, acquire lease on begin, release on done/cancel/crash, run the gate on done, and fold only when `foldPolicy: "when_gate_passes"` and the gate passes.
- #27D IPC/UI gate status and live coverage: expose token-free begin/complete/cancel/read edit-session channels, render gate/status DTOs without lease tokens, keep UI buttons as intent only, prove renderer operations cannot pass `leaseToken`, and add focused live coverage for agent done -> gate result -> no legacy write bypass.

Implementation status: partial. `ScryerEditSessionController`,
`ScryerEditLeaseStore`, engine lease enforcement, IPC/preload edit-session
channels, renderer sync completion/cancel wiring, and token-free TypeScript DTOs
exist. Completion blockers do not yet own the terminal renderer/sync state,
`model.set` and `container.fill` are still cataloged with `lease: 'none'`, the
runtime integration still needs proof that it adapts Orca's native agent runtime
rather than maintaining a second lifecycle, and renderer IPC still needs strict
runtime rejection of authorization fields. #27 is complete only after focused
controller/gate/lease tests and a live agent-done -> gate -> fold-or-attention
workflow pass on the exact release tree.

## #28: What Is The Renderer-Facing Architecture View Model?

Blocked by: #22, #24
Type: Discuss

### Question

What data shape should the Architecture React UI consume so renderer code does not depend directly on persisted Scryer model internals?

### Answer

Introduce and stabilize a renderer-facing Architecture view model through a hard cutover, not a compatibility alias. The persisted Scryer model remains the source of truth for architecture facts, but React components should receive a UI-ready `ArchitectureViewDto` produced by a main-process `ArchitectureViewAdapter` over `readView(...)`. That adapter maps engine read results into canvas nodes, links, tree rows, selected-node details, source-map display rows, boundary display rows, group display data, drift indicators, pending/fold summaries, validation diagnostics, and recommended next reads.

Naming follows "ArchitectureView + upstream semantic name": `ArchitectureViewDto`, `ArchitectureViewNode`, `ArchitectureViewLink`, `ArchitectureViewGroup`, `ArchitectureViewResponsibility`, `ArchitectureViewProperty`, `ArchitectureViewSourceLocation`, and `ArchitectureViewBoundarySource`. Field names follow upstream Scryer 0.3 JSON semantics and TypeScript camelCase: `nodes`, `links`, `groups`, `sourceMap`, `boundaries`, `responsibilities`, `properties`, `parentId`, `memberIds`, `src`, and `dst`. Renderer Architecture code must not use `C4ModelData`, `C4Node`, `C4Edge`, `C4NodeData`, or `edges` as the architecture data model.

UI-only state stays outside the persisted Scryer model and outside durable DTO state: selected ids, expanded paths, active view mode, layout positions, viewport, measured sizes, tab/session state, diff glow, undo/redo stack, form drafts, and agent runtime state. A read request may include current selection so the adapter can return temporary `selectedDetails`, but the adapter does not own long-lived selection state. Renderer components may express user intent, but semantic writes must become catalog operation input and cross `executeOperation(...)`; renderer code must not mutate a model/DTO and save the whole document as the normal edit path.

Normal Scryer 0.3 runtime uses a closed schema. `.scryer/model.scry`, `.scryer/planned.scry`, engine state-store reads/writes, and Architecture View Adapter reads must reject unknown fields rather than ignoring them. Top-level allowed fields are `version`, `nodes`, `links`, `groups`, `sourceMap`, and `boundaries`; Node/Link/Group and nested Responsibility/Property/Source/Boundary objects should also reject unknown fields. Unknown fields are returned as structured `incompatible_model` errors with `reason: "unknown_fields"` and aggregated dot/bracket paths such as `flows`, `nodes[0].type`, or `links[0].source`. Errors are returned to UI/CLI through the normal envelope and may be logged only as a supplement.

Do not consider old model compatibility in #28. There is no implicit import, migration, fallback, `edges -> links` compatibility, `C4ModelData -> ScryModel` runtime conversion, or `flows`/`scenarios` tolerance. Upstream Scryer 0.3 has no Architecture flows model, so `FlowScriptView`, `flows`, and `scenarios` are removed from the normal Architecture product path rather than kept as an Orca extension.

Implementation order: first tighten engine/state-store closed-schema validation, then add `ArchitectureViewAdapter` and `architecture:readArchitectureView`, then hard-cut renderer reads to `ArchitectureViewDto`, then hard-cut renderer writes to intent/operation calls, and finally add ownership tests that forbid Architecture renderer imports of legacy C4 model types and normal edit calls to `readModelDocument`/`writeModelDocument`.

Implementation status: the normal Architecture renderer product path is
implemented, but compatibility retirement is partial. Renderer reads use
`readArchitectureView(...)` /
`ArchitectureViewAdapter.readArchitectureView(...)`, renderer semantic writes
use catalog operation intents, and `ArchitectureViewDto` carries canonical
Scryer 0.3 facts without legacy C4/ReactFlow fields. Main/preload compatibility
code still accepts foundation-era read shapes and exposes legacy document
channels outside the normal renderer path. Completion requires a static ownership
gate proving normal Architecture renderer code cannot import legacy C4 model
types or call raw document IPC, plus removal of obsolete `fullModel`/`mode`
aliases from the default Scryer 0.3 adapter seam.

## #29: What Live UI Coverage Is Required Before Product Completion?

Blocked by:
Type: Research

### Question

Which real user-interface tests should Orca require before declaring the Scryer product migration complete?

### Answer

Expand Electron Playwright coverage around real visible controls and real `.scryer` state effects. The live tests should cover representative user workflows: opening an Architecture tab, reading through the engine, selecting and expanding nodes, adding nodes, updating nodes, deleting nodes, moving nodes, adding/updating/deleting links, editing source maps, editing groups, triggering a domain error, running drift checks, starting/canceling/finishing an agent sync, and restoring state after relaunch.

These tests should assert user-visible DOM state and engine-owned file effects. Store setup may be used to reach a state, but final assertions should not be store round-trips. View-only actions must not modify `.scryer/model.scry`; semantic actions must cross IPC into `executeOperation(...)`; reads must cross `readView(...)`; domain errors and validation failures must render as standard engine envelopes rather than ad hoc text.

Product-path evidence: the Architecture live Electron suite covers visible controls and `.scryer` file effects for opening Architecture tabs, engine-backed reads, tree navigation and drill-in, node add/update/delete, relationship add/update/delete through the inspector, source-map editing and editor opening, group creation/name/description/member drag/remove, closed-schema/domain-error rendering, drift checks, sync start/cancel/auto-finish, and clean relaunch restoration. View-only canvas controls are asserted without treating layout position as persisted Scryer state. Group nesting and bulk group restoration remain covered through operation-backed setup plus file-effect assertions rather than a fully pointer-driven visible-control assertion, because the headless dnd-kit nesting path is not stable enough to gate the product PR. The suite asserts planned/committed Scryer file state for semantic writes and keeps store setup limited to scenario seeding or terminal-agent simulation. Its sync auto-finish coverage does not prove the stronger #27 completion-gate ownership rule; that remains a separate live acceptance gate.

## #30: What Is The Current Operation Catalog Reality?

Blocked by: #25, #29
Type: Discuss

### Question

What exactly is complete now: the Architecture product slice, or full Scryer
operation parity?

### Answer

Treat the current release target as an Architecture product slice plus a broader
engine migration, not as full Scryer product parity. All 33 operation ids have
catalog contracts. As of HEAD `eca93d095`, the #31 read, #32 structural, and #33
health/drift slices are committed and `scryer.model.health` plus
`scryer.drift.flag` are engine-executable. `scryer.container.fill`, its CLI/IPC
adapters, the expanded CLI surface, and the current regression fixtures are only
working-tree implemented on top of that HEAD.

Catalog declaration, engine execution, adapter verification, visible product
integration, commit state, and landing are separate facts. A 33/33 CLI mapping
or a generic IPC bridge does not prove full product parity. The visible
container `Fill with AI` path still instructs the agent to use legacy `set_node`,
so Container Generation has not crossed the `scryer.container.fill` product seam.

Before claiming the Architecture slice complete, audit the already-executable
product path as an end-to-end chain: visible renderer control -> renderer intent
-> preload/IPC -> `readView(...)` or `executeOperation(...)` -> engine executor
-> state-store write/read -> `.scryer/model.scry` or `.scryer/planned.scry` ->
watcher/reload -> `ArchitectureViewDto` -> visible UI update. Each covered
semantic edit must have both visible UI assertions and engine-owned file-effect
assertions. View-only actions must prove they do not modify `.scryer` model
truth, and error paths must render standard engine envelopes rather than ad hoc
messages.

Audit artifact: `docs/orca-scryer-architecture-slice-audit.md`.

Result: #30 remains the catalog-reality checkpoint. #36 records the tested
scope of the stable Architecture renderer path, including external-edit reload,
view-only no-write fingerprints, visible group deletion, and focused person-add
coverage. It does not close #27 completion ownership, #34 Container Generation
invariants, #35 adapter/provenance work, or the default-model legacy retirement
in #26. Non-default model manager save-as/delete remains outside the current
Architecture 0.3 release-critical path.

## #31: How Should Read Surface Completion Land?

Blocked by: #16, #30
Type: Research

### Question

What remains to make the read surface executable beyond the current
Architecture read path?

### Answer

Implement a zero-partial read parity slice for `scryer.model.read`,
`scryer.model.search`, `scryer.model.query`, `scryer.rules.read`, and
`scryer.codebase.read`. This is a product-exposed read surface, so #31 includes
the engine executors, strict catalog schemas, and Orca CLI command
specs/handlers/tests for all five operations.

Use a shared Scryer Read Selector for model-state reads only:
`scryer.model.read`, `scryer.model.search`, and `scryer.model.query`. It owns
overview, subtree, explicit full reads, fuzzy text search, structural query,
hit caps, degradation, breadcrumbs, and upstream drill-down behavior over
canonical Scryer 0.3 state. `scryer.rules.read` and `scryer.codebase.read`
belong in the same #31 slice, but remain sibling read executors because they
read rules assets and the project tree, not `ScryModel`.

The Read Selector is an internal deep module, not a new product seam. Product
callers still enter through `executeOperation(...)`; CLI handlers, operation
executors, IPC, agents, and `ArchitectureViewAdapter` are adapters that map
inputs and display envelopes. They must not construct overview, subtree,
search, query, or full-read payloads themselves. `ArchitectureViewAdapter` may
request an explicit full model for rendering, but it still receives that data
through the engine read path.

Engine and CLI payloads preserve upstream Scryer field semantics from
`read.rs`: `nodeCount`/`linkCount`/`groupCount` and `overview` for model
overview; `internalLinks`, `externalLinks`, `contextNodes`,
`referencesForChildren`, `sourceMap`, and `boundaries` for subtree reads;
`matched` with exact/fuzzy metadata for search hits; and `nResp`/`nProps` for
query hits. Renderer-facing `ArchitectureViewDto` may keep UI-friendly field
names by transforming at the adapter boundary; the operation payload itself is
the parity contract.

`scryer.model.read` uses canonical input
`{ view?: "overview" | "subtree" | "full"; node?: string; layer?: "plan" | "committed"; project?: string }`.
For upstream-compatible ergonomics, omitted `view` defaults to `overview` when
`node` is absent and to `subtree` when `node` is present. CLI also accepts
`--full` as a convenience alias for `--view full`. `subtree` requires `node`;
`overview` and `full` reject `node`; `--full` and `--node` together return a
standard `invalid_input` envelope. `full` is explicit and available for
Architecture rendering, export, debug, fixture, and direct user requests, but it
is not the default first read.

`model.read view=full` returns a minimal wrapper, not a bare `ScryModel`:
`{ view: "full"; layer; version: "0.3"; nodeCount; linkCount; groupCount; model }`.
`recommendedNextReads` is limited to `model.read` navigation payloads: overview
may recommend subtree/search/query reads, degraded subtree reads may recommend
direct-child subtree reads, and subtree reads may recommend related context
targets. Search/query results already return candidate ids, rules misses return
their own guidance, and codebase reads return entries; those operations do not
need `recommendedNextReads` in #31.

#31 fails unless the read operations have explicit zod success schemas rather
than `z.record` placeholders; exact golden payload tests for upstream behavior;
read no-write fingerprints for `.scryer/model.scry` and `.scryer/planned.scry`
with only declared baseline maintenance allowed for committed model reads;
black-box CLI envelope tests; existing `readView(...)` /
`ArchitectureViewAdapter` coverage proving the Architecture UI path is not
broken; and ownership tests preventing read payload construction through
`mcp-tools.ts`, legacy C4 adapters, or ad hoc raw `.scryer` file reads. Missing
any of those criteria means #31 is not complete.

Test at three surfaces: `read-selector.test.ts` owns exact in-memory golden
payload behavior for overview, subtree, full, search, query, caps, matching,
and degradation; operation tests own catalog/pipeline/schema/envelope, layer
selection, baseline maintenance, standard errors, and no-write fingerprints;
black-box CLI tests own command specs, argument mapping, JSON envelopes, and
exit codes without re-testing fuzzy/query internals.

`scryer.model.search` preserves upstream observable behavior rather than
promising byte-for-byte Rust scoring internals. Space-separated terms are ANDed
across fixed searchable fields: `name`, `description`, `technology`,
responsibility statements, and property labels. Exact substring matches rank
above fuzzy matches; results sort by descending score with model order kept for
ties; `kind` filters by Scryer kind; cap is 50 with `truncated`. Each result
returns upstream-style `matched` entries with `field`, `value`,
`match: "exact" | "fuzzy"`, and `score`.

`scryer.model.query` supports only the upstream predicate surface in #31:
string fields `kind`, `name`, `description`, and `technology`; boolean fields
`external`, `visual`, `empty`, and `vagrant`; number fields
`responsibilityCount`, `propertyCount`, and `childCount`; plus aliases
`responsibilities`, `properties`, and `children` for the three count fields.
Conditions are ANDed. Operators are `eq`/`ne` for all fields, `contains` for
strings, `gt`/`gte`/`lt`/`lte` for numbers, and `exists`/`absent` where upstream
presence semantics apply. Unknown fields, unsupported operators, and type
mismatches are `invalid_input`; unknown `under` node is `not_found`; cap is 200
with `truncated`. `empty` keeps upstream semantics and must not become a general
"node has no children" shortcut.

Error behavior uses Orca's standard `ScryerOperationResult` envelope rather than
upstream MCP text as the contract. `invalid_input` covers malformed search,
query, kind, view, and view/node combinations; `not_found` covers missing
subtree or query-scope nodes; `io_error` covers codebase scan/path failures;
`incompatible_model` follows existing state-store model-version and closed
schema rules; `internal_error` covers selector invariants and schema-validation
failures. CLI `--json` prints the envelope unchanged and non-JSON output exits
non-zero on `ok:false`; tests assert `error.code`, `fieldErrors`, and `details`,
not prose messages.

`scryer.rules.read` returns a typed payload, not a preformatted rules text blob.
No topic returns `{ mode: "index"; rules: [{ id; title; tags }] }`; a matched
topic returns `{ mode: "topic"; topic; rules: [{ id; title; tags; body }] }`;
and an unmatched topic returns `{ mode: "miss"; topic; guidance:
"choose_topic_from_index"; rules: index }`. CLI non-JSON output may render this
as upstream-style text, but JSON/engine callers receive the structure.

`scryer.codebase.read` returns a typed project-tree payload, not a single
annotated tree string. The payload includes `root`, flat ordered `entries`
with `path`, `name`, `kind: "file" | "directory"`, `depth`, and `markers`
(`manifest`, `infrastructure`, `environment`), plus summary counts. CLI
non-JSON output may render the upstream annotated tree, but JSON/engine callers
receive structured entries so agents do not parse text.

`scryer.codebase.read` scans only project/workspace-contained paths, respects
`.gitignore`, and always skips dependency/build output such as `.git`,
`node_modules`, `dist`, `build`, `out`, `.next`, `.turbo`, `target`, and
`coverage`. Entries are stable-sorted and capped by explicit depth/entry limits
with `truncated: true` when exceeded. Marker detection is deterministic:
manifest files such as `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`,
`pom.xml`, and Gradle files; infrastructure files such as `Dockerfile`,
`docker-compose.yml`, `fly.toml`, `.github/workflows/*`, and Terraform files;
and environment templates such as `.env.example`, `.env.sample`, and
`.env.template`.

Read no-write fingerprints are release-critical for #31. Plan-layer
`model.read`, `model.search`, `model.query`, `rules.read`, and `codebase.read`
must not change `.scryer/model.scry`, `.scryer/planned.scry`,
`.scryer/history.jsonl`, `.scryer/.sync`, `.scryer/.anchors.json`,
`.scryer/.build_edges.json`, or `.scryer/model.baseline.scry`. A committed
`model.read` may refresh only `.scryer/model.baseline.scry`; it must not touch
model, planned, history, sync, anchors, or build-edge files.

Golden fixtures should use a small purpose-built Scryer 0.3 model rather than a
large real project model: person/system/container/component/symbol hierarchy,
one empty symbol, internal and external links, groups, responsibility and
property matches, sourceMap entries, and boundaries. Stress fixtures are
separate and generated for cap/degradation behavior: 51 search hits, 201 query
hits, and an oversized subtree. Stress tests assert caps and degradation, not a
full large golden payload.

#31 does not add new renderer UI, rules-browser UI, codebase-tree UI, Electron
live workflows, or new agent workflow/prompt behavior. It must keep existing
generic operation adapters usable: a focused IPC/adapter test should prove
cataloged #31 read operations can pass through the existing generic
`executeScryerOperation` path and return standard envelopes without a legacy
fallback. Full remaining adapter and product-surface coverage stays in #35.

CLI coverage must be black-box through the real command dispatch path, not
handler-only imports. It must prove command parsing, flag mapping, JSON
envelopes, operation ids, stdout JSON parseability, and non-zero exit for
invalid input for model read overview/subtree/full, search, query via
`--json-input -`, rules index/topic, and codebase read. CLI tests should not
mock the engine or duplicate the selector's fuzzy/query fixture detail.

Add a static ownership test for #31 read modules. `model-read`, `model-search`,
`model-query`, `rules-read`, `codebase-read`, and `read-selector` must not
import `mcp-tools.ts`, model-store modules, legacy C4 adapters/types, renderer
modules, or CLI modules. Filesystem access is allowed only for `codebase-read`
or its private scan helper; rules assets are allowed only for `rules-read`.

Implement #31 in phases inside one ticket: first Read Selector and golden
fixtures; then strict schemas; then executors; then CLI specs/handlers; then
selector, operation, no-write, ownership, CLI black-box, and focused generic IPC
tests; then docs/status cleanup. #31 is not complete until the whole gate is
green. Engine-only completion, CLI-only completion, or tests without
no-write/ownership coverage must remain partial. Closing #31 still did not
claim full Scryer operation parity because #32-#35 remained open; after #32,
the remaining parity gaps are #33-#35.

Prepare #31 as one PR with logical commits: `docs: tighten #31 read parity
gate`; `feat: implement #31 read surface executors`; and `feat: expose #31 read
operations through CLI`. The docs commit contains only the grill/design updates;
implementation commits carry code and tests.

## #32: How Should Structural Mutation Completion Land?

Blocked by: #17, #30
Type: Research

### Question

What remains to make structural mutation parity executable?

### Answer

Implement the structural completion slice for `scryer.node.set-subtree`,
`scryer.node.move`, `scryer.responsibility.move`, and `scryer.node.descope`.
Keep `scryer.model.set`, `scryer.node.delete`, and `scryer.link.update` in the
completed executable set, but use this slice to ensure the whole structural
family shares one mutation planner, validator handoff, source cleanup, link
legality checks, atomic commit behavior, and no legacy fallback. Acceptance
requires golden state assertions for planned/committed effects and adapter tests
for any UI/CLI path that exposes the operations.

Track this work with umbrella issue
[#56](https://github.com/Nikolatesla-lj/orca/issues/56) and child issues:
[#57](https://github.com/Nikolatesla-lj/orca/issues/57) (`#32A` planner
foundation), [#58](https://github.com/Nikolatesla-lj/orca/issues/58) (`#32B`
`node.set-subtree`), [#59](https://github.com/Nikolatesla-lj/orca/issues/59)
(`#32C` `node.move` and `responsibility.move`),
[#60](https://github.com/Nikolatesla-lj/orca/issues/60) (`#32D`
`node.descope`), and [#61](https://github.com/Nikolatesla-lj/orca/issues/61)
(`#32E` release gate/final review).

Accepted #32 decisions: all four remaining structural operations are planned
state writes through catalog/pipeline/`executeOperation(...)`; operation files
stay thin and call a shared `StructuralMutationPlanner`; batch requests are
atomic; no-ops succeed with an info finding and no durable write; success
payloads use explicit Zod schemas; CLI and IPC coverage must be real dispatch
black-box tests; ownership/static tests must forbid MCP, renderer, CLI, IPC,
legacy C4/model-store, and direct `.scryer/*` bypasses from engine modules.

`scryer.node.set-subtree` replaces descendants under an existing root only. It
does not create or replace the root. Its payload is `{ nodes, links? }`; new
`sourceMap` and `boundaries` writes go through `scryer.source.update`. Orca is
stricter than upstream: root ids in the payload, unknown link endpoints,
external-only payload links, duplicate ids, global identity collisions, and
illegal link topology are hard errors. `nodes: []` clears descendants.

`scryer.node.move` validates the final candidate model for the whole batch,
preserves subtree identity, rejects illegal parentage, external parents, cycles,
and duplicate move conflicts, cleans old invalid group membership, deletes
groups made illegal by cleanup, and never guesses target group membership.
Explicit group membership must be set by a group operation or by an adapter
sequence with an explicit group target. `scryer.responsibility.move` is
node-owned responsibility relocation only; it moves node to node, preserves the
responsibility id and id-keyed source anchors, and rejects vagrant moves.

`scryer.node.descope` is a planned-only model correction even though upstream
writes planned and committed together. It removes target nodes and descendants
from planned state, relocates each target node's own non-vagrant
responsibilities to its parent, drops vagrant and descendant responsibilities,
cleans links, groups, sourceMap, and boundaries, and reports model-correction
pending state without implying code deletion work.

Out of scope: no new Architecture UI, rules browser UI, codebase tree UI,
Electron live workflow, Codex-specific path, #33 intent add, #34 source/group
operation implementation beyond cleanup over existing data, #35 full parity
adapter/coverage gate, or MCP/model-store/legacy C4 bypass revival.

Implementation status: completed as the #32A-#32E release slice. The four
operations are executable through catalog/pipeline `executeOperation(...)` with
explicit success schemas, shared planner cleanup, no-write fingerprints, CLI
black-box coverage, and generic IPC forwarding coverage.

## #33: How Should Health And Drift Record Completion Land?

Blocked by: #20, #30
Type: Research

### Question

What remains after `drift.get` and `drift.reconcile` are executable?

### Answer

Implement `scryer.model.health` and `scryer.drift.flag` as a drift/health
completion slice. `model.health` is a report operation with declared maintenance
writes only; it must not record semantic drift verdicts. `drift.flag` records
reviewed semantic findings into planned state and history sidecars without
advancing reconcile anchors. Acceptance requires clear separation between
changed-scope detection, human/agent semantic verdict recording, and reconcile
anchor advancement.

Track this work with umbrella issue
[#62](https://github.com/Nikolatesla-lj/orca/issues/62) and child issues:
[#63](https://github.com/Nikolatesla-lj/orca/issues/63) (`#33A`
`model.health` executable report path),
[#64](https://github.com/Nikolatesla-lj/orca/issues/64) (`#33B`
`drift.flag` vagrant verdict path),
[#65](https://github.com/Nikolatesla-lj/orca/issues/65) (`#33C`
`drift.flag` stale verdict path), and
[#66](https://github.com/Nikolatesla-lj/orca/issues/66) (`#33D`
release gate/final review).

#33 is an engine-focused slice. It should implement the two executors, strict
input/success schemas, state-store side effects, operation-level golden tests,
maintenance/no-write tests, and generic `executeOperation(...)` coverage. CLI,
IPC, agent guidance, renderer surfaces, and live UI coverage remain in #35
unless a tiny adapter smoke test is required to prove the catalog no longer
returns `unimplemented`.

`scryer.model.health` should use the upstream `health.rs::compute_health` shape
as the engine contract: `{ nodes: Record<nodeId, { own; subtree; boundary? }>,
totals }`. Health counts include responsibilities, properties, vagrant, stale,
anchorable, anchored, unmapped, and optional `lastTouchedAt`; boundary coverage
includes total files, anchored files, and dark files. UI-shaped roots/children,
review summaries, and other presentation aggregates may be derived later by
adapters, not encoded as the engine payload. `node_id` scopes the report to an
existing node; missing nodes return standard `not_found` with `{ entity:
"node", id }`. Link audit/build-edge evidence is optional in #33: include it
only when an existing build-edge cache reader can provide upstream-compatible
evidence; otherwise omit it without guessing or failing.

`model.health` may perform only declared best-effort maintenance writes:
sync-state seeding, anchor-baseline refresh, and committed source-map reanchor.
It must never write `.scryer/model.scry`, `.scryer/planned.scry`, or semantic
drift verdicts. Maintenance write failure keeps `ok: true` and surfaces a
structured warning. Pure report paths need no write lock; paths that perform
maintenance use the catalog's `commit_if_writing` policy.

`scryer.drift.flag` must support the full upstream verdict surface in the first
executable version: `undescribed`, `new_nodes`, `undescribed_properties`,
`stale`, `stale_properties`, and `stale_nodes`. Verdicts write planned state
only; committed state remains unchanged. History append is a best-effort
sidecar warning on failure. `drift.flag` must not detect changed files, compute
health rollups, refresh sync state, or advance the reconcile anchor. Empty
verdict arrays are a no-op success with an empty structured result and no
history write.

Undescribed behavior and properties may target either an existing `node_id` or
a request-local `node_key` minted in the same `new_nodes` batch, but not both.
`new_nodes` accepts request-local keys only; real model ids are minted by the
shared `ScryerIDMinter` against committed state, planned state, and current
batch reservations. `parent_key` may reference only earlier `new_nodes` entries;
duplicate keys, forward references, unknown `node_id`s, and invalid parent
chains fail the whole request atomically. The success payload returns
`mintedNodes` mapping request keys to real ids.

`stale` responsibilities mark the planned responsibility `stale: true`. A
non-blank `proposedStatement` is stored as `staleProposal`; the current
`statement` is not modified. `undescribed_properties` create vagrant planned
properties keyed by `node_id`/`node_key` plus label; an already-existing label
is skipped and reported. `stale_properties` locate an existing property by
`node_id + label` and fail atomically if the node or label is missing.
`stale_nodes` writes a single node-level `stale: true` marker on the target
node; it represents subtree-level backing-code loss but does not recursively
mark descendants.

`drift.flag` source anchors must pass through the shared `ScryerSourceRouter`.
The drift recorder produces source-update intent for newly minted vagrant
responsibilities/properties; the router owns single-home planned/committed
routing and whole-symbol normalization. Because #33 verdict-created elements
are planned-only, their anchors normally land in planned `sourceMap`.

`drift.flag` success must be a structured payload, not a generic count:
`{ flagged, mintedNodes, vagrantResponsibilities, vagrantProperties,
staleResponsibilities, staleProperties, staleNodes,
skippedExistingProperties? }`. This lets agents and review/fold flows identify
exactly what was recorded without parsing prose.

Implementation should keep operation files thin by adding deep modules such as
`ScryerHealthReporter` and `ScryerDriftVerdictRecorder`. The health reporter
owns health calculation, scoped reporting, boundary darkness, and maintenance
write planning. The verdict recorder owns drift verdict validation, id minting,
planned-state mutation plans, source-router handoff, atomicity, structured
results, and history events. Operation files should only receive catalog-
validated input, call these modules, and return the standard envelope.

Acceptance gate: whole-model and scoped-node health golden tests; health
missing-node `not_found`; health no-write fingerprints for model/planned files;
health maintenance-write allow-list tests; drift flag golden tests for vagrant
responsibilities, minted node chains, vagrant/stale properties, stale
responsibility `staleProposal`, and stale node markers; invalid reference tests
that prove atomic no-partial-write behavior; schema tests proving neither
operation still uses `countResultSchema` placeholders; and generic
`executeOperation(...)` tests proving both operations are executable through the
catalog/pipeline.

Status update, 2026-07-14: the #33 engine-focused slice is committed at
`eca93d095` and landed on `fork/orca-scryer` as represented by the current local
tracking ref. `scryer.model.health` and `scryer.drift.flag` are executable through
the catalog/pipeline with strict schemas, deep engine modules, planned-only drift
recording, and health maintenance-write guards. CLI, IPC, renderer, and live
adapter verification remain explicitly scoped to #35 and the current working-
tree acceptance gates.

## #34: How Should Container Generation Completion Land?

Blocked by: #21, #30, #32
Type: Research

### Question

How should `scryer.container.fill` become executable without turning generation
into a series of raw intent calls?

### Answer

Implement `scryer.container.fill` as one high-risk atomic generation primitive
behind the `ScryerContainerGenerationPlanner` interface. It validates a complete
proposal against the effective committed-plus-planned state: either layer having
component children makes the target non-empty. Ids are minted against both layers
and current batch reservations; freshly minted elements are referenced by request-
local keys. Every generated symbol retains source identity, including thin
symbols without responsibilities or properties. Plain responsibilities use a
whole-symbol anchor; only explicitly ranged responsibilities carry subranges.
Generated groups set `parentNodeId` to the target container and contain only its
direct generated component children. Build-edge reporting distinguishes missing,
empty, available, and partially unresolved evidence instead of guessing.

The planner routes source anchors through the source router, validates final
committed and planned snapshots, and writes both layers as one primary state-
store transaction. History remains a best-effort sidecar. The operation is a
semantic write and must honor an active edit lease. Successful results return a
compact structured generation summary, not a full model or prose. Acceptance
requires transaction tests proving partial writes do not survive failure and
focused invariant tests for state union, source identity, group ownership, edge
evidence, anchors, and lease enforcement.

Checkpoint status, 2026-07-15: the planner, build-edge adapter, thin operation,
strict schemas, catalog executor, transaction and ownership tests, CLI/IPC
adapter tests, and local regression fixtures are preserved in local commit
`227cc8b16906733ac3a37f78a2d9320577d33d93` on branch
`scryer/convergence-integration`. The checkpoint is not pushed, landed,
release-ready, or final verification evidence. Its baseline gate passed 39
focused Engine tests, 39 focused CLI/IPC tests, Node/CLI/Web typecheck, targeted
formatting, React Doctor, and 22 existing Architecture Electron E2E tests. Those
results prove that the saved checkpoint is internally executable and does not
regress the existing Architecture slice; they do not satisfy the missing #34
invariants or the #38 product cutover.

The current draft still misses binding #34 invariants: it checks emptiness only
in committed state, does not preserve source identity for every thin symbol,
omits generated group `parentNodeId`, cannot report partially unresolved edge
evidence, gives plain responsibilities a definition-sized range, and catalogs
`container.fill` with `lease: 'none'`. The planner file also contains literal NUL
separators and exceeds the repository file-size rule. These are convergence
blockers, not optional follow-up polish.

## #35: What Adapter And Coverage Gate Is Required For Full Operation Parity?

Blocked by: #31, #32, #33, #34
Type: Discuss

### Question

Once the remaining operation executors exist, how do we prove product callers
are connected correctly?

### Answer

Add the adapter and coverage gate for the remaining operations only after their
engine executors pass focused tests. CLI, IPC, agent guidance, and any renderer
surface that exposes these operations must call `readView(...)` or
`executeOperation(...)`; they must not revive model-store or MCP legacy semantic
writers. The gate should include ownership tests, adapter envelope tests,
operation-specific golden tests, and live UI coverage only for operations with
real visible product controls. Operations that are CLI/agent-only do not need
fake UI tests, but they do need end-to-end command or IPC tests that assert
engine-owned `.scryer` file effects.

Checkpoint progress, 2026-07-15: the CLI mappings, generation/drift/health and
authoring dispatch tests, generic IPC cases, Container Generation ownership
tests, and deterministic Orca regression runner are committed locally at
`227cc8b16906733ac3a37f78a2d9320577d33d93`. The baseline passed 39 focused
CLI/IPC tests in addition to the Engine and typecheck gates recorded in #34.
This is committed preservation and adapter baseline evidence only: it has not
passed the final catalog-derived parity gate, has not been pushed or landed, and
is not product-integrated.

The current fixture directory must not be described as upstream parity. Its
Container Generation case records `upstreamCommit: "0000000"`, runs Orca's own
engine, and currently expects source-anchor behavior that differs from the Rust
reference. It proves only a local deterministic regression until a real upstream
commit, independently produced expected outcome, and explicit Orca differences
are recorded. A catalog-to-CLI machine gap check also remains required; static
33/33 mapping observed in the working tree is not a substitute for the gate.

#35 is not product-integrated. The visible container `Fill with AI` control still
uses `nodeFillPrompt(...)`, which tells the agent to add components with legacy
`set_node`. That path must cross `scryer.container.fill`, honor edit-session lease
and completion rules, expose failure/cancel states, and prove engine-owned file
effects before Container Generation can be called a complete product slice.

## #36: How Should The Architecture Slice Release Gate Gaps Close?

Blocked by: #30
Type: Research

### Question

What coverage or scope decisions are still required before the current
Architecture slice can pass the zero-partial release gate?

### Answer

Close the current-slice release blockers found by
`docs/orca-scryer-architecture-slice-audit.md`: fix or explicitly scope the
active planned-file external edit reload path; either add visible live e2e for
non-default model save-as/delete or mark that workflow out of the Architecture
0.3 release; add a no-write fingerprint harness for view-only controls such as
theme, zoom, tree navigation, and mode switching; add an explicit MCP
compatibility matrix for supported aliases (`delete_edges`, strict `set_groups`,
strict `delete_group`) and rejected legacy aliases (`add_nodes`, `set_node`,
`set_flows`, `delete_flow`); add a passing visible product deletion path for
`scryer.group.delete` if it remains release-critical; and add focused
product/API coverage for `scryer.person.add` if it remains release-critical.

Release-scope evidence: the current release-critical Architecture gate has live
coverage for active
model reload and temporary-file ignore behavior, view-only `.scryer` no-write
fingerprints, visible group deletion through `scryer.group.delete`, MCP config
and strict alias matrix coverage, and focused `scryer.person.add` IPC/API
coverage. Non-default model manager save-as/delete is scoped out of this release
gate; promoting it later requires a separate product decision and e2e slice.

## #37: How Is Full 33-Operation Parity Proven?

Blocked by: #24, #35
Type: Discuss

### Question

What machine evidence is required before Orca calls the 33-operation catalog
complete?

### Answer

Derive a parity gate from the catalog rather than maintaining a prose checklist.
For every operation id, prove a strict input and success schema, a non-placeholder
executor, declared lock/lease/write policy, a CLI mapping, generic IPC support or
an explicit transport waiver, ownership coverage, an operation contract or
golden test, and no legacy semantic fallback. Any visible product entrypoint must
also have a live user-path test; CLI/agent-only operations require an explicit UI
waiver rather than a fake renderer test.

The gate reports separate states: **declared**, **engine executable**, **adapter
verified**, **product-integrated**, and **landed on `<ref>`**. Passing a catalog
count, a CLI mapping check, or a partial golden set cannot promote an operation to
a later state. Golden provenance records the real upstream revision and any
accepted Orca semantic differences.

## #38: What Is The Container Generation Product Cutover?

Blocked by: #27, #28, #34, #37
Type: Discuss

### Question

How does the existing visible container generation workflow move to the atomic
Engine operation?

### Answer

The container `Fill with AI` control must express a generation intent whose agent
or system adapter invokes `executeOperation("scryer.container.fill", ...)`.
Default Scryer 0.3 prompts and adapters must not direct the agent to `set_node` or
retry it after an Engine failure. Renderer, preload/IPC, agent runtime, and
compatibility code remain adapters; proposal validation, id minting, source
routing, group/link legality, transactions, and result semantics stay behind the
Container Generation planner interface.

Product integration requires a visible Electron workflow covering start,
success, validation failure, cancellation, and agent completion. The test must
observe the completion gate and active lease behavior, committed plus planned
file effects, watcher/view refresh, and the final visible state. Until that path
passes, #34 may be engine-executable and adapter-verified but is not
product-integrated.

## #39: What Is The Convergence Gate Before Reviewable Commits?

Blocked by: #26, #27, #34, #35, #37, #38
Type: Maintenance

### Question

What must be resolved before the current working-tree slice is split into
reviewable commits?

### Answer

Freeze feature expansion and converge the current slice first. Remove every
Scryer `max-lines` disable instead of extending the oversized hubs. Split
`types.ts`, `schemas.ts`, `catalog.ts`, and the generation planner into focused
deep modules with small interfaces: operation contracts/results, generation
contracts, catalog families, proposal validation, subtree minting, source
anchoring, group/link construction, and result/history planning. Operation files
remain thin adapters into those modules.

The import graph must be acyclic. Move pending/diff contracts out of the
`diff.ts` <-> `types.ts` cycle, and extract `ScryerAddedItemsResult` or equivalent
leaf contracts before porting code that would recreate the
`intent-planner.ts` <-> `intent-planner-group-add.ts` cycle. Remove literal NUL
bytes from TypeScript source. Replace placeholder parity provenance with a real
upstream commit and independently verified expected state.

Only after focused Engine, transaction, ownership, adapter, typecheck, lint,
Electron E2E, `git diff --check`, and GitNexus impact/cycle gates pass should the
slice be split into four reviewable commit groups: Engine implementation, Engine
tests/parity, CLI adapters/tests, and decision documentation. Committing or
landing a partial group must not upgrade the status of the remaining groups.

Preservation update, 2026-07-15: local checkpoint
`227cc8b16906733ac3a37f78a2d9320577d33d93` freezes the pre-convergence code,
tests, and fixtures so issue-specific worktrees can share one reproducible base.
The normal pre-commit hook was intentionally not treated as a release gate: the
checkpoint still has 52 targeted oxlint findings (29 Node protocol imports, 20
array-style findings, and 3 max-lines failures), the existing unchanged
switch-exhaustiveness failure, nine Scryer max-lines suppressions, a planner NUL,
and placeholder golden provenance. The checkpoint therefore does not close #39;
it makes #68 the first safe implementation slice.
