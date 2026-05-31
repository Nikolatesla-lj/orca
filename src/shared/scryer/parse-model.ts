/* eslint-disable max-lines -- Why: this shared parser owns all legacy Scryer model normalization so malformed models are cleaned before they reach IPC, MCP, or the renderer. */
import type {
  C4Edge,
  C4Kind,
  C4ModelData,
  C4ModelDataV2,
  C4Node,
  C4NodeData,
  Contract,
  ContractImage,
  ContractItem,
  Diagram,
  DiagramKind,
  DiagramRef,
  DiagramRefRole,
  DiagramRefTarget,
  DiagramSourceRange,
  DiagramErrorCode,
  DiagramNotation,
  Flow,
  FlowBranch,
  FlowStep,
  FlowTransition,
  Group,
  ModelValidationWarning,
  SourceLocation,
  Status
} from './model-types'
import { SCRY_SCHEMA_VERSION as CURRENT_SCRY_SCHEMA_VERSION } from './model-types'
import { validateWorkspaceRelativeSourcePattern } from './source-targets'

const VALID_STATUSES = new Set<Status>(['proposed', 'implemented', 'verified', 'vagrant'])
const VALID_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const MODEL_TOP_LEVEL_FIELDS = new Set([
  'nodes',
  'edges',
  'startingLevel',
  'sourceMap',
  'projectPath',
  'refPositions',
  'groups',
  'flows',
  'scenarios',
  'validationWarnings',
  'schemaVersion',
  'diagrams',
  'diagramRefs'
])
const VALID_DIAGRAM_KINDS = new Set<DiagramKind>([
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'architecture',
  'gitGraph',
  'c4',
  'gantt',
  'journey',
  'mindmap',
  'timeline',
  'requirement',
  'quadrant',
  'xy',
  'block',
  'packet',
  'kanban',
  'other'
])
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractExtraTopLevelFields(root: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(root).filter(
      ([key, value]) => !MODEL_TOP_LEVEL_FIELDS.has(key) && value !== undefined
    )
  )
}

function diagramWarning(args: {
  code: DiagramErrorCode
  message: string
  path: string
  diagramId?: string
  diagramRefId?: string
  target?: DiagramRefTarget
  details?: Record<string, unknown>
}): ModelValidationWarning {
  return {
    kind: 'diagram-validation',
    path: args.path,
    code: args.code,
    message: args.message,
    ...(args.diagramId ? { diagramId: args.diagramId } : {}),
    ...(args.diagramRefId ? { diagramRefId: args.diagramRefId } : {}),
    ...(args.target ? { target: args.target } : {}),
    ...(args.details ? { details: args.details } : {})
  }
}

function isValidEntityId(value: string): boolean {
  return VALID_ID_PATTERN.test(value)
}

function isValidUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && !Number.isNaN(Date.parse(value))
}

function normalizeContractImage(raw: unknown): ContractImage | undefined {
  if (!isRecord(raw)) {
    return undefined
  }
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : undefined
  const rawData = typeof raw.data === 'string' ? raw.data : dataUrl
  if (!rawData) {
    return undefined
  }
  const match = rawData.match(/^data:([^;,]+);base64,(.*)$/)
  const data = match ? match[2] : rawData
  const mimeType =
    typeof raw.mimeType === 'string'
      ? raw.mimeType
      : typeof raw.type === 'string'
        ? raw.type
        : (match?.[1] ?? 'application/octet-stream')
  return {
    filename:
      typeof raw.filename === 'string' && raw.filename.trim() ? raw.filename.trim() : 'image',
    mimeType,
    data
  }
}

function normalizeContractItem(value: unknown): ContractItem | null {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (!isRecord(value) || typeof value.text !== 'string') {
    return null
  }
  const image = normalizeContractImage(value.image)
  const url = typeof value.url === 'string' ? value.url.trim() || undefined : undefined
  const item = {
    text: value.text.trim(),
    ...(typeof value.passed === 'boolean' ? { passed: value.passed } : {}),
    ...(url ? { url } : {}),
    ...(image ? { image } : {})
  }
  return item
}

