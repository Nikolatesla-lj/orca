# Scryer Diagram Library Implementation Contracts

日期：2026-05-26

本文补充 `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`。它规定关键导出函数、组件 props、handler 输入输出和真实测试门禁，目的是防止 Codex 写出空壳代码、只改内存不落盘、或用 mocked test 冒充真实路径完成。

## Source

- PRD doc: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- System contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- Architecture: `docs/architecture/2026-05-26-scryer-diagram-library-architecture.md`
- Task slices: `docs/tasks/2026-05-26-scryer-diagram-library-task-slices.md`
- Verification: `docs/testing/2026-05-26-scryer-diagram-library-verification.md`
- Error codes: `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md`
- Fixture catalog: `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md`
- Traceability: `docs/contracts/2026-05-26-scryer-diagram-library-traceability.md`

## Implementation gate

- Do not implement from this file alone. A real GitHub task slice issue or a complete local task doc under `docs/tasks/local/` is required. The local task doc is valid only while GitHub Issues are disabled and only when its status is `ready-for-agent`.
- Every function, component prop type, handler, and IPC type name shown below is a required public implementation contract for the slice that implements that behavior.
- If existing code makes an exact exported name impossible, stop before coding and update this contract, task issue, traceability matrix, and tests together. Do not silently use a different exported name.
- Private helper names may differ, but exported behavior, input, output, errors, and real data path must match this document.
- Error codes must use `docs/contracts/2026-05-26-scryer-diagram-library-error-codes.md`.
- Completion tests must use fixtures from `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md` where that catalog lists them for the slice.
- No function may return success before it has changed the real model/cache state required by its contract.
- No handler may be a placeholder, no-op, mock-only branch, or TODO stub in production code.

## Parser and validation functions

These functions belong near `src/shared/scryer/parse-model.ts` or a sibling shared module.

```ts
export type DiagramValidationContext = {
  nodeIds: Set<string>
  edgeIds: Set<string>
  groupIds: Set<string>
  flows: Flow[]
  diagrams: Diagram[]
}

export type DiagramNormalizeResult<T> = {
  value: T
  warnings: ModelValidationWarning[]
}

export type DiagramErrorCode =
  | `parser.${string}`
  | `renderer.${string}`
  | `controller.${string}`
  | `cache.${string}`
  | `mcp.${string}`
  | `bridge.${string}`
  | `standalone.${string}`

export function normalizeDiagrams(raw: unknown): DiagramNormalizeResult<Diagram[]>

export function normalizeDiagramRefs(
  raw: unknown,
  context: DiagramValidationContext
): DiagramNormalizeResult<DiagramRef[]>

export function validateDiagramRefs(
  refs: DiagramRef[],
  context: DiagramValidationContext
): ModelValidationWarning[]

export function findFlowStep(flow: Flow, stepId: string): FlowStep | null
```

Required behavior:

- `normalizeDiagrams` keeps only valid diagrams, keeps the first duplicate id, and returns warnings for duplicates or invalid fields.
- `normalizeDiagramRefs` preserves dangling refs as refs plus warnings; it must not silently retarget bad refs.
- `validateDiagramRefs` validates diagram existence, target existence, source target safety rules, `sourceRange`, and nested `flowStep` targets.
- `findFlowStep` searches `flow.steps` and every nested `branch.steps` depth-first; it must not use array index as identity.
- Parser read must not write disk. Only explicit save writes normalized v2 fields.

Required tests:

- FX1 legacy `.scry` without diagrams returns `schemaVersion: 2`, `diagrams: []`, `diagramRefs: []` in memory and does not rewrite the fixture on read.
- FX3 duplicate diagram id and duplicate ref id produce warnings with `parser.duplicate-diagram-id` and `parser.duplicate-ref-id`.
- FX4 nested branch `flowStep` refs validate when the step exists and warn with `parser.missing-flow-step` when missing.
- Serializer still omits `validationWarnings` from disk.

## DiagramRef cleanup functions

These functions belong near shared model utilities used by UI delete paths and MCP delete handlers.

```ts
export type DiagramRefDeleteTarget =
  | { type: 'diagram'; diagramId: string }
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'group'; id: string }
  | { type: 'flow'; id: string }
  | { type: 'flowStep'; flowId: string; stepId: string; flow: Flow }

export type DiagramRefPruneResult = {
  diagramRefs: DiagramRef[]
  deletedRefIds: string[]
}

export function pruneDiagramRefsForDeletedTarget(
  refs: DiagramRef[],
  target: DiagramRefDeleteTarget
): DiagramRefPruneResult
```

Required behavior:

- Deleting a diagram deletes every ref whose `diagramId` matches.
- Deleting a node, edge, group, or flow deletes only refs defined by the deletion policy in the system contract.
- Deleting a flow step also deletes refs for nested branch steps under that step.
- Source file disappearance outside Orca is not handled by prune; it remains a validation warning.

Required tests:

- Each delete target has one test proving the correct refs remain, using FX2 or FX4 copied into a temp project when persistence is involved.
- Flow step deletion test must include at least one nested branch step from FX4.

## Hash and cache functions

These functions belong in a shared renderer/cache helper used by renderer, prompt serialization, and cache IPC tests.

```ts
export type DiagramCacheOutputProfile = 'review' | 'thumbnail' | 'export'

export type DiagramCacheKeyInput = {
  sourceHash: `sha256:${string}`
  notation: DiagramNotation
  detectedKind: DiagramKind
  theme: string
  rendererVersion: string
  outputProfile: DiagramCacheOutputProfile
}

export function normalizeDiagramSourceForHash(source: string): string

export function computeDiagramSourceHash(source: string): `sha256:${string}`

export function computeDiagramCacheKey(input: DiagramCacheKeyInput): `sha256:${string}`
```

Required behavior:

- `normalizeDiagramSourceForHash` converts CRLF and CR to LF only. It must not trim or reformat Mermaid source.
- `computeDiagramSourceHash` returns lowercase `sha256:<64 hex>`.
- `computeDiagramCacheKey` hashes canonical JSON with sorted keys for the exact fields in `DiagramCacheKeyInput`.
- Diagram name, description, tags, refs, and UI selection must not affect cache key.
- `outputProfile` controls the cache payload type: `review` uses sanitized SVG, `thumbnail` and `export` use PNG data URLs.
- Cache directory model names must be produced by the existing `sanitizeProjectModelName(modelName)` path. `null` and `undefined` must not be special-cased in cache code.

Required tests:

- CRLF and LF sources produce the same `sourceHash`.
- Changing diagram name does not change `cacheKey`.
- Changing source, theme, rendererVersion, detectedKind, or outputProfile changes `cacheKey`.
- Hash/cache tests use FX5 valid Mermaid and FX8 cache requests when cache IPC is involved.

