/* eslint-disable max-lines -- Why: S1/S3 shared diagram and diagram-ref mutations stay together until the controller is split after the diagram library slices settle. */
import { detectMermaidDiagramKind } from './diagram-kind'
import { createDiagramId, createDiagramRefId, sortDiagramsForLibrary } from './diagram-ids'
import type {
  C4ModelData,
  Diagram,
  DiagramKind,
  DiagramNotation,
  DiagramRef,
  DiagramRefRole,
  DiagramRefTarget
} from './model-types'
import { SCRY_SCHEMA_VERSION } from './model-types'
import { findFlowStep } from './parse-model'
import { validateWorkspaceRelativeSourcePattern } from './source-targets'

export type ArchitectureDiagramFeatureFlags = {
  enableArchitectureDiagramLibraryPreview: boolean
}

export const DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS: ArchitectureDiagramFeatureFlags = {
  enableArchitectureDiagramLibraryPreview: true
}

export type CreateDiagramInput = {
  name: string
  kind: DiagramKind
  notation: DiagramNotation
  source: string
}

export type CreateDiagramRefInput = {
  diagramId: string
  target: DiagramRefTarget
  role?: DiagramRefRole
  elementKey?: string
  sourceRange?: DiagramRef['sourceRange']
  note?: string
}