function migrateContract(raw: unknown): Contract {
  const empty: Contract = { expect: [], ask: [], never: [] }
  if (!isRecord(raw)) {
    return empty
  }
  const migrate = (value: unknown): ContractItem[] => {
    if (Array.isArray(value)) {
      return value.map(normalizeContractItem).filter((item): item is ContractItem => item !== null)
    }
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    }
    return []
  }
  return {
    expect: migrate(raw.expect ?? raw.always),
    ask: migrate(raw.ask),
    never: migrate(raw.never)
  }
}

function normalizeFlowStep(rawStep: unknown): FlowStep {
  const step = isRecord(rawStep) ? rawStep : {}
  const id = typeof step.id === 'string' && step.id.trim() ? step.id.trim() : ''
  const branches = Array.isArray(step.branches) ? step.branches.map(normalizeFlowBranch) : undefined
  return {
    ...(step as Partial<FlowStep>),
    id,
    label: typeof step.label === 'string' ? step.label : '',
    description: typeof step.description === 'string' ? step.description : '',
    branches
  }
}

function normalizeFlowBranch(rawBranch: unknown): FlowBranch {
  const branch = isRecord(rawBranch) ? rawBranch : {}
  return {
    condition: typeof branch.condition === 'string' ? branch.condition : '',
    steps: Array.isArray(branch.steps) ? branch.steps.map(normalizeFlowStep) : []
  }
}

function migrateFlowTransitions(steps: FlowStep[], transitions: FlowTransition[]): FlowStep[] {
  if (transitions.length === 0) {
    return steps
  }
  const stepIds = new Set(steps.map((step) => step.id))
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const step of steps) {
    adjacency.set(step.id, [])
    inDegree.set(step.id, 0)
  }
  for (const transition of transitions) {
    if (stepIds.has(transition.source) && stepIds.has(transition.target)) {
      adjacency.get(transition.source)?.push(transition.target)
      inDegree.set(transition.target, (inDegree.get(transition.target) ?? 0) + 1)
    }
  }
  const queue = steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((step) => step.id)
  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, nextDegree)
      if (nextDegree === 0) {
        queue.push(next)
      }
    }
  }
  for (const step of steps) {
    if (!sorted.includes(step.id)) {
      sorted.push(step.id)
    }
  }
  const stepById = new Map(steps.map((step) => [step.id, step]))
  return sorted.map((id) => {
    const { position: _position, ...step } = stepById.get(id)! as FlowStep & { position?: unknown }
    return step
  })
}

function nodeTypeForKind(kind: string): C4Node['type'] {
  if (kind === 'operation' || kind === 'process' || kind === 'model') {
    return kind
  }
  return 'c4'
}

function normalizeNode(rawNode: unknown): C4Node {
  const node = isRecord(rawNode) ? rawNode : {}
  const rawData = isRecord(node.data) ? node.data : {}
  const kind = typeof rawData.kind === 'string' ? rawData.kind : 'system'
  const rawContract =
    rawData.contract ??
    rawData.guidelines ??
    (rawData.expect !== undefined || rawData.ask !== undefined || rawData.never !== undefined
      ? { expect: rawData.expect, ask: rawData.ask, never: rawData.never }
      : undefined)
  const contract = rawContract ? migrateContract(rawContract) : undefined
  const rawNotes = rawData.notes
  const notes =
    typeof rawNotes === 'string'
      ? rawNotes.split('\n').filter(Boolean)
      : Array.isArray(rawNotes) && rawNotes.length > 0
        ? rawNotes.filter((item): item is string => typeof item === 'string')
        : undefined
  const hasPosition = isRecord(node.position)
  const status =
    typeof rawData.status === 'string' && VALID_STATUSES.has(rawData.status as Status)
      ? (rawData.status as Status)
      : undefined
  const stripStatus = kind === 'person' || (kind === 'system' && rawData.external === true)
  const data: C4NodeData = {
    ...(rawData as Partial<C4NodeData>),
    name: typeof rawData.name === 'string' ? rawData.name : String(node.id ?? 'Unnamed'),
    description: typeof rawData.description === 'string' ? rawData.description : '',
    kind: kind as C4Kind,
    contract,
    sources: (rawData.sources ?? rawData.references) as C4NodeData['sources'],
    notes,
    status: stripStatus ? undefined : status,
    guidelines: undefined,
    expect: undefined,
    ask: undefined,
    never: undefined,
    references: undefined,
    ...(!hasPosition ? { _needsLayout: true } : {})
  }

  return {
    ...(node as Partial<C4Node>),
    id: typeof node.id === 'string' ? node.id : globalThis.crypto.randomUUID(),
    type: nodeTypeForKind(kind),
    position: hasPosition ? (node.position as { x: number; y: number }) : { x: 0, y: 0 },
    data
  }
}