## Shared Mermaid kind detection functions

These functions belong in a shared module importable by renderer code and main-process MCP code, for example `src/shared/scryer/diagram-kind.ts`. They must not import React, Mermaid renderer modules, DOMPurify, Electron, or browser-only APIs.

```ts
export type DetectedDiagramKind = {
  kind: DiagramKind
  directive?: string
  warning?: DiagramDiagnostic
}

export function getMermaidSourceDirective(source: string): string | null

export function detectMermaidDiagramKind(source: string): DetectedDiagramKind
```

Required behavior:

- `getMermaidSourceDirective` skips a leading UTF-8 BOM, blank lines, Mermaid `%%` comments, Mermaid init directives such as `%%{init: ...}%%`, and YAML frontmatter delimited by `---`.
- `detectMermaidDiagramKind` uses the directive mapping table from the system contract. It must not infer kind from filename, diagram name, tags, or persisted `Diagram.kind`.
- Unknown directives return `kind: 'other'` and a `renderer.unsupported-kind` warning. Empty source returns `kind: 'other'` and lets caller decide whether to raise `controller.empty-source`, `parser.invalid-diagram`, or `mcp.validation-failed`.
- S1 `updateDiagramSource`, S2 renderer, and S5 MCP handlers must call this shared helper. They must not import `diagram-renderer.ts` into main-process code just to detect Mermaid kind.

Required tests:

- Directive mapping tests cover `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `architecture-beta`, `C4Context`, `gitGraph`, `requirementDiagram`, `quadrantChart`, and `xychart-beta`.
- Tests prove leading comments, init directives, blank lines, and frontmatter are skipped before detection.
- MCP/source save tests prove source-kind conflict uses this helper without importing renderer modules.

## Render adapter functions

These functions belong in `src/renderer/src/components/architecture/diagram-renderer.ts` or a sibling renderer module.

```ts
export type DiagramRenderTheme = 'light' | 'dark'

export type DiagramRenderOptions = {
  theme: DiagramRenderTheme
  outputProfile: DiagramCacheOutputProfile
}

export interface DiagramRenderAdapter {
  detectDiagramKind(source: string): DetectedDiagramKind
  renderDiagram(diagram: Diagram, options: DiagramRenderOptions): Promise<DiagramRenderResult>
  extractRenderedElements(source: string, svg: string, kind: DiagramKind): DiagramRenderedElement[]
}
```

Required behavior:

- `detectDiagramKind` is a renderer-side wrapper around shared `detectMermaidDiagramKind(source)`. It exists for adapter ergonomics only; main-process code must import the shared helper instead.
- `renderDiagram` must use the shared Mermaid render queue. Direct parallel calls to `mermaid.render()` are not allowed.
- `renderDiagram` must sanitize SVG before returning it to React.
- `renderDiagram` must annotate bindable SVG elements with `data-diagram-element-key` before the final sanitization pass, following the SVG click binding rules in the system contract.
- Unsupported diagram kinds return `ok: false` with diagnostic; they must not throw for normal unsupported-kind cases.
- `extractRenderedElements` may return `[]` when stable mapping cannot be derived; it must not invent unstable `elementKey` values.
- Existing Orca Mermaid rendering is the default adapter. `beautiful-mermaid` can only be introduced after real adapter tests prove a capability gap.

Required tests:

- Real Mermaid render succeeds for at least `flowchart`, `sequence`, `class`, `state`, and `er`. The cases must read FX5, FX6, FX12, FX13, and FX14.
- Non-core support-matrix cases must read FX15, FX16, and FX17. For `architecture-beta`, `gitGraph`, and `C4Context`, the adapter must either render sanitized SVG or return `renderer.unsupported-kind` with directive and adapter/version details. Tests must not inline these Mermaid strings.
- Invalid Mermaid reads FX7 and returns `renderer.invalid-source` diagnostic without overwriting source.
- Two renders of FX5 produce the same stable `elementKey` for bindable elements.
- Rendered FX5 SVG includes `data-diagram-element-key` only on bindable elements, and sanitization removes raw event handlers.
- Batch thumbnail render and active diagram render do not call Mermaid concurrently outside the queue.

## Diagram source draft props

S1 uses `DiagramSourceDraftView`, not `DiagramReviewView`. This avoids passing a fake `renderAdapter` or rendering an empty preview before S2 exists.

```ts
export type DiagramSourceDraftViewProps = {
  diagram: Diagram
  editingLocked: boolean
  onDraftStateChange: (snapshot: DiagramDraftStateSnapshot) => void
  externalReloadConflict?: DiagramExternalReloadConflict | null
  onResolveExternalReloadConflict: (
    resolution: DiagramExternalReloadResolution
  ) => void | Promise<void>
  onSaveSource: (diagramId: string, source: string) => Promise<void>
  onRenameDiagram: (diagramId: string, name: string) => Promise<void>
  onDeleteDiagram: (diagramId: string) => Promise<void>
}

export type DiagramDraftStateSnapshot = {
  diagramId: string
  persistedSource: string
  draftSource: string
  dirty: boolean
}

export type DiagramExternalReloadConflict = {
  modelName: string
  diagramId: string
  draftSource: string
  diskState: 'modified' | 'deleted'
  diskSource?: string
  baseRevision: string
  diskRevision: string
  diskUpdatedAt?: string
}

export type DiagramExternalReloadResolution =
  | 'keep-draft'
  | 'reload-from-disk'
  | 'discard-deleted'
  | 'compare-changes'
  | 'cancel'

export type ArchitectureDiagramFeatureFlags = {
  enableArchitectureDiagramLibraryPreview: boolean
}