export type DiagramMutationResult = {
  model: C4ModelData
  changedDiagramIds: string[]
  deletedDiagramRefIds: string[]
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

export type ArchitectureNavigationTarget =
  | { type: 'topology' }
  | { type: 'flows'; flowId?: string | null }
  | { type: 'groups' }
  | { type: 'diagram'; diagramId: string }

export function shouldPromptForDiagramDraftSwitch(
  snapshot: DiagramDraftStateSnapshot | null,
  target: ArchitectureNavigationTarget
): boolean {
  if (!snapshot?.dirty) {
    return false
  }
  return !(target.type === 'diagram' && target.diagramId === snapshot.diagramId)
}

export function createDiagramExternalReloadConflict(args: {
  modelName: string
  snapshot: DiagramDraftStateSnapshot
  diskDiagram: Diagram | null
  baseRevision: string
  diskRevision: string
}): DiagramExternalReloadConflict | null {
  if (!args.snapshot.dirty) {
    return null
  }
  if (!args.diskDiagram) {
    return {
      modelName: args.modelName,
      diagramId: args.snapshot.diagramId,
      draftSource: args.snapshot.draftSource,
      diskState: 'deleted',
      baseRevision: args.baseRevision,
      diskRevision: args.diskRevision
    }
  }
  if (args.diskDiagram.source === args.snapshot.persistedSource) {
    return null
  }
  return {
    modelName: args.modelName,
    diagramId: args.snapshot.diagramId,
    draftSource: args.snapshot.draftSource,
    diskState: 'modified',
    diskSource: args.diskDiagram.source,
    baseRevision: args.baseRevision,
    diskRevision: args.diskRevision,
    diskUpdatedAt: args.diskDiagram.updatedAt
  }
}

export class DiagramControllerError extends Error {
  code:
    | 'controller.empty-name'
    | 'controller.empty-source'
    | 'controller.duplicate-id'
    | 'controller.diagram-not-found'
    | 'controller.ref-not-found'
    | 'controller.missing-role'
    | 'controller.other-note-required'
    | 'controller.missing-target'
    | 'controller.invalid-source-target'
    | 'controller.persist-failed'
    | 'controller.revision-conflict'
  details?: Record<string, unknown>

  constructor(
    code: DiagramControllerError['code'],
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'DiagramControllerError'
    this.code = code
    this.details = details
  }
}

const VALID_DIAGRAM_ROLES = new Set<DiagramRefRole>([
  'architecture-detail',
  'behavior-detail',
  'sequence-detail',
  'state-detail',
  'data-detail',
  'class-detail',
  'deployment-detail',
  'evidence',
  'other'
])

function assertNoDuplicateDiagramIds(model: C4ModelData): void {
  const seen = new Set<string>()
  for (const diagram of model.diagrams ?? []) {
    if (seen.has(diagram.id)) {
      throw new DiagramControllerError(
        'controller.duplicate-id',
        `Duplicate diagram id '${diagram.id}'`,
        { duplicateId: diagram.id, entity: 'diagram' }
      )
    }
    seen.add(diagram.id)
  }
}

function assertNoDuplicateDiagramRefIds(refs: DiagramRef[]): void {
  const seen = new Set<string>()
  for (const ref of refs) {
    if (seen.has(ref.id)) {
      throw new DiagramControllerError(
        'controller.duplicate-id',
        `Duplicate diagramRef id '${ref.id}'`,
        { duplicateId: ref.id, entity: 'diagramRef' }
      )
    }
    seen.add(ref.id)
  }
}

function nextModelWithDiagrams(model: C4ModelData, diagrams: Diagram[]): C4ModelData {
  return {
    ...model,
    schemaVersion: SCRY_SCHEMA_VERSION,
    diagrams,
    diagramRefs: model.diagramRefs ?? []
  }
}

function nextModelWithDiagramRefs(model: C4ModelData, diagramRefs: DiagramRef[]): C4ModelData {
  return {
    ...model,
    schemaVersion: SCRY_SCHEMA_VERSION,
    diagrams: model.diagrams ?? [],
    diagramRefs
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function mermaidSafeIdentifier(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '') || fallback
}

export function createDefaultDiagramSource(kind: DiagramKind, name: string): string {
  const label = name.trim() || 'New diagram'
  switch (kind) {
    case 'sequence':
      return `sequenceDiagram\n  participant User\n  participant System\n  User->>System: ${label}`
    case 'class':
      return `classDiagram\n  class ${mermaidSafeIdentifier(label, 'Diagram')}`
    case 'state':
      return `stateDiagram-v2\n  [*] --> ${mermaidSafeIdentifier(label, 'Draft')}`
    case 'er':
      return `erDiagram\n  ENTITY {\n    string name\n  }`
    case 'flowchart':
    default:
      return `flowchart TD\n  draft[${label}]`
  }
}

function controllerErrorTargetDetails(target: DiagramRefTarget): Record<string, unknown> {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return { targetType: target.type, id: target.id }
    case 'flowStep':
      return { targetType: target.type, flowId: target.flowId, stepId: target.stepId }
    case 'source':
      return {
        targetType: target.type,
        pattern: target.pattern,
        line: target.line,
        endLine: target.endLine
      }
  }
}

function assertDiagramExists(model: C4ModelData, diagramId: string, operation: string): void {
  if (!(model.diagrams ?? []).some((diagram) => diagram.id === diagramId)) {
    throw new DiagramControllerError(
      'controller.diagram-not-found',
      `Diagram '${diagramId}' not found`,
      { diagramId, operation }
    )
  }
}

function normalizeSourceTarget(
  target: Extract<DiagramRefTarget, { type: 'source' }>
): Extract<DiagramRefTarget, { type: 'source' }> {
  const validation = validateWorkspaceRelativeSourcePattern(target.pattern, 'controller')
  if (!validation.ok) {
    throw new DiagramControllerError(
      'controller.invalid-source-target',
      `Source target '${target.pattern}' is not a safe workspace-relative pattern`,
      {
        rejectedPattern: validation.rejectedPattern,
        reason: validation.reason,
        targetType: 'source'
      }
    )
  }
  return {
    ...target,
    pattern: validation.normalizedPattern
  }
}

function normalizeAndValidateDiagramRefTarget(
  model: C4ModelData,
  target: DiagramRefTarget
): DiagramRefTarget {
  switch (target.type) {
    case 'node':
      if (model.nodes.some((node) => node.id === target.id)) {
        return target
      }
      break
    case 'edge':
      if (model.edges.some((edge) => edge.id === target.id)) {
        return target
      }
      break
    case 'group':
      if ((model.groups ?? []).some((group) => group.id === target.id)) {
        return target
      }
      break
    case 'flow':
      if ((model.flows ?? []).some((flow) => flow.id === target.id)) {
        return target
      }
      break
    case 'flowStep': {
      const flow = (model.flows ?? []).find((candidate) => candidate.id === target.flowId)
      if (flow && findFlowStep(flow, target.stepId)) {
        return target
      }
      break
    }
    case 'source':
      return normalizeSourceTarget(target)
  }

  throw new DiagramControllerError(
    'controller.missing-target',
    `Diagram ref target '${target.type}' is no longer available`,
    controllerErrorTargetDetails(target)
  )
}

function normalizeAndValidateDiagramRefInput(
  model: C4ModelData,
  input: CreateDiagramRefInput,
  id: string,
  operation: string
): DiagramRef {
  if (!input.role || !VALID_DIAGRAM_ROLES.has(input.role)) {
    throw new DiagramControllerError('controller.missing-role', 'Diagram ref role is required', {
      diagramId: input.diagramId,
      operation,
      target: input.target
    })
  }
  const note = input.note?.trim()
  if (input.role === 'other' && !note) {
    throw new DiagramControllerError(
      'controller.other-note-required',
      'A note is required when role is other',
      { diagramId: input.diagramId, operation, target: input.target }
    )
  }

  assertDiagramExists(model, input.diagramId, operation)
  const target = normalizeAndValidateDiagramRefTarget(model, input.target)

  return {
    id,
    diagramId: input.diagramId,
    target,
    role: input.role,
    ...(input.elementKey?.trim() ? { elementKey: input.elementKey.trim() } : {}),
    ...(input.sourceRange ? { sourceRange: input.sourceRange } : {}),
    ...(note ? { note } : {})
  }
}

export function createDiagram(
  model: C4ModelData,
  input: CreateDiagramInput
): DiagramMutationResult {
  const name = input.name.trim()
  if (!name) {
    throw new DiagramControllerError('controller.empty-name', 'Diagram name is required', {
      operation: 'create'
    })
  }
  if (!input.source.trim()) {
    throw new DiagramControllerError('controller.empty-source', 'Diagram source is required', {
      operation: 'create'
    })
  }

  assertNoDuplicateDiagramIds(model)
  const existingIds = new Set((model.diagrams ?? []).map((diagram) => diagram.id))
  const id = createDiagramId(name, existingIds)
  if (existingIds.has(id)) {
    throw new DiagramControllerError('controller.duplicate-id', `Duplicate diagram id '${id}'`, {
      duplicateId: id,
      entity: 'diagram'
    })
  }

  const diagram: Diagram = {
    id,
    name,
    kind: input.kind,
    notation: input.notation,
    source: input.source,
    updatedAt: nowIso()
  }

  return {
    model: nextModelWithDiagrams(
      model,
      sortDiagramsForLibrary([...(model.diagrams ?? []), diagram])
    ),
    changedDiagramIds: [id],
    deletedDiagramRefIds: []
  }
}

export function renameDiagram(
  model: C4ModelData,
  diagramId: string,
  name: string
): DiagramMutationResult {
  const nextName = name.trim()
  if (!nextName) {
    throw new DiagramControllerError('controller.empty-name', 'Diagram name is required', {
      operation: 'rename',
      diagramId
    })
  }

  let found = false
  let changed = false
  const diagrams = (model.diagrams ?? []).map((diagram) => {
    if (diagram.id !== diagramId) {
      return diagram
    }
    found = true
    if (diagram.name === nextName) {
      return diagram
    }
    changed = true
    return { ...diagram, name: nextName, updatedAt: nowIso() }
  })
  if (!found) {
    throw new DiagramControllerError(
      'controller.diagram-not-found',
      `Diagram '${diagramId}' not found`,
      { diagramId }
    )
  }

  return {
    model: nextModelWithDiagrams(model, changed ? sortDiagramsForLibrary(diagrams) : diagrams),
    changedDiagramIds: changed ? [diagramId] : [],
    deletedDiagramRefIds: []
  }
}

export function updateDiagramSource(
  model: C4ModelData,
  diagramId: string,
  source: string
): DiagramMutationResult {
  if (!source.trim()) {
    throw new DiagramControllerError('controller.empty-source', 'Diagram source is required', {
      operation: 'updateSource',
      diagramId
    })
  }

  const detected = detectMermaidDiagramKind(source)
  let found = false
  let changed = false
  const diagrams = (model.diagrams ?? []).map((diagram) => {
    if (diagram.id !== diagramId) {
      return diagram
    }
    found = true
    if (diagram.source === source && diagram.kind === detected.kind) {
      return diagram
    }
    changed = true
    return {
      ...diagram,
      source,
      kind: detected.kind,
      updatedAt: nowIso()
    }
  })
  if (!found) {
    throw new DiagramControllerError(
      'controller.diagram-not-found',
      `Diagram '${diagramId}' not found`,
      { diagramId }
    )
  }

  return {
    model: nextModelWithDiagrams(model, changed ? sortDiagramsForLibrary(diagrams) : diagrams),
    changedDiagramIds: changed ? [diagramId] : [],
    deletedDiagramRefIds: []
  }
}

export function createDiagramRef(
  model: C4ModelData,
  input: CreateDiagramRefInput
): DiagramMutationResult {
  assertNoDuplicateDiagramRefIds(model.diagramRefs ?? [])
  const existingIds = new Set((model.diagramRefs ?? []).map((ref) => ref.id))
  const id = createDiagramRefId(input.target, input.diagramId, existingIds)
  const ref = normalizeAndValidateDiagramRefInput(model, input, id, 'createRef')

  return {
    model: nextModelWithDiagramRefs(model, [...(model.diagramRefs ?? []), ref]),
    changedDiagramIds: [],
    deletedDiagramRefIds: []
  }
}

export function upsertDiagramRefs(model: C4ModelData, refs: DiagramRef[]): DiagramMutationResult {
  assertNoDuplicateDiagramRefIds(model.diagramRefs ?? [])
  assertNoDuplicateDiagramRefIds(refs)
  const normalizedRefs = refs.map((ref) =>
    normalizeAndValidateDiagramRefInput(model, ref, ref.id, 'upsertRefs')
  )
  const upsertsById = new Map(normalizedRefs.map((ref) => [ref.id, ref]))
  const nextRefs: DiagramRef[] = []

  for (const existing of model.diagramRefs ?? []) {
    nextRefs.push(upsertsById.get(existing.id) ?? existing)
    upsertsById.delete(existing.id)
  }
  nextRefs.push(...upsertsById.values())

  return {
    model: nextModelWithDiagramRefs(model, nextRefs),
    changedDiagramIds: [],
    deletedDiagramRefIds: []
  }
}

export function deleteDiagramRefs(model: C4ModelData, refIds: string[]): DiagramMutationResult {
  const requestedIds = new Set(refIds)
  const existingIds = new Set((model.diagramRefs ?? []).map((ref) => ref.id))
  const missingIds = refIds.filter((refId) => !existingIds.has(refId))
  if (missingIds.length > 0) {
    throw new DiagramControllerError(
      'controller.ref-not-found',
      `Diagram ref '${missingIds[0]}' not found`,
      { refIds: missingIds, operation: 'deleteRefs' }
    )
  }

  return {
    model: nextModelWithDiagramRefs(
      model,
      (model.diagramRefs ?? []).filter((ref) => !requestedIds.has(ref.id))
    ),
    changedDiagramIds: [],
    deletedDiagramRefIds: refIds
  }
}

export function deleteDiagram(model: C4ModelData, diagramId: string): DiagramMutationResult {
  const diagrams = model.diagrams ?? []
  if (!diagrams.some((diagram) => diagram.id === diagramId)) {
    throw new DiagramControllerError(
      'controller.diagram-not-found',
      `Diagram '${diagramId}' not found`,
      { diagramId }
    )
  }

  const deletedDiagramRefIds = (model.diagramRefs ?? [])
    .filter((ref) => ref.diagramId === diagramId)
    .map((ref) => ref.id)

  return {
    model: {
      ...nextModelWithDiagrams(
        model,
        sortDiagramsForLibrary(diagrams.filter((diagram) => diagram.id !== diagramId))
      ),
      diagramRefs: (model.diagramRefs ?? []).filter((ref) => ref.diagramId !== diagramId)
    },
    changedDiagramIds: [diagramId],
    deletedDiagramRefIds
  }
}