function normalizeSourceLocation(rawLocation: unknown): SourceLocation | null {
  if (!isRecord(rawLocation) || typeof rawLocation.pattern !== 'string') {
    return null
  }
  const pattern = rawLocation.pattern.trim()
  if (!pattern) {
    return null
  }
  const rawLine = Number(rawLocation.line)
  const rawEndLine = Number(rawLocation.endLine)
  const line = Number.isInteger(rawLine) && rawLine > 0 ? rawLine : undefined
  const endLine = Number.isInteger(rawEndLine) && rawEndLine > 0 ? rawEndLine : undefined
  const normalizedLine =
    line !== undefined && endLine !== undefined && endLine < line ? endLine : line
  const normalizedEndLine =
    line !== undefined && endLine !== undefined && endLine < line ? line : endLine
  const command =
    typeof rawLocation.command === 'string' && rawLocation.command.trim()
      ? rawLocation.command.trim()
      : undefined
  return {
    pattern,
    ...(normalizedLine !== undefined ? { line: normalizedLine } : {}),
    ...(normalizedEndLine !== undefined ? { endLine: normalizedEndLine } : {}),
    ...(command ? { command } : {})
  }
}

function normalizeSourceMap(
  rawSourceMap: unknown,
  validKeys: Set<string>
): Record<string, SourceLocation[]> {
  if (!isRecord(rawSourceMap)) {
    return {}
  }
  const sourceMap: Record<string, SourceLocation[]> = {}
  for (const [key, value] of Object.entries(rawSourceMap)) {
    if (!validKeys.has(key) || !Array.isArray(value)) {
      continue
    }
    const locations = value
      .map(normalizeSourceLocation)
      .filter((location): location is SourceLocation => location !== null)
    if (locations.length > 0) {
      sourceMap[key] = locations
    }
  }
  return sourceMap
}

function normalizeGroups(rawGroups: unknown, nodeIds: Set<string>): Group[] {
  if (!Array.isArray(rawGroups)) {
    return []
  }
  return rawGroups.flatMap((rawGroup) => {
    const group = isRecord(rawGroup) ? rawGroup : {}
    if (typeof group.id !== 'string' || typeof group.name !== 'string') {
      return []
    }
    const rawMemberIds = Array.isArray(group.memberIds)
      ? group.memberIds
      : Array.isArray(group.nodeIds)
        ? group.nodeIds
        : []
    const memberIds = rawMemberIds.filter(
      (memberId): memberId is string => typeof memberId === 'string' && nodeIds.has(memberId)
    )
    return [
      {
        id: group.id,
        name: group.name,
        ...(typeof group.description === 'string' ? { description: group.description } : {}),
        memberIds,
        ...(typeof group.parentGroupId === 'string' ? { parentGroupId: group.parentGroupId } : {}),
        ...(group.contract ? { contract: migrateContract(group.contract) } : {})
      }
    ]
  })
}