export const DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS: ArchitectureDiagramFeatureFlags
```

Required behavior:

- Source editor uses local draft state and explicit Save/Cmd+S/Ctrl+S.
- `DiagramSourceDraftView` reports draft changes through `onDraftStateChange`. It does not decide whether navigation is allowed.
- `useArchitectureModelController` owns the dirty-draft navigation guard for C4, flow, diagram, model switch, and close-view actions. It must show Save and switch, Discard and switch, and Cancel before changing `architectureMode` or `activeDiagramId`.
- `externalReloadConflict` and `onResolveExternalReloadConflict` are the only S1 component entry points for disk reload conflicts. `modelName` is required and binds the conflict to the model where the draft started; controllers must not apply a conflict to a different active model. `baseRevision` is the revision the draft started from; `diskRevision` is the reloaded document revision. `diskSource` is required only when `diskState === 'modified'`; it is absent when `diskState === 'deleted'`. `compare-changes` is available only for `modified` conflicts and must not clear dirty state.
- `DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS.enableArchitectureDiagramLibraryPreview` must be `false` for user-facing builds until S2 is complete. S2 keeps the same flag name and flips the default to `true` only after the complete review page acceptance criteria pass; it must not remove or replace the flag. If Orca has an existing feature-flag provider, wire this name into that provider; otherwise `ArchitecturePanel` must accept an optional `featureFlags?: ArchitectureDiagramFeatureFlags` test/internal prop that defaults to `DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS`.
- It does not accept `renderAdapter`, `DiagramReviewViewExportActions`, or copy/export props.
- It must not render an empty SVG pane, fake diagnostics, or disabled copy/export placeholders.
- S2 replaces or extends this source-only surface with `DiagramReviewView`.

## DiagramReviewView props

`DiagramReviewView` owns review UI state. It does not own persistence; it calls controller callbacks that write through the real model path.

```ts
export type DiagramReviewViewBaseProps = {
  diagram: Diagram
  renderAdapter: DiagramRenderAdapter
  theme: DiagramRenderTheme
  editingLocked: boolean
  exportActions?: DiagramReviewViewExportActions
  onDraftStateChange: (snapshot: DiagramDraftStateSnapshot) => void
  externalReloadConflict?: DiagramExternalReloadConflict | null
  onResolveExternalReloadConflict: (
    resolution: DiagramExternalReloadResolution
  ) => void | Promise<void>
  onSaveSource: (diagramId: string, source: string) => Promise<void>
  onRenameDiagram: (diagramId: string, name: string) => Promise<void>
  onDeleteDiagram: (diagramId: string) => Promise<void>
  refActions?: DiagramReviewViewRefActions
}

export type DiagramReviewViewRefActions = {
  refs: DiagramRef[]
  onUpsertRefs: (refs: DiagramRef[]) => Promise<void>
  onDeleteRefs: (refIds: string[]) => Promise<void>
  onNavigateRefTarget: (target: DiagramRefTarget) => void | Promise<void>
}

export type DiagramElementNavigationCandidate = {
  refIds: string[]
  target: DiagramRefTarget
  roles: DiagramRefRole[]
  label: string
  notes: string[]
}

export type DiagramElementNavigationResolution =
  | { action: 'none' }
  | { action: 'navigate'; candidate: DiagramElementNavigationCandidate }
  | { action: 'choose-target'; candidates: DiagramElementNavigationCandidate[] }

export type DiagramElementTargetPickerProps = {
  candidates: DiagramElementNavigationCandidate[]
  onChoose: (candidate: DiagramElementNavigationCandidate) => void | Promise<void>
  onCancel: () => void
}

export function DiagramElementTargetPicker(
  props: DiagramElementTargetPickerProps
): React.JSX.Element

export function resolveDiagramElementNavigation(args: {
  diagramId: string
  elementKey: string
  refs: DiagramRef[]
  isTargetNavigable: (target: DiagramRefTarget) => boolean
  getTargetLabel: (target: DiagramRefTarget) => string
}): DiagramElementNavigationResolution

export type DiagramReviewViewProps = DiagramReviewViewBaseProps

export type DiagramReviewExportPayload = {
  diagramId: string
  svg: string
  sourceHash: `sha256:${string}`
  rendererVersion: string
  detectedKind: DiagramKind
  theme: DiagramRenderTheme
}

export type DiagramReviewViewExportActions = {
  onCopySvg: (payload: DiagramReviewExportPayload) => Promise<void>
  onExportPng: (payload: DiagramReviewExportPayload) => Promise<void>
}
```

Required behavior:

- Source editor uses a local draft. Typing does not call persistence.
- `DiagramReviewView` reports every local draft change through `onDraftStateChange`. The controller stores the latest dirty snapshot and owns all navigation blocking decisions.
- Runtime rendering uses the current draft source by passing a transient `Diagram` object whose `source` equals `draftSource` to `renderAdapter.renderDiagram(...)`. This does not persist source, kind, or render output.
- Explicit Save, Cmd+S, or Ctrl+S calls `onSaveSource`; successful callback must persist to `.scry` through controller/model-store.
- Invalid Mermaid diagnostics do not overwrite the saved source. A user may still explicitly save invalid source so work is not lost; that saved diagram remains visible with diagnostics until fixed.
- Switching away with unsaved draft changes must show Save and switch, Discard and switch, and Cancel. Save failure keeps the user in the current diagram with the draft intact.
- External reload conflicts are shown only through `externalReloadConflict`; for `diskState: 'modified'`, `onResolveExternalReloadConflict('compare-changes')` opens a read-only diff and returns to the same conflict state when closed until the user chooses `keep-draft` or `reload-from-disk`. For `diskState: 'deleted'`, Compare changes is not shown; the choices are Keep draft, Discard deleted, and Cancel.
- If current draft cannot render, the render pane must show an invalid state and display the previous successful SVG only with a visible stale badge and old `sourceHash`. It must not hide the stale state or present the old SVG as current.
- Render errors show diagnostics and keep the user source intact.
- `exportActions` is the only prop that enables copy/export controls. S2 must omit `exportActions`; it must not pass no-op callbacks. When `exportActions` is absent, `DiagramReviewView` renders no copy/export controls. S7B is the first slice allowed to pass real `DiagramReviewViewExportActions`.
- After S7B adds export actions, copy/export buttons are disabled while current render is unavailable, stale, invalid, editing is locked, or `DiagramDraftStateSnapshot.dirty === true`.
- Copy/export callbacks receive `DiagramReviewExportPayload` from the current successful sanitized render result. They must not refetch by `diagramId` and accidentally export stale persisted source.
- `onExportPng` owns the destination prompt through native save dialog or the existing Orca save-file flow. Default filename is sanitized diagram name, falls back to diagram id when empty, and always uses `.png`. User cancel is not an error and writes nothing. Export write failure surfaces `controller.export-failed` and must not update cache or `.scry`.
- `refActions` is the only prop that enables diagram reference management and target navigation inside `DiagramReviewView`.
- S2 must omit `refActions`; it must not pass empty refs or no-op callbacks. When `refActions` is absent, `DiagramReviewView` renders no ref-management controls and clicking SVG elements does not navigate or create refs.
- S3/S4 are the first slices allowed to pass real `DiagramReviewViewRefActions`.
- Direct SVG element clicks must call `resolveDiagramElementNavigation(...)` before navigation. If it returns `none`, no state changes. If it returns `navigate`, call `refActions.onNavigateRefTarget(candidate.target)`. If it returns `choose-target`, show a target picker; navigation happens only after the user chooses one candidate.
- `resolveDiagramElementNavigation(...)` filters refs by exact `diagramId` and `elementKey`, drops non-navigable/dangling targets through `isTargetNavigable`, collapses multiple refs with the same target into one candidate, and sorts candidates by target type order node, edge, group, flow, flowStep, source; then label; then target id or pattern; then first role; then first ref id.
- The target picker must receive `DiagramElementTargetPickerProps` exactly. It must render the `candidates` returned by `resolveDiagramElementNavigation(...)` without recomputing or resorting them. `onChoose(candidate)` is the only path that navigates. `onCancel()` closes the picker and leaves architecture mode, active diagram, C4 selection, flow selection, and source-open state unchanged.
- The target picker must display the collapsed roles/notes for each candidate so users can tell why the same SVG element is linked to multiple places.
- Clicking an unbound SVG element does not navigate.

Required tests:

- Component tests may mock `renderAdapter`, but must assert exact callback arguments, local draft behavior, disabled states, and diagnostic display.
- S2 tests must assert `refActions` is absent, ref-management controls are not rendered, and SVG clicks do not call no-op navigation. S3/S4 tests must assert real `DiagramReviewViewRefActions` payloads and navigation target payloads.
- S4 tests must cover `resolveDiagramElementNavigation(...)` for no target, one target, multiple refs for the same target, and multiple distinct targets. Multiple distinct targets must show the picker and must not navigate before a user selection.
- S4 target-picker tests must assert `DiagramElementTargetPickerProps.candidates` equals the resolver output, `onChoose` navigates to the chosen candidate only, and `onCancel` performs no navigation or source-open side effect.
- S2 tests must assert `exportActions` is absent and copy/export controls are not rendered. S7B tests must assert real `onCopySvg` and `onExportPng` callbacks receive the current `DiagramReviewExportPayload` and are disabled for dirty, invalid, stale, unavailable, or locked render state.
- Completion evidence also needs a live or integration test using FX2 copied to a temp project proving source update persists after reload.

## Controller function contracts

These functions belong in `useArchitectureModelController` as returned callbacks or clearly named internal callbacks covered by tests.

```ts
export type CreateDiagramInput = {
  name: string
  kind: DiagramKind
  notation: DiagramNotation
  source: string
  description?: string
  tags?: string[]
}

export type CreateDiagramRefInput = {
  diagramId: string
  target: DiagramRefTarget
  role: DiagramRefRole
  elementKey?: string
  sourceRange?: DiagramSourceRange
  note?: string
}

export type DiagramMutationResult = {
  model: C4ModelDataV2
  changedDiagramIds: string[]
  deletedRefIds: string[]
}

export type ArchitectureNavigationTarget =
  | { type: 'topology'; nodeId?: string; edgeId?: string }
  | { type: 'flow'; flowId: string }
  | { type: 'groups' }
  | { type: 'diagram'; diagramId: string }
  | { type: 'model'; modelName: string }
  | { type: 'closeDiagramView' }

export type DiagramControllerErrorCode =
  | 'controller.empty-name'
  | 'controller.empty-source'
  | 'controller.diagram-not-found'
  | 'controller.ref-not-found'
  | 'controller.duplicate-id'
  | 'controller.missing-target'
  | 'controller.invalid-source-target'
  | 'controller.source-open-failed'
  | 'controller.missing-role'
  | 'controller.other-note-required'
  | 'controller.invalid-element-key'
  | 'controller.export-failed'
  | 'controller.persist-failed'
  | 'controller.revision-conflict'

export class DiagramControllerError extends Error {
  readonly code: DiagramControllerErrorCode
  readonly details?: unknown

  constructor(code: DiagramControllerErrorCode, message: string, details?: unknown)
}

export function createDiagramId(name: string, existingIds: Set<string>): string

export function createDefaultDiagramSource(kind: DiagramKind, name: string): string

export function createDiagramRefId(
  target: DiagramRefTarget,
  diagramId: string,
  existingIds: Set<string>
): string