function collectMentionWarnings(model: {
  nodes: C4Node[]
  flows: Flow[]
}): ModelValidationWarning[] {
  const knownMentions = new Set<string>()
  for (const node of model.nodes) {
    knownMentions.add(node.id)
    knownMentions.add(node.data.name)
  }
  const warnings: ModelValidationWarning[] = []
  const checkText = (text: string | undefined, path: string): void => {
    if (!text) {
      return
    }
    for (const match of text.matchAll(/@\[([^\]]+)\]/g)) {
      const reference = match[1]?.trim()
      if (!reference || knownMentions.has(reference)) {
        continue
      }
      warnings.push({
        kind: 'missing-mention',
        path,
        reference,
        message: `Mention '${reference}' does not match a model node`
      })
    }
  }
  const visitSteps = (flowId: string, steps: FlowStep[]): void => {
    for (const step of steps) {
      checkText(step.label, `flows.${flowId}.steps.${step.id}.label`)
      checkText(step.description, `flows.${flowId}.steps.${step.id}.description`)
      for (const branch of step.branches ?? []) {
        visitSteps(flowId, branch.steps)
      }
    }
  }
  for (const node of model.nodes) {
    checkText(node.data.description, `nodes.${node.id}.description`)
  }
  for (const flow of model.flows) {
    visitSteps(flow.id, flow.steps)
  }
  return warnings
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeDiagram(raw: unknown, index: number): DiagramNormalizeResult<Diagram | null> {
  const warnings: ModelValidationWarning[] = []
  if (!isRecord(raw)) {
    return {
      value: null,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-diagram',
          message: 'Diagram entry must be an object',
          path: `diagrams.${index}`,
          details: { field: 'diagram' }
        })
      ]
    }
  }

  const id = normalizeOptionalString(raw.id)
  const name = normalizeOptionalString(raw.name)
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source : undefined
  const notation = raw.notation === 'mermaid' ? (raw.notation as DiagramNotation) : undefined
  const kind =
    typeof raw.kind === 'string' && VALID_DIAGRAM_KINDS.has(raw.kind as DiagramKind)
      ? (raw.kind as DiagramKind)
      : undefined

  const invalidFields = [
    !id || !isValidEntityId(id) ? 'id' : null,
    !name ? 'name' : null,
    !kind ? 'kind' : null,
    !notation ? 'notation' : null,
    !source ? 'source' : null
  ].filter((field): field is string => field !== null)

  if (!id || invalidFields.length > 0 || !name || !kind || !notation || !source) {
    return {
      value: null,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-diagram',
          message: `Diagram has invalid fields: ${invalidFields.join(', ')}`,
          path: `diagrams.${index}`,
          ...(id ? { diagramId: id } : {}),
          details: { fields: invalidFields }
        })
      ]
    }
  }

  const rawUpdatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined
  const updatedAt = rawUpdatedAt && isValidUtcTimestamp(rawUpdatedAt) ? rawUpdatedAt : undefined
  if (rawUpdatedAt && !updatedAt) {
    warnings.push(
      diagramWarning({
        code: 'parser.invalid-updated-at',
        message: `Diagram '${id}' has invalid updatedAt`,
        path: `diagrams.${index}.updatedAt`,
        diagramId: id,
        details: { rejectedValue: rawUpdatedAt }
      })
    )
  }

  return {
    value: {
      id,
      name,
      kind,
      notation,
      source,
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(Array.isArray(raw.tags)
        ? { tags: raw.tags.filter((tag): tag is string => typeof tag === 'string') }
        : {}),
      ...(updatedAt ? { updatedAt } : {})
    },
    warnings
  }
}