createDiagram(input: CreateDiagramInput): Promise<DiagramMutationResult>
renameDiagram(diagramId: string, name: string): Promise<DiagramMutationResult>
updateDiagramSource(diagramId: string, source: string): Promise<DiagramMutationResult>
deleteDiagram(diagramId: string): Promise<DiagramMutationResult>
createDiagramRef(input: CreateDiagramRefInput): Promise<DiagramMutationResult>
upsertDiagramRefs(refs: DiagramRef[]): Promise<DiagramMutationResult>
deleteDiagramRefs(refIds: string[]): Promise<DiagramMutationResult>
selectDiagram(diagramId: string): void
requestArchitectureNavigation(target: ArchitectureNavigationTarget): Promise<boolean>
resolveExternalDiagramReload(
  diagramId: string,
  resolution: DiagramExternalReloadResolution
): Promise<void>
```

Required behavior:

- Every mutation must call the same persistence path used by existing model writes. Updating React state only is not complete.
- `createDefaultDiagramSource` returns a valid non-empty Mermaid source. For unsupported or unknown create-time kinds, it returns the flowchart template from the system contract and callers must store `kind: 'flowchart'`.
- `createDiagram` rejects empty source and uses `createDiagramId` to generate `Diagram.id`; UI callers must not invent ids inline.
- S1 and S3A create flows must pass `createDefaultDiagramSource(...)` output into `createDiagram` before opening draft editing.
- `createDiagram` sets `updatedAt` to the mutation time.
- `renameDiagram` trims name, rejects empty name, and updates `updatedAt` only when the name changes.
- `updateDiagramSource` preserves diagram id and refs, updates `updatedAt` only when source or persisted kind changes, and normalizes `Diagram.kind` only after successful `detectMermaidDiagramKind(source)` on explicit Save. This shared helper is available from F1A, so S1 does not depend on the renderer adapter.
- `deleteDiagram` deletes related refs. It requests cache cleanup only after S7B wires UI delete to the real S7A cache IPC; before S7B, no production no-op cache cleanup is allowed and the traceability row for UI cache cleanup remains incomplete.
- `createDiagramRef` uses `createDiagramRefId`, validates `diagramId`, validates target, rejects unsafe `{ type: 'source' }` targets with `controller.invalid-source-target`, requires explicit `role`, requires `note` for `role: 'other'`, and allows `elementKey` only when it comes from adapter `DiagramRenderedElement[]`.
- `upsertDiagramRefs` validates diagram id and target before saving.
- `upsertDiagramRefs` and `deleteDiagramRefs` do not update `Diagram.updatedAt`.
- `selectDiagram` sets `architectureMode: 'diagram'` and `activeDiagramId`, but it is an internal controller helper only. UI event handlers must call `requestArchitectureNavigation({ type: 'diagram', diagramId })`; they must not call `selectDiagram` directly.
- `requestArchitectureNavigation` is the only controller entry point for user navigation while a diagram draft may be dirty. It reads the latest `DiagramDraftStateSnapshot`, shows the fixed Save and switch / Discard and switch / Cancel dialog when needed, and returns `true` only after navigation has been completed.
- `resolveExternalDiagramReload` applies Keep draft, Reload from disk, Compare changes, Discard deleted, or Cancel for the current `externalReloadConflict`. It must retain `baseRevision` and `diskRevision` so save-after-keep-draft uses the normal revision-conflict path. `compare-changes` must not mutate `.scry`, draft source, or active selection. `discard-deleted` applies only when `diskState === 'deleted'`; it accepts the disk deletion, clears the active diagram, and applies the deletion fallback.
- `resolveExternalDiagramReload` must compare `externalReloadConflict.modelName` with the current active model before applying Keep draft or Reload from disk. A stale conflict for another model is ignored or surfaced as a non-mutating warning; it must never overwrite the current model's draft.
- On failure, mutation functions must throw `DiagramControllerError` with one of the `controller.*` codes from the error code matrix. They must leave current model state unchanged; UI code catches the error and exposes a user-visible error state. Do not return mixed success/failure unions from controller functions.
- Diagram library ordering and delete fallback must use the stable comparator from the system contract.

Required tests:

- `createDiagramId` and `createDiagramRefId` tests prove slug fallback, allowed characters, collision retry, and max length.
- Each mutation has a controller test proving model state changes.
- Each validation/persistence failure has a controller test asserting the thrown `DiagramControllerError.code`.
- `requestArchitectureNavigation` tests cover C4, flow, diagram, model switch, and close-view attempts from a dirty draft, including save failure.
- `resolveExternalDiagramReload` tests cover modified conflicts with Keep draft, Reload from disk, Compare changes, closing the read-only diff, and save-after-keep-draft revision conflict with `baseRevision` and `diskRevision`; deleted conflicts with Keep draft, Discard deleted, and Cancel; and active selection fallback after accepting deletion.
- `createDiagramRef` tests cover whole-diagram ref, element-level ref, missing role, missing diagram, missing target, unsafe source target, and `other` without note.
- At least one persistence test copies FX2 into a temp project, performs create/edit/delete, reloads through the real model-store path, and proves `.scry` changes survive reload.
- After S7B, UI delete diagram test proves refs are removed, real Derived cache cleanup is requested, and active diagram selection falls back correctly.
- Before S7A, delete diagram tests prove no cache files are created and no cache IPC stub is claimed as completion. S7A adds the real cache service; S7B adds UI cleanup integration.

## AI prompt integration contracts

S6 changes the existing Orca-Scryer prompt path. It must update the current TypeScript prompt exports instead of adding a detached Markdown prompt or a parallel prompt runner.

```ts
export type SerializeModelForPromptOptions = {
  includeDiagramSourcesForDiagramIds?: string[]
  includeDiagramSourcesForTargets?: DiagramRefTarget[]
  driftedDiagramIds?: string[]
}

export type PromptDiagramSummary = {
  id: string
  name: string
  kind: DiagramKind
  notation: DiagramNotation
  description?: string
  tags?: string[]
  sourceHash: `sha256:${string}`
  sourceOmitted: true
  relatedTargets: DiagramRefTarget[]
}

export function diagramRefTargetMatchesPromptScope(
  refTarget: DiagramRefTarget,
  scopedTarget: DiagramRefTarget
): boolean

export function serializeModelForPrompt(
  model: C4ModelDataV2,
  options?: SerializeModelForPromptOptions
): string

export function buildDiagramPromptInstructions(
  context:
    | 'initial-model'
    | 'node-fill'
    | 'deep-build'
    | 'sync'
    | 'advisor'
    | 'task-implementation'
    | 'mcp-rules'
): string