export function normalizeDiagrams(raw: unknown): DiagramNormalizeResult<Diagram[]> {
  if (!Array.isArray(raw)) {
    return { value: [], warnings: [] }
  }

  const diagrams: Diagram[] = []
  const warnings: ModelValidationWarning[] = []
  const seenIds = new Map<string, number>()

  raw.forEach((entry, index) => {
    const result = normalizeDiagram(entry, index)
    warnings.push(...result.warnings)
    if (!result.value) {
      return
    }
    const keptIndex = seenIds.get(result.value.id)
    if (keptIndex !== undefined) {
      warnings.push(
        diagramWarning({
          code: 'parser.duplicate-diagram-id',
          message: `Duplicate diagram id '${result.value.id}' was dropped`,
          path: `diagrams.${index}.id`,
          diagramId: result.value.id,
          details: { keptIndex, droppedIndex: index }
        })
      )
      return
    }
    seenIds.set(result.value.id, diagrams.length)
    diagrams.push(result.value)
  })

  return { value: diagrams, warnings }
}

function normalizeDiagramRefTarget(rawTarget: unknown): DiagramRefTarget | null {
  if (!isRecord(rawTarget) || typeof rawTarget.type !== 'string') {
    return null
  }

  switch (rawTarget.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow': {
      const id = normalizeOptionalString(rawTarget.id)
      return id ? { type: rawTarget.type, id } : null
    }
    case 'flowStep': {
      const flowId = normalizeOptionalString(rawTarget.flowId)
      const stepId = normalizeOptionalString(rawTarget.stepId)
      return flowId && stepId ? { type: 'flowStep', flowId, stepId } : null
    }
    case 'source': {
      const pattern = typeof rawTarget.pattern === 'string' ? rawTarget.pattern : ''
      if (!pattern) {
        return null
      }
      const line = Number(rawTarget.line)
      const endLine = Number(rawTarget.endLine)
      return {
        type: 'source',
        pattern,
        ...(Number.isInteger(line) && line > 0 ? { line } : {}),
        ...(Number.isInteger(endLine) && endLine > 0 ? { endLine } : {})
      }
    }
    default:
      return null
  }
}

function normalizeDiagramSourceRange(
  rawRange: unknown,
  refId: string,
  path: string
): DiagramNormalizeResult<DiagramSourceRange | undefined> {
  if (rawRange === undefined) {
    return { value: undefined, warnings: [] }
  }
  if (!isRecord(rawRange)) {
    return {
      value: undefined,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-source-range',
          message: `DiagramRef '${refId}' has invalid sourceRange`,
          path,
          diagramRefId: refId
        })
      ]
    }
  }
  const startLine = Number(rawRange.startLine)
  const startColumn = Number(rawRange.startColumn)
  const endLine = Number(rawRange.endLine)
  const endColumn = Number(rawRange.endColumn)
  const hasEndLine = rawRange.endLine !== undefined
  const hasStartColumn = rawRange.startColumn !== undefined
  const hasEndColumn = rawRange.endColumn !== undefined
  const invalid =
    !Number.isInteger(startLine) ||
    startLine < 1 ||
    (hasStartColumn && (!Number.isInteger(startColumn) || startColumn < 1)) ||
    (hasEndLine && (!Number.isInteger(endLine) || endLine < 1 || endLine < startLine)) ||
    (hasEndColumn && (!Number.isInteger(endColumn) || endColumn < 1)) ||
    (hasEndLine &&
      hasStartColumn &&
      hasEndColumn &&
      endLine === startLine &&
      endColumn < startColumn)

  if (invalid) {
    return {
      value: undefined,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-source-range',
          message: `DiagramRef '${refId}' has invalid sourceRange`,
          path,
          diagramRefId: refId,
          details: { sourceRange: rawRange }
        })
      ]
    }
  }

  return {
    value: {
      startLine,
      ...(hasStartColumn ? { startColumn } : {}),
      ...(hasEndLine ? { endLine } : {}),
      ...(hasEndColumn ? { endColumn } : {})
    },
    warnings: []
  }
}