export function initialModelPrompt(modelName: string, cwd: string): string
export function nodeFillPrompt(args: {
  modelName: string
  cwd: string
  nodeId: string
  nodeName: string
  nodeKind: string
  modelJson: string
}): string
export function deepModelPrompt(args: {
  modelName: string
  cwd: string
  modelJson: string
}): string
export function syncPrompt(args: {
  modelName: string
  cwd: string
  drift: DriftReportV2
  modelJson: string
}): string
```

Required behavior:

- `serializeModelForPrompt(...)` keeps the existing compact model serialization behavior and adds compact diagram summaries. By default it must omit full `diagram.source`, include `sourceOmitted: true`, include `sourceHash`, and include `relatedTargets` derived from `diagramRefs`.
- `SerializeModelForPromptOptions` is the only allowed way to include full diagram source in prompt JSON. Full source may be included only for explicitly requested diagram ids, linked targets in scope, or diagrams marked by `DriftReportV2.diagramRefs`.
- `diagramRefTargetMatchesPromptScope(...)` is the required matching rule for `includeDiagramSourcesForTargets`. It compares targets by normalized semantic identity, not by object reference. For `node`, `edge`, `group`, and `flow`, `type` plus id must match exactly. For `flowStep`, `flowId` and `stepId` must match exactly after recursive step validation. For `source`, both patterns are first normalized with `validateWorkspaceRelativeSourcePattern(..., 'parser')`; unsafe source targets do not match; safe source targets match by normalized pattern only. `line` and `endLine` are intentionally ignored for prompt inclusion because they are code-opening hints, not prompt scope identity.
- `PromptDiagramSummary` is intentionally smaller than MCP `CompactDiagramSummary`. Prompt summaries are optimized for token size and omit `updatedAt` and `refCount`; MCP summaries are optimized for tool callers and may include those fields. Implementations may share a builder only if it has explicit output modes and tests proving prompt output stays compact.
- `buildDiagramPromptInstructions(...)` must be exported from `src/shared/scryer/prompt-diagram-instructions.ts`. `prompts.ts` and `rules.ts` must import that shared function; neither file may reimplement the diagram rules or import the other just to get diagram prompt text. This avoids circular imports and prevents Deep Build/Sync rules from drifting away from `TASK_INSTRUCTIONS`.
- `initialModelPrompt(...)` must call or embed `buildDiagramPromptInstructions('initial-model')`; it must say that the initial system/container pass normally skips diagram creation unless the user explicitly requested diagrams.
- `nodeFillPrompt(...)` must call or embed `buildDiagramPromptInstructions('node-fill')`; it may allow one proactive supplemental diagram for the scoped node only when a C4 subtree would hide state, sequence, class/data, or deployment detail. If a diagram is created, the prompt must require `update_diagram_refs` linking it to the scoped node or source target.
- `deepModelPrompt(...)` must call or embed `buildDiagramPromptInstructions('deep-build')`; it must contain a named "Diagram recovery" phase after flow/contract recovery. That phase must tell the agent to use `set_diagrams`, `get_diagram`, and `update_diagram_refs`, update existing diagrams first, and avoid duplicating design intent.
- `syncPrompt(...)` must call or embed `buildDiagramPromptInstructions('sync')`; it must render a "Potentially drifted diagrams" section from `DriftReportV2.diagramRefs`. For each affected diagram whose source is omitted, the prompt must explicitly instruct the agent to call `get_diagram` before editing it.
- `SCRYER_RULES` and `MCP_INSTRUCTIONS` in `rules.ts` must call or embed `buildDiagramPromptInstructions('mcp-rules')` semantics: C4/flow trees remain clean, diagrams live in top-level `diagrams`, and links live in `diagramRefs`.
- `TASK_INSTRUCTIONS` in `rules.ts` must include `buildDiagramPromptInstructions('task-implementation')` semantics: when a task has linked diagrams, Codex/Claude must treat those diagrams as implementation context, fetch omitted sources with `get_diagram`, and update affected diagrams when the code change invalidates them and the task scope allows it.
- `advisorPrompt(...)` may include `buildDiagramPromptInstructions('advisor')`; it can report missing or stale diagrams, but it must not mutate diagrams unless the user explicitly asked the advisor to apply changes.
- Diagram-to-code work must remain tied to C4/flow/source context. If a user asks an agent to implement from a diagram that has no `diagramRefs`, the prompt must ask for a target link first or create the link through the diagram ref workflow before changing code.

Required tests:

- `src/shared/scryer/prompts.test.ts` must assert the exact public prompt functions above contain the appropriate diagram instruction block for their context.
- Prompt compactness tests must read FX9 and prove full diagram sources are omitted by default, `sourceHash` is present, and `sourceOmitted: true` is present.
- Scoped source tests must prove `serializeModelForPrompt(..., { includeDiagramSourcesForDiagramIds })` includes only requested full sources and does not include unrelated diagram sources.
- Scoped target tests must prove `serializeModelForPrompt(..., { includeDiagramSourcesForTargets })` uses `diagramRefTargetMatchesPromptScope(...)`, including exact `flowStep` matching, normalized source pattern matching, and ignored `source.line/endLine`.
- Sync prompt tests must construct a real `DriftReportV2.diagramRefs` entry and assert the "Potentially drifted diagrams" section plus the `get_diagram` instruction.
- Task prompt tests must assemble a real `get_task` response/prompt through the existing MCP task path and assert the resulting task prompt includes the `task-implementation` diagram instructions. Direct assertions against `TASK_INSTRUCTIONS` are allowed only as supplemental unit coverage and cannot be the only completion evidence.

## Source target validation and opening functions

Source target handling is split into two layers so parser code can stay synchronous and filesystem-free:

- `validateWorkspaceRelativeSourcePattern(...)` is a pure shared helper in `src/shared/scryer/source-targets.ts` or a sibling shared module. It is importable by parser, renderer/controller code, and main-process MCP code. It must not import `fs`, glob libraries, Electron, React, DOM APIs, or cache authorization helpers.
- `resolveWorkspaceSourcePattern(...)` and `openDiagramSourceTarget(...)` are runtime helpers for controller/main-process source navigation. They may touch the filesystem, expand globs, call the trusted project authorization helper from S7A, and delegate to the existing source-open action.

Parser normalization must call only the pure helper. It must not become async and must not open or stat files.

```ts
export type SourceTargetPatternValidationReason =
  | 'empty'
  | 'absolute'
  | 'windows-drive'
  | 'home-prefix'
  | 'url-scheme'
  | 'nul-byte'
  | 'parent-traversal'
  | 'unsupported-glob'

export type SourceTargetPatternValidationResult =
  | { ok: true; normalizedPattern: string }
  | {
      ok: false
      code: 'parser.invalid-source-target' | 'controller.invalid-source-target'
      reason: SourceTargetPatternValidationReason
      rejectedPattern: string
    }

export function validateWorkspaceRelativeSourcePattern(
  pattern: string,
  caller: 'parser' | 'controller'
): SourceTargetPatternValidationResult

export type SourceTargetResolutionReason =
  | 'glob-escape'
  | 'outside-project'
  | 'no-matches'
  | 'unauthorized-project'
  | 'filesystem-error'

export type SourceTargetResolutionResult =
  | { ok: true; authorizedProjectPath: string; normalizedPattern: string; matchedRelativePaths: string[] }
  | {
      ok: false
      code: 'controller.invalid-source-target' | 'controller.source-open-failed'
      reason: SourceTargetResolutionReason
      rejectedPattern: string
    }

export type SourceOpenLocation = {
  relativePath: string
  line?: number
  endLine?: number
}

export type SourceTargetRuntimeContext = {
  projectPath: string
  store: Store
}

export function resolveWorkspaceSourcePattern(
  context: SourceTargetRuntimeContext,
  normalizedPattern: string
): Promise<SourceTargetResolutionResult>

export type OpenDiagramSourceTargetResult =
  | { ok: true; action: 'opened'; locations: SourceOpenLocation[] }
  | { ok: true; action: 'selection-required'; locations: SourceOpenLocation[] }
  | {
      ok: false
      code: 'controller.invalid-source-target' | 'controller.source-open-failed'
      reason: string
      rejectedPattern: string
    }

export function openDiagramSourceTarget(
  context: SourceTargetRuntimeContext,
  target: Extract<DiagramRefTarget, { type: 'source' }>
): Promise<OpenDiagramSourceTargetResult>
```

Required behavior:

- `validateWorkspaceRelativeSourcePattern` trims and POSIX-normalizes `pattern`; it rejects empty values, absolute paths, Windows drive prefixes, `~`, URL schemes, NUL bytes, and any `..` segment.
- The pure helper allows only `*`, `**`, and `?` as glob characters. Unsupported glob syntax returns `unsupported-glob`. It does not expand globs and does not prove that files exist.
- Parser calls use `caller: 'parser'` and return `parser.invalid-source-target` without opening files.
- UI/controller calls use `caller: 'controller'` and return `controller.invalid-source-target` before saving or opening.
- `SourceTargetRuntimeContext.store` is the main-process `Store` needed by filesystem authorization; renderer code never receives or fabricates it.
- `Store` means the existing main-process store type from Orca persistence code. Do not create a renderer-side replacement just to satisfy this contract.
- `resolveWorkspaceSourcePattern` must call the S7A `assertAuthorizedArchitectureProjectPath(context.projectPath, context.store)` helper before glob expansion or path resolution. If the project path is not authorized, return `controller.invalid-source-target` with `reason: 'unauthorized-project'`.
- `resolveWorkspaceSourcePattern` expands allowed globs only after authorization. Every resolved path must remain inside the canonical authorized project root after symlink/path resolution; escaping matches return `controller.invalid-source-target` with `reason: 'glob-escape'` or `outside-project`.
- `DiagramRefTarget.source.line/endLine` are code-file line numbers. `DiagramRef.sourceRange` is a Mermaid-source range and must not be used as a file-open location.
- `openDiagramSourceTarget` must call `validateWorkspaceRelativeSourcePattern(target.pattern, 'controller')` first, then `resolveWorkspaceSourcePattern(context, normalizedPattern)`, then delegate to the existing editor/source-open action. If a valid resolved path cannot be opened because the file is missing, permission is denied, or the existing open action fails, return `controller.source-open-failed`.
- When resolution finds no matching files, return `controller.source-open-failed` with `reason: 'no-matches'`.
- When resolution finds one matching file, open that file at `target.line/endLine` when provided and return `action: 'opened'`.
- When resolution finds multiple matching files, do not open the first match automatically. Return `action: 'selection-required'` with sorted `SourceOpenLocation[]`; UI must show a picker and open only the user-selected location.
- S3 source ref creation uses only the pure helper and does not open files. S4 source navigation/opening requires S7A because it needs project authorization and filesystem resolution.

Required tests:

- FX3 unsafe source target variants assert `parser.invalid-source-target`.
- S3/S4 UI validation tests assert `controller.invalid-source-target` before persistence.
- S4 source open test uses a real temp workspace file and proves valid relative paths open at the requested line, zero matches return `controller.source-open-failed`, multi-match globs show selection instead of auto-opening the first file, and absolute, traversal, URL, unsupported glob, and escaping glob patterns do not open. Escaping glob/symlink cases are tested at the runtime resolution layer, not in parser-only tests.

## MCP handler contracts

MCP handlers belong in `src/main/scryer/mcp-tools.ts` and must be exposed through `src/cli/scryer-mcp-server.ts`.

```ts
export type ScryerDiagramToolReadContext = {
  projectPath: string
  modelName?: string | null
  model: C4ModelDataV2
}

export type ScryerDiagramToolWriteContext = ScryerDiagramToolReadContext & {
  writeModel: (projectPath: string, model: C4ModelDataV2, modelName?: string | null) => Promise<void>
}

export type ScryerDiagramToolDeleteContext = ScryerDiagramToolWriteContext & {
  clearDiagramCache: (request: DiagramCacheClearRequest) => Promise<DiagramCacheClearResult | DiagramCacheFailure>
}

handleSetDiagrams(
  args: SetDiagramsArgs,
  context: ScryerDiagramToolWriteContext
): Promise<ScryerToolResult>

handleGetDiagram(
  args: GetDiagramArgs,
  context: ScryerDiagramToolReadContext
): Promise<ScryerToolResult>

handleDeleteDiagram(
  args: DeleteDiagramArgs,
  context: ScryerDiagramToolDeleteContext
): Promise<ScryerToolResult>

handleUpdateDiagramRefs(
  args: UpdateDiagramRefsArgs,
  context: ScryerDiagramToolWriteContext
): Promise<ScryerToolResult>
```

Required behavior:

- The MCP dispatcher/CLI bridge consumes optional `model?: string`, normalizes it through the existing Scryer model-name path, loads the selected model, and constructs the context before calling these handlers. Handler `args` must not include `model`.
- Handlers must parse JSON string args exactly once and return `{ ok: false, content, data: { code, details? } }` on validation errors.
- Successful write handlers must persist through `context.writeModel(context.projectPath, nextModel, context.modelName)`, not mutate only `context.model`.
- `set_diagrams replaceAll` deletes refs for removed diagrams.
- `set_diagrams` must detect source kind with shared `detectMermaidDiagramKind`. If detected kind conflicts with payload `Diagram.kind`, return `{ ok:false, data:{ code:'mcp.validation-failed', details:{ validationCodes:['renderer.kind-conflict'], diagramId, storedKind, detectedKind }}}` and do not write any diagrams.
- `delete_diagram` deletes refs and requests cache cleanup through the S7A `context.clearDiagramCache`. Cache cleanup failure returns success with `data.warnings` because Derived cache is rebuildable; it must not silently omit the warning.
- `update_diagram_refs delete` accepts only `ref_ids`. It must reject missing `ref_ids` with `mcp.mode-argument-missing`, and reject `data` in delete mode with `mcp.validation-failed`; it must not read ids embedded inside `data`.
- MCP payloads must include explicit `Diagram.id` and `DiagramRef.id`; handlers reject missing, empty, duplicate, or invalid ids instead of generating ids for external agents.
- `get_diagram` must not require or receive `writeModel` or `clearDiagramCache`.
- CLI bridge `tools/list` must expose every diagram tool with exact `additionalProperties: false` schema.

Required tests:

- One test per mode: `set_diagrams upsert`, `set_diagrams replaceAll`, `update_diagram_refs upsert`, `replaceForDiagram`, `delete`.
- Failure tests for invalid JSON, missing diagram, missing target, unsafe source target, invalid source range, duplicate ids, and source-kind conflict must assert the matching `mcp.*`, `parser.*`, `controller.*`, or `renderer.kind-conflict` detail from the error code matrix.
- Existing tool tests must cover `get_model`, `get_node`, `get_changes`, and `validate_model` returning the additive compact diagram fields from the system contract while omitting full `diagram.source` by default.
- External CLI bridge test must call `tools/list`; importing handler functions directly is not enough.

## Cache IPC contracts

These functions belong in the main process cache service and are exposed by `architecture.ts`, `src/preload/api-types.ts`, and `src/preload/index.ts`.

```ts
export type DiagramCacheReadRequest = {
  projectPath: string
  modelName?: string | null
  diagramId: string
  cacheKey: `sha256:${string}`
  outputProfile: DiagramCacheOutputProfile
}

export type DiagramCacheWriteRequest = DiagramCacheReadRequest & {
  svg?: string
  pngDataUrl?: string
}

export type DiagramCacheClearRequest = {
  projectPath: string
  modelName?: string | null
  diagramId?: string
}