function normalizeDiagramRef(
  raw: unknown,
  index: number
): DiagramNormalizeResult<DiagramRef | null> {
  if (!isRecord(raw)) {
    return {
      value: null,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-diagram',
          message: 'DiagramRef entry must be an object',
          path: `diagramRefs.${index}`
        })
      ]
    }
  }

  const id = normalizeOptionalString(raw.id)
  const diagramId = normalizeOptionalString(raw.diagramId)
  const target = normalizeDiagramRefTarget(raw.target)
  const role =
    typeof raw.role === 'string' && VALID_DIAGRAM_ROLES.has(raw.role as DiagramRefRole)
      ? (raw.role as DiagramRefRole)
      : undefined
  const invalidFields = [
    !id || !isValidEntityId(id) ? 'id' : null,
    !diagramId || !isValidEntityId(diagramId) ? 'diagramId' : null,
    !target ? 'target' : null,
    !role ? 'role' : null
  ].filter((field): field is string => field !== null)

  if (!id || !diagramId || !target || !role || invalidFields.length > 0) {
    return {
      value: null,
      warnings: [
        diagramWarning({
          code: 'parser.invalid-diagram',
          message: `DiagramRef has invalid fields: ${invalidFields.join(', ')}`,
          path: `diagramRefs.${index}`,
          ...(id ? { diagramRefId: id } : {}),
          ...(diagramId ? { diagramId } : {}),
          ...(target ? { target } : {}),
          details: { fields: invalidFields }
        })
      ]
    }
  }

  const sourceRangeResult = normalizeDiagramSourceRange(
    raw.sourceRange,
    id,
    `diagramRefs.${index}.sourceRange`
  )

  return {
    value: {
      id,
      diagramId,
      target,
      role,
      ...(typeof raw.elementKey === 'string' && raw.elementKey.trim()
        ? { elementKey: raw.elementKey.trim() }
        : {}),
      ...(sourceRangeResult.value ? { sourceRange: sourceRangeResult.value } : {}),
      ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim() } : {})
    },
    warnings: sourceRangeResult.warnings
  }
}

export function findFlowStep(flow: Flow, stepId: string): FlowStep | null {
  const visit = (steps: FlowStep[]): FlowStep | null => {
    for (const step of steps) {
      if (step.id === stepId) {
        return step
      }
      for (const branch of step.branches ?? []) {
        const found = visit(branch.steps)
        if (found) {
          return found
        }
      }
    }
    return null
  }
  return visit(flow.steps)
}