export type DiagramCacheReadResult =
  | { ok: true; hit: true; outputProfile: 'review'; svg: string }
  | { ok: true; hit: true; outputProfile: 'thumbnail' | 'export'; pngDataUrl: string }
  | { ok: true; hit: false; outputProfile: DiagramCacheOutputProfile; code: 'cache.read-miss' }

export type DiagramCacheWriteResult = { ok: true }

export type DiagramCacheClearResult = { ok: true }

export type DiagramCacheFailure = {
  ok: false
  code: DiagramCacheErrorCode
  message: string
  details?: unknown
}

export type DiagramCacheErrorCode =
  | 'cache.invalid-diagram-id'
  | 'cache.invalid-cache-key'
  | 'cache.unauthorized-project'
  | 'cache.empty-payload'
  | 'cache.payload-too-large'
  | 'cache.payload-profile-mismatch'
  | 'cache.path-outside-cache'
  | 'cache.write-failed'
  | 'cache.clear-failed'

export const MAX_DIAGRAM_CACHE_SVG_BYTES = 2 * 1024 * 1024
export const MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES = 10 * 1024 * 1024

export type AuthorizedArchitectureProject = {
  projectPath: string
}

export function assertAuthorizedArchitectureProjectPath(
  projectPath: string,
  store: Store
): Promise<AuthorizedArchitectureProject>
```

Required behavior:

- Cache IPC never accepts arbitrary file paths.
- `projectPath` must pass `assertAuthorizedArchitectureProjectPath(projectPath, store)` before any path is resolved. S7A must implement this helper as a thin wrapper over existing `src/main/ipc/filesystem-auth.ts`.
- Authorization must come from `filesystem-auth.ts` allowed roots and registered worktree roots. Cache IPC must not authorize a path merely because the renderer passed it, and it must not expose an IPC that registers arbitrary paths.
- S7A must not create a second independent authorization table. If `architecture-project-auth.ts` exists, it delegates to `filesystem-auth.ts` functions such as `resolveAuthorizedPath(...)`, `resolveRegisteredWorktreePath(...)`, `invalidateAuthorizedRootsCache()`, and `registerWorktreeRootsForRepo(...)` where appropriate.
- The trusted registration entry points remain the current Orca flows:
  - `src/main/ipc/repos.ts` `repos:create`, immediately after the successful `store.addRepo(repo)` path that calls `invalidateAuthorizedRootsCache()`.
  - `src/main/ipc/worktrees.ts` `worktrees:list`, `worktrees:listAll`, and `worktrees:listDetected`, in the same branch that calls `rememberLocalWorktreeRoots(...)` / `registerWorktreeRootsForRepo(...)`.
  - Tests may seed the existing `filesystem-auth.ts` registration seam directly only as a main-process test seam that represents one of those trusted flows; production renderer/preload/cache IPC must not expose registration.
- A cache request for an existing but unauthorized temp path must return `cache.unauthorized-project`. The same temp path may succeed only after the existing trusted filesystem-auth seam authorizes it.
- `assertAuthorizedArchitectureProjectPath` canonicalizes the candidate path, delegates to `filesystem-auth.ts`, and returns a canonical authorized project path. A parent/child path is not automatically authorized unless the existing filesystem-auth rule allows it for the selected repo/worktree/workspace.
- The helper returns the canonical authorized project path. Cache code must use that returned path, not the raw renderer-provided `projectPath`.
- If authorization fails, cache IPC returns `DiagramCacheFailure` with `code: 'cache.unauthorized-project'`; it must not leak arbitrary local paths in user-facing messages.
- `diagramId` must match `[A-Za-z0-9_-]{1,120}`.
- `cacheKey` must match `sha256:<64 lowercase hex>`.
- Write requests must include exactly the payload required by `outputProfile`: `review` requires `svg`; `thumbnail` and `export` require `pngDataUrl`.
- Wrong payload shape returns `cache.payload-profile-mismatch`.
- Path containment must be checked after resolving the final path.
- SVG payloads larger than `MAX_DIAGRAM_CACHE_SVG_BYTES` return `cache.payload-too-large` and write nothing.
- PNG data URL payloads larger than `MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES` return `cache.payload-too-large` and write nothing.
- `cache.read-miss` is a successful cache miss result, not a `DiagramCacheFailure.code`. Corrupt cache reads return `{ ok: true, hit: false, outputProfile, code: 'cache.read-miss' }`, not a model load failure.
- S7A implements read/write/clear behavior for `review`, `thumbnail`, and `export` profiles but does not wire UI usage. S7B is responsible for enabling review SVG cache usage in DiagramReviewView and thumbnail/export cache usage in the UI.
- Cache read/write results do not carry metadata. Stale review SVG state is tracked by `DiagramReviewView` runtime render state using the previous successful SVG and old `sourceHash`; cache files must not grow a sidecar metadata database.

Required tests:

- Real temp project path test using FX8 proves cache writes only under `.scryer/cache/diagrams`.
- Unauthorized project paths are rejected with `cache.unauthorized-project`; the same temp path succeeds only after the existing `filesystem-auth.ts` trusted registration seam authorizes it.
- Authorization tests prove cache auth reuses `filesystem-auth.ts` and that renderer/cache IPC cannot register arbitrary paths or bypass allowed roots.
- Path traversal inputs are rejected with `cache.invalid-diagram-id` or `cache.path-outside-cache`.
- Empty write payloads are rejected with `cache.empty-payload`.
- Wrong payload kind for the requested `outputProfile` is rejected with `cache.payload-profile-mismatch`.
- Oversized payloads are rejected with `cache.payload-too-large`.
- Write failures are returned as `cache.write-failed` without reporting success.
- A corrupt cache file returns `cache.read-miss` and can be rebuilt.
- Clear failures are returned as `cache.clear-failed` and do not delete unrelated cache directories.

## Anti-skeleton and real-data test gates

A task is not complete if any of these are true:

- A production function returns `{ ok: true }` without changing `.scry` or cache files required by the task.
- A UI button is wired but has no persisted effect after reload.
- A test only asserts that a component rendered, without asserting state transition or saved data.
- A test uses mocked model-store as the only proof for persistence.
- A test imports MCP handlers directly as the only proof that external Codex/Claude can see the tool.
- A test uses fake in-memory cache as the only proof for path containment.
- A PR lacks before/after `.scry` evidence for any changed model persistence path.

Every implementation PR for this feature must include:

- At least one non-mocked `.scry` read/write/reload test when model data changes.
- At least one real adapter test when Mermaid support is claimed.
- At least one real cache path test when cache IPC changes.
- At least one external MCP CLI `tools/list` or tool-call test when MCP tools change.
- Live verification evidence for any user-visible Architecture UI behavior.