export function validateDiagramRefs(
  refs: DiagramRef[],
  context: DiagramValidationContext
): ModelValidationWarning[] {
  const warnings: ModelValidationWarning[] = []
  const diagramIds = new Set(context.diagrams.map((diagram) => diagram.id))

  refs.forEach((ref, index) => {
    if (!diagramIds.has(ref.diagramId)) {
      warnings.push(
        diagramWarning({
          code: 'parser.missing-diagram',
          message: `DiagramRef '${ref.id}' points to missing diagram '${ref.diagramId}'`,
          path: `diagramRefs.${index}.diagramId`,
          diagramId: ref.diagramId,
          diagramRefId: ref.id,
          target: ref.target
        })
      )
    }

    switch (ref.target.type) {
      case 'node':
        if (!context.nodeIds.has(ref.target.id)) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-target',
              message: `DiagramRef '${ref.id}' points to missing node '${ref.target.id}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target: ref.target
            })
          )
        }
        break
      case 'edge':
        if (!context.edgeIds.has(ref.target.id)) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-target',
              message: `DiagramRef '${ref.id}' points to missing edge '${ref.target.id}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target: ref.target
            })
          )
        }
        break
      case 'group':
        if (!context.groupIds.has(ref.target.id)) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-target',
              message: `DiagramRef '${ref.id}' points to missing group '${ref.target.id}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target: ref.target
            })
          )
        }
        break
      case 'flow': {
        const target = ref.target
        const flow = context.flows.find((candidate) => candidate.id === target.id)
        if (!flow) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-target',
              message: `DiagramRef '${ref.id}' points to missing flow '${target.id}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target
            })
          )
        }
        break
      }
      case 'flowStep': {
        const target = ref.target
        const flow = context.flows.find((candidate) => candidate.id === target.flowId)
        if (!flow) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-target',
              message: `DiagramRef '${ref.id}' points to missing flow '${target.flowId}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target
            })
          )
        } else if (!findFlowStep(flow, target.stepId)) {
          warnings.push(
            diagramWarning({
              code: 'parser.missing-flow-step',
              message: `DiagramRef '${ref.id}' points to missing flow step '${target.stepId}'`,
              path: `diagramRefs.${index}.target`,
              diagramRefId: ref.id,
              target
            })
          )
        }
        break
      }
      case 'source': {
        const validation = validateWorkspaceRelativeSourcePattern(ref.target.pattern, 'parser')
        if (!validation.ok) {
          warnings.push(
            diagramWarning({
              code: validation.code,
              message: `DiagramRef '${ref.id}' has unsafe source target '${ref.target.pattern}'`,
              path: `diagramRefs.${index}.target.pattern`,
              diagramRefId: ref.id,
              target: ref.target,
              details: {
                rejectedPattern: validation.rejectedPattern,
                reason: validation.reason
              }
            })
          )
        }
        break
      }
    }
  })

  return warnings
}

export function normalizeDiagramRefs(
  raw: unknown,
  context: DiagramValidationContext
): DiagramNormalizeResult<DiagramRef[]> {
  if (!Array.isArray(raw)) {
    return { value: [], warnings: [] }
  }

  const refs: DiagramRef[] = []
  const warnings: ModelValidationWarning[] = []
  const seenIds = new Map<string, number>()

  raw.forEach((entry, index) => {
    const result = normalizeDiagramRef(entry, index)
    warnings.push(...result.warnings)
    if (!result.value) {
      return
    }
    const keptIndex = seenIds.get(result.value.id)
    if (keptIndex !== undefined) {
      warnings.push(
        diagramWarning({
          code: 'parser.duplicate-ref-id',
          message: `Duplicate diagramRef id '${result.value.id}' was dropped`,
          path: `diagramRefs.${index}.id`,
          diagramRefId: result.value.id,
          diagramId: result.value.diagramId,
          target: result.value.target,
          details: { keptIndex, droppedIndex: index }
        })
      )
      return
    }
    seenIds.set(result.value.id, refs.length)
    refs.push(result.value)
  })

  warnings.push(...validateDiagramRefs(refs, context))
  return { value: refs, warnings }
}

function collectFlowStepAndDescendantIds(step: FlowStep): Set<string> {
  const ids = new Set([step.id])
  const visit = (steps: FlowStep[]): void => {
    for (const child of steps) {
      ids.add(child.id)
      for (const branch of child.branches ?? []) {
        visit(branch.steps)
      }
    }
  }
  for (const branch of step.branches ?? []) {
    visit(branch.steps)
  }
  return ids
}

export function pruneDiagramRefsForDeletedTarget(
  refs: DiagramRef[],
  target: DiagramRefDeleteTarget
): DiagramRefPruneResult {
  const deletedRefIds: string[] = []
  const nestedFlowStepIds =
    target.type === 'flowStep'
      ? collectFlowStepAndDescendantIds(
          findFlowStep(target.flow, target.stepId) ?? {
            id: target.stepId
          }
        )
      : null

  const diagramRefs = refs.filter((ref) => {
    const shouldDelete =
      (target.type === 'diagram' && ref.diagramId === target.diagramId) ||
      (target.type === 'node' && ref.target.type === 'node' && ref.target.id === target.id) ||
      (target.type === 'edge' && ref.target.type === 'edge' && ref.target.id === target.id) ||
      (target.type === 'group' && ref.target.type === 'group' && ref.target.id === target.id) ||
      (target.type === 'flow' &&
        ((ref.target.type === 'flow' && ref.target.id === target.id) ||
          (ref.target.type === 'flowStep' && ref.target.flowId === target.id))) ||
      (target.type === 'flowStep' &&
        ref.target.type === 'flowStep' &&
        ref.target.flowId === target.flowId &&
        nestedFlowStepIds?.has(ref.target.stepId) === true)

    if (shouldDelete) {
      deletedRefIds.push(ref.id)
      return false
    }
    return true
  })

  return { diagramRefs, deletedRefIds }
}

export function parseModelData(raw: string): C4ModelDataV2 {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid Scryer model JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const root = isRecord(data) ? data : {}
  const nodes = Array.isArray(root.nodes) ? root.nodes.map(normalizeNode) : []
  const seenEdgeIds = new Set<string>()
  const edges = (Array.isArray(root.edges) ? root.edges : []).filter((edge): edge is C4Edge => {
    if (!isRecord(edge) || typeof edge.id !== 'string') {
      return false
    }
    if (seenEdgeIds.has(edge.id)) {
      return false
    }
    seenEdgeIds.add(edge.id)
    return true
  })
  const flows = (
    Array.isArray(root.flows) ? root.flows : Array.isArray(root.scenarios) ? root.scenarios : []
  ).map((flow): Flow => {
    const record = isRecord(flow) ? flow : {}
    const steps = Array.isArray(record.steps) ? record.steps.map(normalizeFlowStep) : []
    const transitions = Array.isArray(record.transitions)
      ? (record.transitions as FlowTransition[])
      : []
    return {
      ...(record as Partial<Flow>),
      id: typeof record.id === 'string' ? record.id : '',
      name: typeof record.name === 'string' ? record.name : '',
      steps: migrateFlowTransitions(steps, transitions),
      transitions: undefined
    }
  })
  const nodeIds = new Set(nodes.map((node) => node.id))
  const validSourceKeys = new Set([...nodeIds, ...flows.map((flow) => flow.id)])
  const groups = normalizeGroups(root.groups, nodeIds)
  const sourceMap = normalizeSourceMap(root.sourceMap, validSourceKeys)
  const diagramResult = normalizeDiagrams(root.diagrams)
  const diagramRefResult = normalizeDiagramRefs(root.diagramRefs, {
    nodeIds,
    edgeIds: seenEdgeIds,
    groupIds: new Set(groups.map((group) => group.id)),
    flows,
    diagrams: diagramResult.value
  })
  const validationWarnings = [
    ...collectMentionWarnings({ nodes, flows }),
    ...diagramResult.warnings,
    ...diagramRefResult.warnings
  ]

  const parsed: C4ModelDataV2 = {
    ...extractExtraTopLevelFields(root),
    schemaVersion: CURRENT_SCRY_SCHEMA_VERSION,
    nodes,
    edges,
    startingLevel:
      root.startingLevel === 'container' || root.startingLevel === 'component'
        ? root.startingLevel
        : 'system',
    sourceMap,
    projectPath: typeof root.projectPath === 'string' ? root.projectPath : undefined,
    refPositions: isRecord(root.refPositions)
      ? (root.refPositions as C4ModelData['refPositions'])
      : {},
    groups,
    flows,
    diagrams: diagramResult.value,
    diagramRefs: diagramRefResult.value
  }
  return validationWarnings.length > 0 ? { ...parsed, validationWarnings } : parsed
}

export function serializeModelData(model: C4ModelData): string {
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  const edgeIds = new Set(model.edges.map((edge) => edge.id))
  const flows = model.flows ?? []
  const groups = model.groups ?? []
  const diagramResult = normalizeDiagrams(model.diagrams)
  const diagramRefResult = normalizeDiagramRefs(model.diagramRefs, {
    nodeIds,
    edgeIds,
    groupIds: new Set(groups.map((group) => group.id)),
    flows,
    diagrams: diagramResult.value
  })
  const { validationWarnings: _validationWarnings, ...serializable } = {
    ...model,
    schemaVersion: CURRENT_SCRY_SCHEMA_VERSION,
    diagrams: diagramResult.value,
    diagramRefs: diagramRefResult.value
  }
  return JSON.stringify(serializable, null, 2)
}
