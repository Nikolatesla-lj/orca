/* eslint-disable max-lines -- Why: this file is the first TypeScript migration of Scryer's MCP tool surface, kept together so tool semantics and shared validation stay auditable while the bridge is still new. */
import type {
  C4Edge,
  C4Kind,
  C4ModelData,
  C4ModelDataV2,
  C4Node,
  Contract,
  ContractItem,
  Diagram,
  DiagramDiagnostic,
  DiagramKind,
  DiagramNotation,
  DiagramRef,
  DiagramRefRole,
  DiagramRefTarget,
  DiagramSourceRange,
  Flow,
  FlowStep,
  Group,
  ModelValidationWarning,
  ModelProperty,
  ScryerToolCall,
  ScryerToolResult,
  SourceLocation,
  Status
} from '../../shared/scryer/model-types'
import type {
  CompactDiagramRefSummary,
  CompactDiagramSummary,
  DiagramChangeSummary,
  DiagramValidationSummary,
  ExistingToolDiagramContext
} from '../../shared/scryer/diagram-tool-context'
import type {
  DiagramCacheClearRequest,
  DiagramCacheClearResult,
  DiagramCacheFailure
} from '../../shared/scryer/diagram-cache'
import { computeDiagramSourceHash } from '../../shared/scryer/diagram-cache'
import {
  deleteDiagram,
  deleteDiagramRefs,
  DiagramControllerError,
  upsertDiagramRefs
} from '../../shared/scryer/diagram-controller'
import { detectMermaidDiagramKind } from '../../shared/scryer/diagram-kind'
import { findFlowStep, parseModelData } from '../../shared/scryer/parse-model'
import { validateWorkspaceRelativeSourcePattern } from '../../shared/scryer/source-targets'
import {
  getProjectModelPath,
  readBaseline,
  readModel,
  setImplementing,
  writeBaseline,
  writeModel
} from './model-store'
import { projectStructure } from './structure'
import { SCRYER_RULES, TASK_INSTRUCTIONS } from '../../shared/scryer/rules'
import { clearDiagramCacheForMcp } from './diagram-cache-clear'

export type SetDiagramsArgs = {
  data: string
  mode?: 'upsert' | 'replaceAll'
}

export type GetDiagramArgs = {
  diagram_id: string
  include_refs?: boolean
}

export type DeleteDiagramArgs = {
  diagram_id: string
}

export type UpdateDiagramRefsArgs = {
  data?: string
  mode?: 'upsert' | 'replaceForDiagram' | 'delete'
  diagram_id?: string
  ref_ids?: string[]
}

export type ScryerDiagramToolReadContext = {
  projectPath: string
  modelName?: string | null
  model: C4ModelDataV2
}

export type ScryerDiagramToolWriteContext = ScryerDiagramToolReadContext & {
  writeModel: (
    projectPath: string,
    model: C4ModelDataV2,
    modelName?: string | null
  ) => Promise<void>
}

export type ScryerDiagramToolDeleteContext = ScryerDiagramToolWriteContext & {
  clearDiagramCache: (
    request: DiagramCacheClearRequest
  ) => Promise<DiagramCacheClearResult | DiagramCacheFailure>
}

function ok(content: string, data?: unknown): ScryerToolResult {
  return { ok: true, content, data }
}

function fail(content: string, data?: unknown): ScryerToolResult {
  return { ok: false, content, data }
}

function diagramFail(
  content: string,
  code: DiagramDiagnostic['code'],
  details?: unknown
): ScryerToolResult {
  return fail(content, {
    code,
    ...(details === undefined ? {} : { details })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
}

function stripModelArg(args: Record<string, unknown>): {
  modelName?: string | null
  toolArgs: Record<string, unknown>
} {
  const { model, ...toolArgs } = args
  return {
    modelName: typeof model === 'string' && model.trim() ? model : null,
    toolArgs
  }
}

function normalizeContract(value: unknown): Contract | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return {
    expect: Array.isArray(value.expect) ? (value.expect as Contract['expect']) : [],
    ask: Array.isArray(value.ask) ? (value.ask as Contract['ask']) : [],
    never: Array.isArray(value.never) ? (value.never as Contract['never']) : []
  }
}

function normalizeSources(value: unknown): C4Node['data']['sources'] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .filter(isRecord)
    .map((source) => ({
      pattern: String(source.pattern ?? ''),
      comment: String(source.comment ?? '')
    }))
    .filter((source) => source.pattern)
}

function normalizeSourceLocationsStrict(
  value: unknown,
  label: string
): { locations?: SourceLocation[]; error?: string } {
  if (!Array.isArray(value)) {
    return { error: `${label} requires locations array` }
  }
  const locations: SourceLocation[] = []
  for (const [index, source] of value.entries()) {
    const itemLabel = `${label} location ${index + 1}`
    if (!isRecord(source) || typeof source.pattern !== 'string' || !source.pattern.trim()) {
      return { error: `${itemLabel} requires a non-empty pattern` }
    }
    if (source.line !== undefined && typeof source.line !== 'number') {
      return { error: `${itemLabel} line must be a number` }
    }
    if (source.endLine !== undefined && typeof source.endLine !== 'number') {
      return { error: `${itemLabel} endLine must be a number` }
    }
    if (source.command !== undefined && typeof source.command !== 'string') {
      return { error: `${itemLabel} command must be a string` }
    }
    locations.push({
      pattern: source.pattern.trim(),
      ...(typeof source.line === 'number' ? { line: source.line } : {}),
      ...(typeof source.endLine === 'number' ? { endLine: source.endLine } : {}),
      ...(typeof source.command === 'string' ? { command: source.command.trim() } : {})
    })
  }
  return { locations }
}

function normalizeProperties(value: unknown): ModelProperty[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .filter(isRecord)
    .map((property) => ({
      label: String(property.label ?? ''),
      description: String(property.description ?? '')
    }))
    .filter((property) => property.label)
}

function isStatus(value: unknown): value is Status {
  return (
    value === 'proposed' || value === 'implemented' || value === 'verified' || value === 'vagrant'
  )
}

function isKind(value: unknown): value is C4Kind {
  return (
    value === 'person' ||
    value === 'system' ||
    value === 'container' ||
    value === 'component' ||
    value === 'operation' ||
    value === 'process' ||
    value === 'model'
  )
}

function nodeTypeForKind(kind: C4Kind): C4Node['type'] {
  if (kind === 'operation' || kind === 'process' || kind === 'model') {
    return kind
  }
  return 'c4'
}

function kindLabel(kind: C4Kind): string {
  return kind
}

function makeEdgeId(source: string, target: string): string {
  return `edge-${source}-${target}`
}

function validateIdentifier(name: string, label: string): string | null {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? null : `${label} must be a valid code identifier`
}

function validateTypeName(name: string, label: string): string | null {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(name) ? null : `${label} must be a valid type name`
}

function validatePropertyLabels(properties: ModelProperty[], label: string): string | null {
  for (const property of properties) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property.label)) {
      return `${label} has invalid property label '${property.label}'`
    }
  }
  return null
}

const TOP_LEVEL_NODE_DATA_FIELDS = [
  'name',
  'kind',
  'description',
  'technology',
  'status',
  'external',
  'shape',
  'contract',
  'sources',
  'notes',
  'properties',
  'parent',
  'parent_id'
] as const

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

const VALID_DIAGRAM_REF_ROLES = new Set<DiagramRefRole>([
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

function isDiagramKind(value: unknown): value is DiagramKind {
  return typeof value === 'string' && VALID_DIAGRAM_KINDS.has(value as DiagramKind)
}

function isDiagramNotation(value: unknown): value is DiagramNotation {
  return value === 'mermaid'
}

function isValidExternalDiagramId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,120}$/.test(value)
}

function parseDiagramToolJson(toolName: string, data: unknown): ScryerToolResult | unknown {
  if (typeof data !== 'string') {
    return diagramFail(`${toolName} requires data JSON string`, 'mcp.mode-argument-missing', {
      toolName,
      missing: 'data'
    })
  }
  try {
    return JSON.parse(data) as unknown
  } catch (error) {
    return diagramFail(`Invalid ${toolName} JSON`, 'mcp.invalid-json', {
      toolName,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}

function isToolResult(value: unknown): value is ScryerToolResult {
  return isRecord(value) && typeof value.ok === 'boolean' && typeof value.content === 'string'
}

function normalizeMcpDiagram(raw: unknown): Diagram | ScryerToolResult {
  if (!isRecord(raw)) {
    return diagramFail('Diagram payload must be an object', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram']
    })
  }
  const id = asString(raw.id)?.trim() ?? ''
  if (!id) {
    return diagramFail('MCP diagrams require explicit ids', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram'],
      missing: 'id'
    })
  }
  if (!isValidExternalDiagramId(id)) {
    return diagramFail(`Diagram id '${id}' is invalid`, 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram'],
      diagramId: id
    })
  }
  const name = asString(raw.name)?.trim() ?? ''
  const source = asString(raw.source) ?? ''
  if (!name || !source.trim() || !isDiagramKind(raw.kind) || !isDiagramNotation(raw.notation)) {
    return diagramFail(`Diagram '${id}' is invalid`, 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram'],
      diagramId: id
    })
  }

  const detected = detectMermaidDiagramKind(source)
  if (detected.kind !== 'other' && detected.kind !== raw.kind) {
    return diagramFail(
      `Diagram '${id}' kind conflicts with its Mermaid source`,
      'mcp.validation-failed',
      {
        validationCodes: ['renderer.kind-conflict'],
        diagramId: id,
        storedKind: raw.kind,
        detectedKind: detected.kind,
        directive: detected.directive
      }
    )
  }

  return {
    id,
    name,
    kind: raw.kind,
    notation: raw.notation,
    source,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(Array.isArray(raw.tags)
      ? { tags: raw.tags.filter((tag): tag is string => typeof tag === 'string') }
      : {}),
    ...(typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
      ? { updatedAt: raw.updatedAt }
      : { updatedAt: new Date().toISOString() })
  }
}

function normalizeMcpDiagrams(parsed: unknown): Diagram[] | ScryerToolResult {
  const rawDiagrams = Array.isArray(parsed) ? parsed : [parsed]
  if (rawDiagrams.length === 0) {
    return diagramFail('set_diagrams requires at least one diagram', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram']
    })
  }
  const diagrams: Diagram[] = []
  const seen = new Set<string>()
  for (const rawDiagram of rawDiagrams) {
    const diagram = normalizeMcpDiagram(rawDiagram)
    if (isToolResult(diagram)) {
      return diagram
    }
    if (seen.has(diagram.id)) {
      return diagramFail(`Duplicate diagram id '${diagram.id}'`, 'mcp.duplicate-id', {
        duplicateIds: [diagram.id],
        entity: 'diagram'
      })
    }
    seen.add(diagram.id)
    diagrams.push(diagram)
  }
  return diagrams
}

function normalizeMcpSourceRange(raw: unknown): DiagramSourceRange | ScryerToolResult | undefined {
  if (raw === undefined) {
    return undefined
  }
  if (!isRecord(raw) || typeof raw.startLine !== 'number' || raw.startLine < 1) {
    return diagramFail('Diagram ref sourceRange is invalid', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-source-range']
    })
  }
  if (
    raw.endLine !== undefined &&
    (typeof raw.endLine !== 'number' || raw.endLine < raw.startLine)
  ) {
    return diagramFail('Diagram ref sourceRange endLine is invalid', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-source-range']
    })
  }
  return {
    startLine: raw.startLine,
    ...(typeof raw.startColumn === 'number' ? { startColumn: raw.startColumn } : {}),
    ...(typeof raw.endLine === 'number' ? { endLine: raw.endLine } : {}),
    ...(typeof raw.endColumn === 'number' ? { endColumn: raw.endColumn } : {})
  }
}

function normalizeMcpRefTarget(raw: unknown): DiagramRefTarget | ScryerToolResult {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return diagramFail('Diagram ref target is invalid', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref']
    })
  }
  switch (raw.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      if (typeof raw.id !== 'string' || !raw.id.trim()) {
        return diagramFail('Diagram ref target id is required', 'mcp.validation-failed', {
          validationCodes: ['parser.invalid-diagram-ref'],
          targetType: raw.type
        })
      }
      return { type: raw.type, id: raw.id.trim() }
    case 'flowStep':
      if (
        typeof raw.flowId !== 'string' ||
        !raw.flowId.trim() ||
        typeof raw.stepId !== 'string' ||
        !raw.stepId.trim()
      ) {
        return diagramFail('Diagram ref flowStep target is invalid', 'mcp.validation-failed', {
          validationCodes: ['parser.invalid-diagram-ref']
        })
      }
      return { type: 'flowStep', flowId: raw.flowId.trim(), stepId: raw.stepId.trim() }
    case 'source': {
      if (typeof raw.pattern !== 'string') {
        return diagramFail(
          'Diagram ref source target pattern is required',
          'mcp.validation-failed',
          {
            validationCodes: ['parser.invalid-source-target']
          }
        )
      }
      const validation = validateWorkspaceRelativeSourcePattern(raw.pattern, 'parser')
      if (!validation.ok) {
        return diagramFail('Diagram ref source target is unsafe', 'mcp.validation-failed', {
          validationCodes: ['parser.invalid-source-target'],
          reason: validation.reason,
          rejectedPattern: validation.rejectedPattern
        })
      }
      return {
        type: 'source',
        pattern: validation.normalizedPattern,
        ...(typeof raw.line === 'number' ? { line: raw.line } : {}),
        ...(typeof raw.endLine === 'number' ? { endLine: raw.endLine } : {})
      }
    }
    default:
      return diagramFail('Diagram ref target type is invalid', 'mcp.validation-failed', {
        validationCodes: ['parser.invalid-diagram-ref'],
        targetType: raw.type
      })
  }
}

function normalizeMcpDiagramRef(raw: unknown): DiagramRef | ScryerToolResult {
  if (!isRecord(raw)) {
    return diagramFail('Diagram ref payload must be an object', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref']
    })
  }
  const id = asString(raw.id)?.trim() ?? ''
  const diagramId = asString(raw.diagramId)?.trim() ?? ''
  if (!id || !isValidExternalDiagramId(id)) {
    return diagramFail('MCP diagramRefs require explicit valid ids', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref'],
      missing: id ? undefined : 'id'
    })
  }
  if (!diagramId) {
    return diagramFail('MCP diagramRefs require diagramId', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref'],
      missing: 'diagramId'
    })
  }
  if (!VALID_DIAGRAM_REF_ROLES.has(raw.role as DiagramRefRole)) {
    return diagramFail('Diagram ref role is invalid', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref'],
      refId: id
    })
  }
  const target = normalizeMcpRefTarget(raw.target)
  if (isToolResult(target)) {
    return target
  }
  const sourceRange = normalizeMcpSourceRange(raw.sourceRange)
  if (isToolResult(sourceRange)) {
    return sourceRange
  }
  return {
    id,
    diagramId,
    target,
    role: raw.role as DiagramRefRole,
    ...(typeof raw.elementKey === 'string' && raw.elementKey.trim()
      ? { elementKey: raw.elementKey.trim() }
      : {}),
    ...(sourceRange ? { sourceRange } : {}),
    ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim() } : {})
  }
}

function normalizeMcpDiagramRefs(parsed: unknown): DiagramRef[] | ScryerToolResult {
  const rawRefs = Array.isArray(parsed) ? parsed : [parsed]
  if (rawRefs.length === 0) {
    return diagramFail('update_diagram_refs requires at least one ref', 'mcp.validation-failed', {
      validationCodes: ['parser.invalid-diagram-ref']
    })
  }
  const refs: DiagramRef[] = []
  const seen = new Set<string>()
  for (const rawRef of rawRefs) {
    const ref = normalizeMcpDiagramRef(rawRef)
    if (isToolResult(ref)) {
      return ref
    }
    if (seen.has(ref.id)) {
      return diagramFail(`Duplicate diagramRef id '${ref.id}'`, 'mcp.duplicate-id', {
        duplicateIds: [ref.id],
        entity: 'diagramRef'
      })
    }
    seen.add(ref.id)
    refs.push(ref)
  }
  return refs
}

function diagramControllerErrorToMcp(error: unknown): ScryerToolResult {
  if (!(error instanceof DiagramControllerError)) {
    return diagramFail(
      error instanceof Error ? error.message : String(error),
      'mcp.validation-failed'
    )
  }
  switch (error.code) {
    case 'controller.diagram-not-found':
      return diagramFail(error.message, 'mcp.diagram-not-found', error.details)
    case 'controller.ref-not-found':
      return diagramFail(error.message, 'mcp.ref-not-found', error.details)
    case 'controller.missing-target':
      return diagramFail(error.message, 'mcp.target-not-found', error.details)
    case 'controller.duplicate-id':
      return diagramFail(error.message, 'mcp.duplicate-id', error.details)
    case 'controller.invalid-source-target':
      return diagramFail(error.message, 'mcp.validation-failed', {
        validationCodes: ['parser.invalid-source-target'],
        ...error.details
      })
    default:
      return diagramFail(error.message, 'mcp.validation-failed', error.details)
  }
}

export async function handleSetDiagrams(
  args: SetDiagramsArgs,
  context: ScryerDiagramToolWriteContext
): Promise<ScryerToolResult> {
  const parsed = parseDiagramToolJson('set_diagrams', args.data)
  if (isToolResult(parsed)) {
    return parsed
  }
  const diagrams = normalizeMcpDiagrams(parsed)
  if (isToolResult(diagrams)) {
    return diagrams
  }

  const mode = args.mode ?? 'upsert'
  if (mode !== 'upsert' && mode !== 'replaceAll') {
    return diagramFail('set_diagrams mode is invalid', 'mcp.validation-failed', {
      validationCodes: ['mcp.invalid-mode'],
      mode
    })
  }
  const current = context.model
  let nextDiagrams: Diagram[]
  let refsDeleted: string[] = []
  if (mode === 'replaceAll') {
    const incomingIds = new Set(diagrams.map((diagram) => diagram.id))
    const removedIds = new Set(
      current.diagrams
        .filter((diagram) => !incomingIds.has(diagram.id))
        .map((diagram) => diagram.id)
    )
    refsDeleted = current.diagramRefs
      .filter((ref) => removedIds.has(ref.diagramId))
      .map((ref) => ref.id)
    nextDiagrams = diagrams
  } else {
    const byId = new Map(current.diagrams.map((diagram) => [diagram.id, diagram]))
    for (const diagram of diagrams) {
      byId.set(diagram.id, diagram)
    }
    nextDiagrams = [...byId.values()]
  }

  const removedRefIds = new Set(refsDeleted)
  const nextModel: C4ModelDataV2 = {
    ...current,
    diagrams: nextDiagrams,
    diagramRefs: current.diagramRefs.filter((ref) => !removedRefIds.has(ref.id))
  }
  await context.writeModel(context.projectPath, nextModel, context.modelName)
  return ok(`Set ${diagrams.length} diagram(s)`, {
    diagramsChanged: diagrams.map((diagram) => diagram.id),
    refsDeleted
  })
}

export async function handleGetDiagram(
  args: GetDiagramArgs,
  context: ScryerDiagramToolReadContext
): Promise<ScryerToolResult> {
  const diagramId = args.diagram_id?.trim()
  const diagram = context.model.diagrams.find((candidate) => candidate.id === diagramId)
  if (!diagram) {
    return diagramFail(`Diagram '${diagramId ?? ''}' not found`, 'mcp.diagram-not-found', {
      diagramId
    })
  }
  const refs =
    args.include_refs === false
      ? []
      : context.model.diagramRefs.filter((ref) => ref.diagramId === diagram.id)
  return ok(`Read diagram '${diagram.id}'`, { diagram, refs })
}

export async function handleUpdateDiagramRefs(
  args: UpdateDiagramRefsArgs,
  context: ScryerDiagramToolWriteContext
): Promise<ScryerToolResult> {
  const mode = args.mode ?? 'upsert'
  if (mode === 'delete') {
    if (args.data !== undefined) {
      return diagramFail(
        'update_diagram_refs delete mode does not accept data',
        'mcp.validation-failed',
        {
          validationCodes: ['mcp.delete-data-forbidden']
        }
      )
    }
    if (!Array.isArray(args.ref_ids) || args.ref_ids.length === 0) {
      return diagramFail(
        'update_diagram_refs delete mode requires ref_ids',
        'mcp.mode-argument-missing',
        {
          toolName: 'update_diagram_refs',
          mode,
          missing: 'ref_ids'
        }
      )
    }
    try {
      const result = deleteDiagramRefs(context.model, args.ref_ids)
      await context.writeModel(
        context.projectPath,
        result.model as C4ModelDataV2,
        context.modelName
      )
      return ok(`Deleted ${args.ref_ids.length} diagram ref(s)`, {
        refsChanged: [],
        refsDeleted: result.deletedDiagramRefIds
      })
    } catch (error) {
      return diagramControllerErrorToMcp(error)
    }
  }

  if (mode !== 'upsert' && mode !== 'replaceForDiagram') {
    return diagramFail('update_diagram_refs mode is invalid', 'mcp.validation-failed', {
      validationCodes: ['mcp.invalid-mode'],
      mode
    })
  }
  const parsed = parseDiagramToolJson('update_diagram_refs', args.data)
  if (isToolResult(parsed)) {
    return parsed
  }
  const refs = normalizeMcpDiagramRefs(parsed)
  if (isToolResult(refs)) {
    return refs
  }

  try {
    if (mode === 'replaceForDiagram') {
      const diagramId = args.diagram_id?.trim()
      if (!diagramId) {
        return diagramFail(
          'update_diagram_refs replaceForDiagram mode requires diagram_id',
          'mcp.mode-argument-missing',
          { toolName: 'update_diagram_refs', mode, missing: 'diagram_id' }
        )
      }
      if (refs.some((ref) => ref.diagramId !== diagramId)) {
        return diagramFail(
          'replaceForDiagram refs must all match diagram_id',
          'mcp.validation-failed',
          { validationCodes: ['parser.invalid-diagram-ref'], diagramId }
        )
      }
      if (!context.model.diagrams.some((diagram) => diagram.id === diagramId)) {
        return diagramFail(`Diagram '${diagramId}' not found`, 'mcp.diagram-not-found', {
          diagramId
        })
      }
      const refsDeleted = context.model.diagramRefs
        .filter((ref) => ref.diagramId === diagramId)
        .map((ref) => ref.id)
      const baseModel: C4ModelDataV2 = {
        ...context.model,
        diagramRefs: context.model.diagramRefs.filter((ref) => ref.diagramId !== diagramId)
      }
      const result = upsertDiagramRefs(baseModel, refs)
      await context.writeModel(
        context.projectPath,
        result.model as C4ModelDataV2,
        context.modelName
      )
      return ok(`Replaced refs for diagram '${diagramId}'`, {
        refsChanged: refs.map((ref) => ref.id),
        refsDeleted
      })
    }

    const result = upsertDiagramRefs(context.model, refs)
    await context.writeModel(context.projectPath, result.model as C4ModelDataV2, context.modelName)
    return ok(`Updated ${refs.length} diagram ref(s)`, {
      refsChanged: refs.map((ref) => ref.id),
      refsDeleted: []
    })
  } catch (error) {
    return diagramControllerErrorToMcp(error)
  }
}

export async function handleDeleteDiagram(
  args: DeleteDiagramArgs,
  context: ScryerDiagramToolDeleteContext
): Promise<ScryerToolResult> {
  const diagramId = args.diagram_id?.trim()
  if (!diagramId) {
    return diagramFail('delete_diagram requires diagram_id', 'mcp.mode-argument-missing', {
      toolName: 'delete_diagram',
      missing: 'diagram_id'
    })
  }

  try {
    const result = deleteDiagram(context.model, diagramId)
    await context.writeModel(context.projectPath, result.model as C4ModelDataV2, context.modelName)
    const cacheResult = await context.clearDiagramCache({
      projectPath: context.projectPath,
      modelName: context.modelName,
      diagramId
    })
    const warnings: DiagramDiagnostic[] =
      cacheResult.ok === false
        ? [
            {
              severity: 'warning',
              code: cacheResult.code,
              message: cacheResult.message
            }
          ]
        : []
    return ok(
      warnings.length > 0
        ? `Deleted diagram '${diagramId}' with cache cleanup warning`
        : `Deleted diagram '${diagramId}'`,
      {
        diagramId,
        refsDeleted: result.deletedDiagramRefIds,
        ...(warnings.length > 0 ? { warnings } : {})
      }
    )
  } catch (error) {
    return diagramControllerErrorToMcp(error)
  }
}

function validateNodeRuntimeShape(node: C4Node): string[] {
  const errors: string[] = []
  const record = node as C4Node & Record<string, unknown>
  for (const field of TOP_LEVEL_NODE_DATA_FIELDS) {
    if (record[field] === undefined) {
      continue
    }
    const target = field === 'parent' || field === 'parent_id' ? 'parentId' : `data.${field}`
    errors.push(`Node '${node.id}' uses top-level '${field}'. Use '${target}' instead.`)
  }
  if (!isRecord(node.data)) {
    errors.push(`Node '${node.id}' requires data`)
    return errors
  }
  if (typeof node.data.name !== 'string' || !node.data.name.trim()) {
    errors.push(`Node '${node.id}' requires data.name`)
  }
  if (typeof node.data.description !== 'string') {
    errors.push(`Node '${node.id}' requires data.description`)
  }
  if (!isKind(node.data.kind)) {
    errors.push(`Node '${node.id}' has invalid kind '${String(node.data.kind)}'`)
  }
  return errors
}

function validateRawSetModelData(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const root = isRecord(parsed) ? parsed : {}
  const errors: string[] = []
  if (root.sourceMap !== undefined && isRecord(root.sourceMap)) {
    for (const [nodeId, locations] of Object.entries(root.sourceMap)) {
      if (!Array.isArray(locations)) {
        errors.push(`sourceMap entry '${nodeId}' must be an array of source locations`)
      }
    }
  }
  if (!Array.isArray(root.nodes)) {
    return errors
  }
  for (const rawNode of root.nodes) {
    if (!isRecord(rawNode)) {
      errors.push('Each node must be an object')
      continue
    }
    const nodeId = typeof rawNode.id === 'string' ? rawNode.id : '<missing id>'
    for (const field of TOP_LEVEL_NODE_DATA_FIELDS) {
      if (rawNode[field] === undefined) {
        continue
      }
      const target = field === 'parent' || field === 'parent_id' ? 'parentId' : `data.${field}`
      errors.push(`Node '${nodeId}' uses top-level '${field}'. Use '${target}' instead.`)
    }
    if (!isRecord(rawNode.data)) {
      errors.push(`Node '${nodeId}' requires data`)
      continue
    }
    if (typeof rawNode.data.name !== 'string' || !rawNode.data.name.trim()) {
      errors.push(`Node '${nodeId}' requires data.name`)
    }
    if (typeof rawNode.data.description !== 'string') {
      errors.push(`Node '${nodeId}' requires data.description`)
    }
    if (!isKind(rawNode.data.kind)) {
      errors.push(`Node '${nodeId}' has invalid kind '${String(rawNode.data.kind)}'`)
    }
  }
  return errors
}

function validateParent(model: C4ModelData, node: C4Node): string | null {
  const parent = node.parentId
    ? model.nodes.find((candidate) => candidate.id === node.parentId)
    : null
  if (node.data.kind === 'person' || node.data.kind === 'system') {
    return node.parentId ? `${node.data.kind} '${node.data.name}' must be top-level` : null
  }
  if (node.data.kind === 'container' && parent?.data.kind !== 'system') {
    return `Container '${node.data.name}' must have a system parent`
  }
  if (node.data.kind === 'component' && parent?.data.kind !== 'container') {
    return `Component '${node.data.name}' must have a container parent`
  }
  if (
    (node.data.kind === 'operation' ||
      node.data.kind === 'process' ||
      node.data.kind === 'model') &&
    parent?.data.kind !== 'component'
  ) {
    return `${node.data.kind} '${node.data.name}' must have a component parent`
  }
  return null
}

function validateNoExternalChildren(model: C4ModelData): string[] {
  const errors: string[] = []
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  for (const node of model.nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent?.data.kind === 'system' && parent.data.external) {
      errors.push(`External system '${parent.data.name}' cannot contain '${node.data.name}'`)
    }
  }
  return errors
}

const MENTION_RE = /@\[([^\]]+)\]/g

function validateMentionEdges(model: C4ModelData): string[] {
  const errors: string[] = []
  const siblingsByParent = new Map<string, C4Node[]>()
  for (const node of model.nodes) {
    const key = node.parentId ?? ''
    siblingsByParent.set(key, [...(siblingsByParent.get(key) ?? []), node])
  }
  const edgeKeys = new Set<string>()
  for (const edge of model.edges) {
    edgeKeys.add(`${edge.source}->${edge.target}`)
    edgeKeys.add(`${edge.target}->${edge.source}`)
  }
  for (const node of model.nodes) {
    const siblings = siblingsByParent.get(node.parentId ?? '') ?? []
    for (const match of node.data.description.matchAll(MENTION_RE)) {
      const mention = match[1]
      const target = siblings.find(
        (candidate) =>
          candidate.id === mention ||
          candidate.data.name === mention ||
          candidate.data.name.toLowerCase() === mention.toLowerCase()
      )
      if (!target) {
        errors.push(`${node.data.name} mentions ${mention} but no sibling node matches it`)
        continue
      }
      if (target.id === node.id) {
        continue
      }
      if (!edgeKeys.has(`${node.id}->${target.id}`)) {
        errors.push(
          `${node.data.name} mentions ${target.data.name} but no relationship edge connects them`
        )
      }
    }
  }
  return errors
}

function validateFlowSteps(
  flowId: string,
  steps: unknown,
  path: string,
  seenIds: Set<string>
): string[] {
  if (!Array.isArray(steps)) {
    return [`Flow '${flowId}' ${path} must be an array`]
  }
  const errors: string[] = []
  for (const [index, rawStep] of steps.entries()) {
    const stepPath = `${path}[${index}]`
    if (!isRecord(rawStep)) {
      errors.push(`Flow '${flowId}' step at ${stepPath} must be an object`)
      continue
    }
    const stepId = asString(rawStep.id)?.trim() ?? ''
    if (!stepId) {
      errors.push(`Flow '${flowId}' step at ${stepPath} requires id`)
    } else if (seenIds.has(stepId)) {
      errors.push(`Duplicate step ID '${stepId}' in flow '${flowId}'`)
    } else {
      seenIds.add(stepId)
    }
    if (rawStep.description !== undefined && typeof rawStep.description !== 'string') {
      errors.push(`Flow '${flowId}' step '${stepId || stepPath}' description must be a string`)
    }
    if (rawStep.label !== undefined && typeof rawStep.label !== 'string') {
      errors.push(`Flow '${flowId}' step '${stepId || stepPath}' label must be a string`)
    }
    if (rawStep.branches === undefined) {
      continue
    }
    if (!Array.isArray(rawStep.branches)) {
      errors.push(`Flow '${flowId}' step '${stepId || stepPath}' branches must be an array`)
      continue
    }
    for (const [branchIndex, rawBranch] of rawStep.branches.entries()) {
      const branchPath = `${stepPath}.branches[${branchIndex}]`
      if (!isRecord(rawBranch)) {
        errors.push(`Flow '${flowId}' branch at ${branchPath} must be an object`)
        continue
      }
      if (rawBranch.condition !== undefined && typeof rawBranch.condition !== 'string') {
        errors.push(`Flow '${flowId}' branch at ${branchPath} condition must be a string`)
      }
      errors.push(...validateFlowSteps(flowId, rawBranch.steps, `${branchPath}.steps`, seenIds))
    }
  }
  return errors
}

function validateFlowRuntimeShape(flow: unknown, index: number): string[] {
  if (!isRecord(flow)) {
    return [`Flow at index ${index} must be an object`]
  }
  const flowId = asString(flow.id)?.trim() ?? ''
  const label = flowId || `index ${index}`
  const errors: string[] = []
  if ('flows' in flow) {
    errors.push(
      'set_flows data must be a single flow object or an array, not an object with a flows property'
    )
  }
  if (!flowId) {
    errors.push(`Flow at index ${index} requires id`)
  }
  if (typeof flow.name !== 'string' || !flow.name.trim()) {
    errors.push(`Flow '${label}' requires name`)
  }
  errors.push(...validateFlowSteps(label, flow.steps, 'steps', new Set<string>()))
  return errors
}

function migrateFlowStepLabels(steps: FlowStep[]): FlowStep[] {
  return steps.map((step) => ({
    ...step,
    description:
      step.description !== undefined && step.description !== '' ? step.description : step.label,
    label: step.description !== undefined && step.description !== '' ? step.label : undefined,
    branches: step.branches?.map((branch) => ({
      ...branch,
      steps: migrateFlowStepLabels(branch.steps)
    }))
  }))
}

function normalizeFlowForStorage(flow: Flow): Flow {
  return {
    ...flow,
    steps: migrateFlowStepLabels(flow.steps),
    transitions: undefined
  }
}

function inheritedExpectItems(
  model: C4ModelData,
  node: C4Node,
  nextContract?: Contract
): Contract['expect'] {
  const chain = ancestorChain(model, node)
  return [
    ...chain,
    { ...node, data: { ...node.data, contract: nextContract ?? node.data.contract } }
  ].flatMap((item) => item.data.contract?.expect ?? [])
}

function validateVerifiedGate(model: C4ModelData, node: C4Node, nextContract?: Contract): string[] {
  return inheritedExpectItems(model, node, nextContract)
    .filter((item) => typeof item !== 'object' || item.passed !== true)
    .map((item) => `- ${typeof item === 'string' ? item : item.text}`)
}

function validateModelShape(model: C4ModelData): string[] {
  const errors: string[] = []
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  for (const node of model.nodes) {
    const runtimeErrors = validateNodeRuntimeShape(node)
    errors.push(...runtimeErrors)
    if (runtimeErrors.length > 0) {
      continue
    }
    const parentError = validateParent(model, node)
    if (parentError) {
      errors.push(parentError)
    }
    if (node.parentId && !nodeIds.has(node.parentId)) {
      errors.push(`Node '${node.data.name}' references missing parent '${node.parentId}'`)
    }
    if (
      node.data.description.length > 200 &&
      !['operation', 'process', 'model'].includes(node.data.kind)
    ) {
      errors.push(`Description for '${node.data.name}' must be 200 characters or less`)
    }
    if (node.data.technology && node.data.technology.length > 28) {
      errors.push(
        `Technology '${node.data.technology}' on '${node.data.name}' exceeds 28 character limit`
      )
    }
    if (node.data.kind === 'operation') {
      const error = validateIdentifier(node.data.name, `operation '${node.id}'`)
      if (error) {
        errors.push(error)
      }
    }
    if (node.data.kind === 'model') {
      const error = validateTypeName(node.data.name, `model '${node.id}'`)
      if (error) {
        errors.push(error)
      }
      const propertyError = validatePropertyLabels(node.data.properties ?? [], `node '${node.id}'`)
      if (propertyError) {
        errors.push(propertyError)
      }
    }
  }
  errors.push(...validateNoExternalChildren(model))
  for (const edge of model.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`Edge '${edge.id}' references a missing node`)
    }
    if (typeof edge.data?.label !== 'string' || !edge.data.label.trim()) {
      errors.push(`Edge '${edge.id}' requires data.label`)
      continue
    }
    if ((edge.data?.label ?? '').length > 30) {
      errors.push(`Edge label '${edge.data?.label}' exceeds 30 character limit`)
    }
  }
  if (isRecord(model.sourceMap)) {
    for (const [nodeId, locations] of Object.entries(model.sourceMap)) {
      if (!Array.isArray(locations)) {
        errors.push(`sourceMap entry '${nodeId}' must be an array of source locations`)
        continue
      }
      for (const location of locations) {
        if (!isRecord(location) || typeof location.pattern !== 'string' || !location.pattern) {
          errors.push(`sourceMap entry '${nodeId}' contains an invalid source location`)
        }
      }
    }
  }
  for (const [index, flow] of (model.flows ?? []).entries()) {
    errors.push(...validateFlowRuntimeShape(flow, index))
  }
  return errors
}

function stripPositions(model: C4ModelData): C4ModelData {
  return {
    ...model,
    nodes: model.nodes.map(
      ({ position: _position, selected: _selected, measured: _measured, ...node }) => node
    )
  }
}

function stripNodeForAgent(node: C4Node): Omit<C4Node, 'position' | 'selected' | 'measured'> {
  const { position: _position, selected: _selected, measured: _measured, ...rest } = node
  return rest
}

type CompactAgentDiagram = Omit<Diagram, 'source'> & {
  sourceHash: `sha256:${string}`
  sourceOmitted: true
}

function compactDiagramForAgent(diagram: Diagram): CompactAgentDiagram {
  const { source: _source, ...rest } = diagram
  return {
    ...rest,
    sourceHash: computeDiagramSourceHash(diagram.source),
    sourceOmitted: true
  }
}

function uniqueDiagramTargets(refs: DiagramRef[]): DiagramRefTarget[] {
  const targets: DiagramRefTarget[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const key = JSON.stringify(sortForCompare(ref.target))
    if (!seen.has(key)) {
      seen.add(key)
      targets.push(ref.target)
    }
  }
  return targets
}

function compactDiagramRef(ref: DiagramRef): CompactDiagramRefSummary {
  return {
    id: ref.id,
    diagramId: ref.diagramId,
    target: ref.target,
    role: ref.role,
    ...(ref.elementKey ? { elementKey: ref.elementKey } : {}),
    ...(ref.sourceRange ? { sourceRange: ref.sourceRange } : {}),
    ...(ref.note ? { note: ref.note } : {})
  }
}

export function buildCompactDiagramSummaries(
  model: C4ModelData,
  refs: DiagramRef[] = model.diagramRefs ?? []
): CompactDiagramSummary[] {
  return (model.diagrams ?? []).map((diagram) => {
    const diagramRefs = refs.filter((ref) => ref.diagramId === diagram.id)
    return {
      id: diagram.id,
      name: diagram.name,
      kind: diagram.kind,
      notation: diagram.notation,
      ...(diagram.description ? { description: diagram.description } : {}),
      ...(diagram.tags ? { tags: diagram.tags } : {}),
      ...(diagram.updatedAt ? { updatedAt: diagram.updatedAt } : {}),
      sourceHash: computeDiagramSourceHash(diagram.source),
      sourceOmitted: true,
      refCount: diagramRefs.length,
      relatedTargets: uniqueDiagramTargets(diagramRefs)
    }
  })
}

export function buildExistingToolDiagramContext(
  model: C4ModelData,
  refs: DiagramRef[] = model.diagramRefs ?? []
): ExistingToolDiagramContext {
  const diagramIds = new Set(refs.map((ref) => ref.diagramId))
  const scopedModel: C4ModelData = {
    ...model,
    diagrams:
      refs === model.diagramRefs
        ? (model.diagrams ?? [])
        : (model.diagrams ?? []).filter((diagram) => diagramIds.has(diagram.id)),
    diagramRefs: refs
  }
  return {
    diagramSummaries: buildCompactDiagramSummaries(scopedModel, refs),
    diagramRefs: refs.map(compactDiagramRef)
  }
}

function withCompactDiagramContext(model: C4ModelData): Omit<
  C4ModelData,
  'diagrams' | 'diagramRefs'
> & {
  diagrams: CompactAgentDiagram[]
  diagramRefs: CompactDiagramRefSummary[]
  diagramContext: ExistingToolDiagramContext
} {
  return {
    ...model,
    diagrams: (model.diagrams ?? []).map(compactDiagramForAgent),
    diagramRefs: (model.diagramRefs ?? []).map(compactDiagramRef),
    diagramContext: buildExistingToolDiagramContext(model)
  }
}

function nextNodeId(model: C4ModelData): string {
  let max = 0
  for (const node of model.nodes) {
    const match = /^node-(\d+)$/.exec(node.id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `node-${max + 1}`
}

function ancestorChain(model: C4ModelData, node: C4Node): C4Node[] {
  const chain: C4Node[] = []
  let current = node
  while (current.parentId) {
    const parent = model.nodes.find((candidate) => candidate.id === current.parentId)
    if (!parent) {
      break
    }
    chain.unshift(parent)
    current = parent
  }
  return chain
}

function mergeContract(chain: C4Node[], node: C4Node): Contract {
  const merged: Contract = { expect: [], ask: [], never: [] }
  for (const item of [...chain, node]) {
    const contract = item.data.contract
    if (!contract) {
      continue
    }
    merged.expect.push(...contract.expect)
    merged.ask.push(...contract.ask)
    merged.never.push(...contract.never)
  }
  return merged
}

function collectNotes(chain: C4Node[], node: C4Node): string[] {
  const notes: string[] = []
  for (const ancestor of chain) {
    for (const note of ancestor.data.notes ?? []) {
      notes.push(`${ancestor.data.name}: ${note}`)
    }
  }
  notes.push(...(node.data.notes ?? []))
  return notes
}

function hasStatusChildren(model: C4ModelData, node: C4Node): boolean {
  return model.nodes.some(
    (candidate) =>
      candidate.parentId === node.id &&
      candidate.data.status !== undefined &&
      ((node.data.kind === 'container' && candidate.data.kind === 'component') ||
        (node.data.kind === 'system' && candidate.data.kind === 'container'))
  )
}

function childrenAllDone(model: C4ModelData, node: C4Node): boolean {
  const childKind =
    node.data.kind === 'container' ? 'component' : node.data.kind === 'system' ? 'container' : null
  if (!childKind) {
    return true
  }
  return model.nodes
    .filter(
      (candidate) =>
        candidate.parentId === node.id && candidate.data.kind === childKind && candidate.data.status
    )
    .every((candidate) => ['implemented', 'verified', 'vagrant'].includes(candidate.data.status!))
}

function isSatisfied(model: C4ModelData, node: C4Node): boolean {
  if (node.data.external) {
    return true
  }
  if (hasStatusChildren(model, node)) {
    return childrenAllDone(model, node)
  }
  return (
    node.data.status === undefined ||
    ['implemented', 'verified', 'vagrant'].includes(node.data.status)
  )
}

function contractItemText(item: ContractItem): string {
  return typeof item === 'string' ? item : item.text
}

function contractIsEmpty(contract?: Contract): boolean {
  return (
    !contract ||
    (contract.expect.length === 0 && contract.ask.length === 0 && contract.never.length === 0)
  )
}

function formatContractBlock(contract: Contract, indent = ''): string {
  const lines: string[] = []
  if (contract.expect.length > 0) {
    lines.push(
      `${indent}MUST:`,
      ...contract.expect.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  if (contract.ask.length > 0) {
    lines.push(
      `${indent}ASK USER FIRST:`,
      ...contract.ask.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  if (contract.never.length > 0) {
    lines.push(
      `${indent}NEVER:`,
      ...contract.never.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  return lines.join('\n')
}

function statusStr(status?: Status): string {
  return status ?? 'none'
}

function kindStr(kind: C4Kind): string {
  return kind
}

function groupMemberIds(group: Group): string[] {
  const legacy = group as Group & { member_ids?: string[] }
  return Array.isArray(group.memberIds) ? group.memberIds : (legacy.member_ids ?? [])
}

function formatContractAndNotes(title: string, contract: Contract, notes: string[]): string {
  const lines: string[] = []
  if (!contractIsEmpty(contract)) {
    lines.push(`\n${title} Contract (MUST follow):`, formatContractBlock(contract, '  '))
  }
  if (notes.length > 0) {
    lines.push(`\n${title} Notes:`, ...notes.map((note) => `  - ${note}`))
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}

function findNextName(
  blockedNodes: C4Node[],
  readyNodes: C4Node[],
  currentWorkUnit: C4Node[]
): string | null {
  const current = new Set(currentWorkUnit.map((node) => node.id))
  const nextReady = readyNodes.find((node) => !current.has(node.id))
  if (nextReady) {
    return nextReady.data.name
  }
  return blockedNodes[0]?.data.name ?? null
}

function formatDiagramTarget(target: DiagramRefTarget): string {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return `${target.type}:${target.id}`
    case 'flowStep':
      return `flowStep:${target.flowId}/${target.stepId}`
    case 'source':
      return `source:${target.pattern}`
  }
}

function formatLinkedDiagramContext(model: C4ModelData, nodeId: string): string[] {
  const context = getScopedDiagramContext(model, nodeId)
  if (context.diagramSummaries.length === 0) {
    return []
  }
  return [
    '',
    'Linked diagrams:',
    ...context.diagramSummaries.map(
      (diagram) =>
        `  - ${diagram.name} [${diagram.id}] (${diagram.kind}) sourceHash ${diagram.sourceHash}; source omitted. Use \`get_diagram\` before editing omitted diagram source. Targets: ${diagram.relatedTargets.map(formatDiagramTarget).join(', ')}`
    )
  ]
}

function collectDescendantIds(model: C4ModelData, nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of model.nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

function cleanupReferences(model: C4ModelData, deletedIds: Set<string>): void {
  for (const id of deletedIds) {
    delete model.sourceMap?.[id]
  }
  model.groups = (model.groups ?? [])
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => !deletedIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0)
}

async function writeModelAndBaseline(projectPath: string, model: C4ModelData): Promise<void> {
  await writeModel(projectPath, model)
  await writeBaseline(projectPath, model)
}

async function setModel(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (typeof args.data !== 'string') {
    return fail('set_model requires a JSON string in arguments.data')
  }
  const inputErrors = validateRawSetModelData(args.data)
  if (inputErrors.length > 0) {
    return fail(inputErrors.join('\n'))
  }
  let model: C4ModelData
  try {
    model = stripPositions(parseModelData(args.data))
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Set model (${model.nodes.length} nodes, ${model.edges.length} edges)`, model)
}

async function getTask(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  const model = await readModel(projectPath)
  const scopeId = asString(args.node_id ?? args.nodeId)

  const isDescendantOf = (nodeId: string, ancestorId: string): boolean => {
    let current = model.nodes.find((node) => node.id === nodeId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true
      }
      current = model.nodes.find((node) => node.id === current?.parentId)
    }
    return false
  }

  const inScope = (node: C4Node): boolean =>
    !scopeId || node.id === scopeId || isDescendantOf(node.id, scopeId)

  const parentIsExternal = (node: C4Node): boolean => {
    const parent = node.parentId
      ? model.nodes.find((candidate) => candidate.id === node.parentId)
      : null
    return parent?.data.external === true
  }

  const taskNodes = model.nodes.filter((node) => {
    if (!['container', 'component'].includes(node.data.kind)) {
      return false
    }
    if (!node.data.status || node.data.status === 'vagrant') {
      return false
    }
    if (parentIsExternal(node)) {
      return false
    }
    if (node.data.kind === 'container' && hasStatusChildren(model, node)) {
      return false
    }
    return inScope(node)
  })

  if (taskNodes.length === 0) {
    return ok('All architecture tasks complete.')
  }

  const workNodes = taskNodes.filter((node) => !isSatisfied(model, node))

  if (workNodes.length === 0) {
    const completed = taskNodes.filter((node) => isSatisfied(model, node)).length
    const propagateNodes = model.nodes.filter((node) => {
      if (!['container', 'system'].includes(node.data.kind)) {
        return false
      }
      if (node.data.status === 'implemented' || node.data.status === 'verified') {
        return false
      }
      return hasStatusChildren(model, node) && childrenAllDone(model, node) && inScope(node)
    })

    if (propagateNodes.length === 0) {
      return ok('All architecture tasks complete.')
    }

    const pendingMembers = model.nodes.filter((node) => {
      if (!['operation', 'process', 'model'].includes(node.data.kind)) {
        return false
      }
      if (node.data.status !== 'proposed') {
        return false
      }
      const parent = node.parentId
        ? model.nodes.find((candidate) => candidate.id === node.parentId)
        : null
      return parent?.data.kind === 'component' && isSatisfied(model, parent)
    })

    const output = [
      `All ${completed} tasks complete.`,
      '',
      'Mark these parent nodes as implemented:',
      '```',
      `update_nodes(nodes: [${propagateNodes
        .map(
          (node) =>
            `{node_id: "${node.id}", status: "implemented", reason: "All child tasks are implemented", source: [{pattern: "src/module/**/*.ts"}]}`
        )
        .join(', ')}])`,
      '```',
      ...propagateNodes.map((node) => `- ${node.data.name}`),
      pendingMembers.length > 0
        ? [
            '',
            'These member nodes are still proposed — mark as implemented with a reason explaining what was built:',
            ...pendingMembers.map((member) => {
              const parent = model.nodes.find((node) => node.id === member.parentId)
              return `  - ${member.data.name} [${member.id}] (${kindStr(member.data.kind)}, ${statusStr(member.data.status)}) in ${parent?.data.name ?? 'unknown'}`
            })
          ].join('\n')
        : '',
      (model.flows ?? []).length > 0 ? 'Then call get_task again to validate flows.' : ''
    ]
      .filter(Boolean)
      .join('\n')

    return ok(output, propagateNodes)
  }

  const depsSatisfied = (node: C4Node): boolean => {
    if (node.data.kind !== 'component') {
      return true
    }
    for (const edge of model.edges) {
      if (edge.source !== node.id) {
        continue
      }
      const target = model.nodes.find((candidate) => candidate.id === edge.target)
      if (
        target?.data.kind === 'component' &&
        target.parentId === node.parentId &&
        !isSatisfied(model, target)
      ) {
        return false
      }
    }
    return true
  }

  const readyNodes: C4Node[] = []
  const blockedNodes: C4Node[] = []
  for (const node of workNodes) {
    if (depsSatisfied(node)) {
      readyNodes.push(node)
    } else {
      blockedNodes.push(node)
    }
  }

  if (readyNodes.length === 0 && blockedNodes.length > 0) {
    return ok(
      [
        'Dependency cycle detected. The following nodes all block each other:',
        '',
        ...blockedNodes.map((node) => `  - ${node.data.name} [${node.id}]`),
        '',
        'Fix the model by removing or redirecting edges to break the cycle.'
      ].join('\n'),
      blockedNodes
    )
  }

  const totalTasks = taskNodes.length
  const completedTasks = taskNodes.filter((node) => isSatisfied(model, node)).length

  for (const group of model.groups ?? []) {
    const memberIds = groupMemberIds(group)
    const memberContainers = model.nodes.filter(
      (node) => node.data.kind === 'container' && memberIds.includes(node.id)
    )
    if (memberContainers.length === 0 || memberContainers.length !== memberIds.length) {
      continue
    }
    const scopedToGroup =
      !scopeId ||
      memberContainers.some(
        (node) =>
          node.id === scopeId ||
          isDescendantOf(scopeId, node.id) ||
          isDescendantOf(node.id, scopeId)
      )
    if (!scopedToGroup) {
      continue
    }
    if (!memberContainers.every((node) => node.data.status === 'proposed')) {
      continue
    }

    const lines = [
      '# Setup',
      '',
      `## Scaffold: ${group.name}`,
      '',
      group.description ?? '',
      'Set up the project structure for these containers:',
      '',
      ...memberContainers.flatMap((node) => [
        `- **${node.data.name}** [${node.id}]${node.data.technology ? ` — ${node.data.technology}` : ''}`,
        node.data.description ? `  ${node.data.description}` : '',
        ...formatLinkedDiagramContext(model, node.id)
      ]),
      !contractIsEmpty(group.contract)
        ? `\n${group.name} — Group Contract (MUST follow):\n${formatContractBlock(group.contract!)}`
        : '',
      ...memberContainers.map((node) =>
        formatContractAndNotes(
          node.data.name,
          mergeContract(ancestorChain(model, node), node),
          collectNotes(ancestorChain(model, node), node)
        )
      ),
      '---',
      TASK_INSTRUCTIONS,
      '',
      'After scaffolding, mark these as implemented with a reason explaining what was scaffolded:',
      '```',
      `update_nodes(nodes: [${memberContainers
        .map(
          (node) =>
            `{node_id: "${node.id}", status: "implemented", reason: "Scaffolded shared runtime"}`
        )
        .join(', ')}])`,
      '```',
      '',
      `---\nProgress: ${completedTasks}/${totalTasks} tasks complete${
        findNextName(blockedNodes, readyNodes, memberContainers)
          ? ` | Next up: ${findNextName(blockedNodes, readyNodes, memberContainers)}`
          : ''
      }`
    ]
      .filter(Boolean)
      .join('\n')

    return ok(lines, memberContainers)
  }

  if (!scopeId) {
    const choosableContainers = model.nodes.filter((node) => {
      if (node.data.kind !== 'container' || !node.data.status || node.data.external) {
        return false
      }
      if (parentIsExternal(node)) {
        return false
      }
      const selfNeedsWork = !isSatisfied(model, node)
      const childrenNeedWork = model.nodes.some(
        (child) =>
          child.parentId === node.id &&
          child.data.status !== undefined &&
          !['implemented', 'verified', 'vagrant'].includes(child.data.status)
      )
      return selfNeedsWork || childrenNeedWork
    })

    if (choosableContainers.length > 1) {
      const lines = [
        `# Task ${completedTasks + 1} of ${totalTasks}`,
        '',
        '## Choose next task',
        '',
        'These containers are ready to build. Pick one and call get_task again with node_id set to that container id.',
        '',
        ...choosableContainers.map((node) => `- **${node.data.name}** [${node.id}]`)
      ]
      return ok(lines.join('\n'), choosableContainers)
    }
  }

  const readyContainers = readyNodes.filter((node) => node.data.kind === 'container')
  const readyComponents = readyNodes.filter((node) => node.data.kind === 'component')
  const workUnit =
    readyContainers.length > 0
      ? readyContainers
      : ((): C4Node[] => {
          const firstParent = readyComponents[0]?.parentId
          const siblings = readyComponents.filter((node) => node.parentId === firstParent)
          const siblingIds = new Set(siblings.map((node) => node.id))
          const hasInterDeps = model.edges.some(
            (edge) => siblingIds.has(edge.source) && siblingIds.has(edge.target)
          )
          if (!hasInterDeps) {
            return siblings
          }
          return siblings
            .filter(
              (node) =>
                !model.edges.some((edge) => edge.source === node.id && siblingIds.has(edge.target))
            )
            .slice(0, 1)
        })()

  if (workUnit.length === 0) {
    return ok('All tasks complete. Nothing to build.')
  }

  const globalTaskNodes = model.nodes.filter((node) => {
    if (!['container', 'component'].includes(node.data.kind) || !node.data.status) {
      return false
    }
    if (parentIsExternal(node)) {
      return false
    }
    return !(node.data.kind === 'container' && hasStatusChildren(model, node))
  })
  const globalCompleted = globalTaskNodes.filter((node) => isSatisfied(model, node)).length
  const taskNum = globalCompleted + 1
  const unitLabel =
    workUnit.length === 1
      ? `Build: ${workUnit[0]!.data.name}`
      : `Build: ${workUnit.map((node) => node.data.name).join(' + ')}`

  const lines = [
    `# Task ${taskNum} of ${globalTaskNodes.length}`,
    '',
    `## ${unitLabel}`,
    '',
    'Build ONLY what this task describes. Do not scaffold or set up other parts of the project.',
    ''
  ]

  for (const node of workUnit) {
    const chain = ancestorChain(model, node)
    const contract = mergeContract(chain, node)
    const notes = collectNotes(chain, node)
    if (workUnit.length > 1) {
      lines.push(`### ${node.data.name} [${node.id}]`)
    } else {
      lines.push(`[${node.id}]`)
    }
    if (node.data.description) {
      lines.push(node.data.description)
    }
    if (node.data.technology) {
      lines.push(`Technology: ${node.data.technology}`)
    }
    lines.push(`Status: ${statusStr(node.data.status)}`)
    if (!contractIsEmpty(contract)) {
      lines.push(
        '\nContract (you MUST follow these requirements):',
        formatContractBlock(contract, '  ')
      )
    }
    if (notes.length > 0) {
      lines.push('\nNotes:', ...notes.map((note) => `  - ${note}`))
    }

    const childKinds: [string, C4Kind][] = [
      ['Processes', 'process'],
      ['Models', 'model'],
      ['Operations', 'operation']
    ]
    for (const [label, kind] of childKinds) {
      const children = model.nodes.filter(
        (child) => child.parentId === node.id && child.data.kind === kind
      )
      if (children.length === 0) {
        continue
      }
      lines.push(`\n${label}:`)
      for (const child of children) {
        lines.push(`  - ${child.data.name} [${child.id}] (${statusStr(child.data.status)})`)
        if (child.data.description) {
          lines.push(`    ${child.data.description}`)
        }
        if (kind === 'model') {
          for (const property of child.data.properties ?? []) {
            lines.push(
              `    .${property.label}${property.description ? ` — ${property.description}` : ''}`
            )
          }
        }
      }
    }

    if ((node.data.sources ?? []).length > 0) {
      lines.push(
        '\nSources:',
        ...(node.data.sources ?? []).map((source) => `  - ${source.pattern} — ${source.comment}`)
      )
    }
    lines.push(...formatLinkedDiagramContext(model, node.id))

    const dependencies = model.edges
      .map((edge) => {
        if (edge.source === node.id) {
          const target = model.nodes.find((candidate) => candidate.id === edge.target)
          return target
            ? `  -> ${target.data.name} "${edge.data?.label ?? ''}" (${kindStr(target.data.kind)})`
            : null
        }
        if (edge.target === node.id) {
          const source = model.nodes.find((candidate) => candidate.id === edge.source)
          return source
            ? `  <- ${source.data.name} "${edge.data?.label ?? ''}" (${kindStr(source.data.kind)})`
            : null
        }
        return null
      })
      .filter((item): item is string => item !== null)
    if (dependencies.length > 0) {
      lines.push('\nDependencies:', ...dependencies)
    }
    lines.push('')
  }

  lines.push('---', TASK_INSTRUCTIONS, '')
  lines.push('After building, mark as implemented with a reason and set source locations:')
  lines.push('```')
  lines.push(
    `update_nodes(nodes: [${workUnit
      .map(
        (node) =>
          `{node_id: "${node.id}", status: "implemented", reason: "Built ${node.data.name}", source: [{pattern: "src/module/file.ts", line: 1, endLine: 50}]}`
      )
      .join(', ')}])`
  )
  lines.push('```')

  const pendingMembers = workUnit.flatMap((node) =>
    node.data.kind === 'component'
      ? model.nodes
          .filter(
            (child) =>
              child.parentId === node.id &&
              ['operation', 'process', 'model'].includes(child.data.kind) &&
              child.data.status === 'proposed'
          )
          .map((child) => ({ child, parentName: node.data.name }))
      : []
  )
  if (pendingMembers.length > 0) {
    lines.push(
      '\nAlso mark these member nodes as implemented with a reason explaining what was built:'
    )
    for (const { child, parentName } of pendingMembers) {
      lines.push(
        `  - ${child.data.name} [${child.id}] (${kindStr(child.data.kind)}, ${statusStr(child.data.status)}) in ${parentName}`
      )
    }
  }

  const nextName = findNextName(blockedNodes, readyNodes, workUnit)
  lines.push(
    `\n---\nProgress: ${globalCompleted}/${globalTaskNodes.length} tasks complete${
      nextName ? ` | Next up: ${nextName}` : ''
    }`
  )

  return ok(lines.join('\n'), workUnit)
}

async function updateNodes(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.nodes)) {
    return fail('update_nodes requires arguments.nodes')
  }
  const model = await readModel(projectPath)
  const sourceMap = { ...model.sourceMap }
  const updated: string[] = []
  for (const update of args.nodes) {
    if (!isRecord(update) || typeof update.node_id !== 'string') {
      return fail('Each update_nodes item requires node_id')
    }
    const node = model.nodes.find((candidate) => candidate.id === update.node_id)
    if (!node) {
      return fail(`Node '${update.node_id}' not found`)
    }
    const nextContract = normalizeContract(update.contract)
    if (update.status !== undefined) {
      if (!isStatus(update.status)) {
        return fail(`Node '${update.node_id}' has invalid status '${String(update.status)}'`)
      }
      const reason = asString(update.reason)?.trim() ?? ''
      if (!reason) {
        return fail(`Node '${update.node_id}': reason is required when changing status`)
      }
      if (update.status === 'verified') {
        const unmet = validateVerifiedGate(model, node, nextContract)
        if (unmet.length > 0) {
          return fail(
            `Cannot set '${update.node_id}' to verified. These expect contract items are not yet passed:\n${unmet.join('\n')}`
          )
        }
      }
      node.data.status = update.status
      node.data.statusReason = reason
    }
    const nextName = asString(update.name)
    if (nextName !== undefined) {
      const identifierError =
        node.data.kind === 'operation'
          ? validateIdentifier(nextName, `operation '${node.id}'`)
          : null
      const typeError =
        node.data.kind === 'model' ? validateTypeName(nextName, `model '${node.id}'`) : null
      if (identifierError ?? typeError) {
        return fail((identifierError ?? typeError)!)
      }
      node.data.name = nextName
    }
    const nextDescription = asString(update.description)
    if (nextDescription !== undefined) {
      node.data.description = nextDescription
    }
    const nextTechnology = asString(update.technology)
    if (nextTechnology !== undefined) {
      node.data.technology = nextTechnology
    }
    if (typeof update.external === 'boolean') {
      node.data.external = update.external
    }
    const nextShape = asString(update.shape)
    if (nextShape !== undefined) {
      node.data.shape = nextShape as C4Node['data']['shape']
    }
    const sources = normalizeSources(update.sources)
    if (sources !== undefined) {
      node.data.sources = sources
    }
    if (nextContract !== undefined) {
      node.data.contract = nextContract
    }
    const notes = asStringArray(update.notes)
    if (notes !== undefined) {
      node.data.notes = notes
    }
    const properties = normalizeProperties(update.properties)
    if (properties !== undefined) {
      const error = validatePropertyLabels(properties, `node '${update.node_id}'`)
      if (error) {
        return fail(error)
      }
      node.data.properties = properties
    }
    if (update.source !== undefined) {
      const { locations, error } = normalizeSourceLocationsStrict(
        update.source,
        `source map entry '${node.id}'`
      )
      if (error) {
        return fail(error)
      }
      const nextLocations = locations ?? []
      if (nextLocations.length === 0) {
        delete sourceMap[node.id]
      } else {
        sourceMap[node.id] = nextLocations
      }
    }
    updated.push(update.node_id)
  }
  model.sourceMap = sourceMap
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Updated ${updated.length} node(s)`, model)
}

async function addNodes(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.nodes)) {
    return fail('add_nodes requires arguments.nodes')
  }
  const model = await readModel(projectPath)
  const added: string[] = []
  for (const item of args.nodes) {
    if (!isRecord(item) || typeof item.name !== 'string' || !isKind(item.kind)) {
      return fail('Each add_nodes item requires name and valid kind')
    }
    const kind = item.kind
    const status = isStatus(item.status) && kind !== 'person' ? item.status : undefined
    const node: C4Node = {
      id: nextNodeId(model),
      type: nodeTypeForKind(kind),
      parentId: asString(item.parent_id ?? item.parentId),
      data: {
        name: item.name,
        description: asString(item.description) ?? '',
        kind,
        technology: asString(item.technology),
        external: typeof item.external === 'boolean' ? item.external : undefined,
        shape: asString(item.shape) as C4Node['data']['shape'],
        sources: normalizeSources(item.sources),
        status,
        contract: normalizeContract(item.contract),
        notes: asStringArray(item.notes),
        properties: normalizeProperties(item.properties)
      }
    }
    const parentError = validateParent({ ...model, nodes: [...model.nodes, node] }, node)
    if (parentError) {
      return fail(parentError)
    }
    model.nodes.push(node)
    added.push(node.id)
  }
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Added ${added.length} node(s): ${added.join(', ')}`, model)
}

async function setNode(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  const nodeId = asString(args.node_id ?? args.nodeId)
  if (!nodeId || typeof args.data !== 'string') {
    return fail('set_node requires node_id and JSON string data')
  }
  const model = await readModel(projectPath)
  if (!model.nodes.some((node) => node.id === nodeId)) {
    return fail(`Node '${nodeId}' not found`)
  }
  let subtree: { nodes: C4Node[]; edges: C4Edge[] }
  try {
    const parsed = JSON.parse(args.data) as Partial<{ nodes: C4Node[]; edges: C4Edge[] }>
    subtree = { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch (error) {
    return fail(`Invalid subtree JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const oldDescendants = collectDescendantIds(model, nodeId)
  oldDescendants.delete(nodeId)
  model.nodes = model.nodes.filter((node) => !oldDescendants.has(node.id))
  model.edges = model.edges.filter(
    (edge) => !oldDescendants.has(edge.source) && !oldDescendants.has(edge.target)
  )
  cleanupReferences(model, oldDescendants)

  const incomingIds = new Set(subtree.nodes.map((node) => node.id))
  for (const node of subtree.nodes) {
    if (!node.parentId || (node.parentId !== nodeId && !incomingIds.has(node.parentId))) {
      return fail(`Node '${node.id}' must be a descendant of '${nodeId}'`)
    }
    node.type = nodeTypeForKind(node.data.kind)
    delete node.position
  }
  model.nodes.push(...subtree.nodes)
  model.edges.push(...subtree.edges)
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(
    `Set ${subtree.nodes.length} descendant node(s) and ${subtree.edges.length} edge(s) under '${nodeId}'`,
    model
  )
}

async function addEdges(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.edges)) {
    return fail('add_edges requires arguments.edges')
  }
  const model = await readModel(projectPath)
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  const added: string[] = []
  for (const item of args.edges) {
    if (
      !isRecord(item) ||
      typeof item.source !== 'string' ||
      typeof item.target !== 'string' ||
      typeof item.label !== 'string'
    ) {
      return fail('Each add_edges item requires source, target, and label')
    }
    if (!nodeIds.has(item.source)) {
      return fail(`Source node '${item.source}' not found`)
    }
    if (!nodeIds.has(item.target)) {
      return fail(`Target node '${item.target}' not found`)
    }
    if (item.label.length > 30) {
      return fail(`Edge label '${item.label}' exceeds 30 character limit`)
    }
    const id = makeEdgeId(item.source, item.target)
    if (model.edges.some((edge) => edge.id === id)) {
      return fail(`Edge from '${item.source}' to '${item.target}' already exists`)
    }
    model.edges.push({
      id,
      source: item.source,
      target: item.target,
      data: {
        label: item.label,
        ...(typeof item.method === 'string' ? { method: item.method } : {})
      }
    })
    added.push(id)
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Added ${added.length} edge(s)`, model)
}

async function updateEdges(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.edges)) {
    return fail('update_edges requires arguments.edges')
  }
  const model = await readModel(projectPath)
  const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]))
  for (const input of args.edges) {
    if (!isRecord(input)) {
      return fail('Each update_edges item must be an object')
    }
    const edgeId = asString(input.edge_id ?? input.id)
    if (!edgeId) {
      return fail('Each update_edges item requires edge_id')
    }
    const existing = edgeById.get(edgeId)
    if (input.edge_id && !existing) {
      return fail(`Edge '${edgeId}' not found`)
    }
    const edge: C4Edge = existing
      ? { ...existing, data: { ...(existing.data ?? { label: '' }) } }
      : {
          id: edgeId,
          source: asString(input.source) ?? '',
          target: asString(input.target) ?? '',
          data: { label: '' }
        }
    if (typeof input.label === 'string') {
      edge.data = { ...(edge.data ?? { label: '' }), label: input.label }
    }
    if (typeof input.method === 'string') {
      edge.data = { ...(edge.data ?? { label: '' }), method: input.method }
    }
    if (isRecord(input.data)) {
      edge.data = input.data as C4Edge['data']
    }
    if (typeof input.source === 'string') {
      edge.source = input.source
    }
    if (typeof input.target === 'string') {
      edge.target = input.target
    }
    edgeById.set(edge.id, edge)
  }
  model.edges = [...edgeById.values()]
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Updated ${args.edges.length} edge(s)`, model)
}

function getScopedNode(model: C4ModelData, nodeId: string): unknown {
  const target = model.nodes.find((node) => node.id === nodeId)
  if (!target) {
    return null
  }
  const subtreeIds = collectDescendantIds(model, nodeId)
  const descendants = model.nodes.filter((node) => subtreeIds.has(node.id) && node.id !== nodeId)
  const internalEdges: C4Edge[] = []
  const externalEdges: unknown[] = []
  for (const edge of model.edges) {
    const sourceIn = subtreeIds.has(edge.source)
    const targetIn = subtreeIds.has(edge.target)
    if (sourceIn && targetIn) {
      internalEdges.push(edge)
    } else if (sourceIn || targetIn) {
      const externalNodeId = sourceIn ? edge.target : edge.source
      const externalNode = model.nodes.find((node) => node.id === externalNodeId)
      externalEdges.push({
        ...edge,
        external_node_name: externalNode?.data.name ?? '',
        external_node_kind: externalNode ? kindLabel(externalNode.data.kind) : ''
      })
    }
  }
  const sourceMap = Object.fromEntries(
    Object.entries(model.sourceMap ?? {}).filter(([id]) => subtreeIds.has(id))
  )
  const groups: Group[] = []
  let group = (model.groups ?? []).find((candidate) => candidate.memberIds.includes(nodeId))
  const seen = new Set<string>()
  while (group && !seen.has(group.id)) {
    groups.push(group)
    seen.add(group.id)
    group = group.parentGroupId
      ? (model.groups ?? []).find((candidate) => candidate.id === group!.parentGroupId)
      : undefined
  }
  return {
    node: stripNodeForAgent(target),
    descendants: descendants.map(stripNodeForAgent),
    internal_edges: internalEdges,
    external_edges: externalEdges,
    source_map: sourceMap,
    groups
  }
}

function diagramRefTargetInNodeScope(
  ref: DiagramRef,
  scope: {
    subtreeIds: Set<string>
    internalEdgeIds: Set<string>
    groupIds: Set<string>
    sourcePatterns: Set<string>
  }
): boolean {
  switch (ref.target.type) {
    case 'node':
      return scope.subtreeIds.has(ref.target.id)
    case 'edge':
      return scope.internalEdgeIds.has(ref.target.id)
    case 'group':
      return scope.groupIds.has(ref.target.id)
    case 'source':
      return scope.sourcePatterns.has(ref.target.pattern)
    default:
      return false
  }
}

function getScopedDiagramContext(model: C4ModelData, nodeId: string): ExistingToolDiagramContext {
  const subtreeIds = collectDescendantIds(model, nodeId)
  const internalEdgeIds = new Set(
    model.edges
      .filter((edge) => subtreeIds.has(edge.source) && subtreeIds.has(edge.target))
      .map((edge) => edge.id)
  )
  const groupIds = new Set(
    (model.groups ?? [])
      .filter((group) => group.memberIds.every((memberId) => subtreeIds.has(memberId)))
      .map((group) => group.id)
  )
  const sourcePatterns = new Set(
    Object.entries(model.sourceMap ?? {})
      .filter(([id]) => subtreeIds.has(id))
      .flatMap(([, locations]) => locations.map((location) => location.pattern))
  )
  const refs = (model.diagramRefs ?? []).filter((ref) =>
    diagramRefTargetInNodeScope(ref, {
      subtreeIds,
      internalEdgeIds,
      groupIds,
      sourcePatterns
    })
  )
  return buildExistingToolDiagramContext(model, refs)
}

function sortForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCompare)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortForCompare(item)])
  )
}

function stringifyComparable(value: unknown): string {
  return JSON.stringify(sortForCompare(value))
}

function computeDiff(baseline: C4ModelData, current: C4ModelData): string {
  const lines: string[] = []
  const baselineNodes = new Map(baseline.nodes.map((node) => [node.id, stripNodeForAgent(node)]))
  const currentNodes = new Map(current.nodes.map((node) => [node.id, stripNodeForAgent(node)]))
  const addedNodes = [...currentNodes.entries()].filter(([id]) => !baselineNodes.has(id))
  const removedNodes = [...baselineNodes.entries()].filter(([id]) => !currentNodes.has(id))
  const modifiedNodes = [...currentNodes.entries()].filter(
    ([id, node]) =>
      baselineNodes.has(id) &&
      stringifyComparable(baselineNodes.get(id)) !== stringifyComparable(node)
  )

  if (addedNodes.length > 0) {
    lines.push('Nodes added:', ...addedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`))
  }
  if (removedNodes.length > 0) {
    lines.push(
      'Nodes removed:',
      ...removedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`)
    )
  }
  if (modifiedNodes.length > 0) {
    lines.push(
      'Nodes modified:',
      ...modifiedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`)
    )
  }

  const baselineEdges = new Map(baseline.edges.map((edge) => [edge.id, edge]))
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]))
  const addedEdges = [...currentEdges.keys()].filter((id) => !baselineEdges.has(id))
  const removedEdges = [...baselineEdges.keys()].filter((id) => !currentEdges.has(id))
  const modifiedEdges = [...currentEdges.entries()].filter(
    ([id, edge]) =>
      baselineEdges.has(id) &&
      stringifyComparable(baselineEdges.get(id)) !== stringifyComparable(edge)
  )
  if (addedEdges.length > 0) {
    lines.push('Edges added:', ...addedEdges.map((id) => `- ${id}`))
  }
  if (removedEdges.length > 0) {
    lines.push('Edges removed:', ...removedEdges.map((id) => `- ${id}`))
  }
  if (modifiedEdges.length > 0) {
    lines.push('Edges modified:', ...modifiedEdges.map(([id]) => `- ${id}`))
  }

  if (
    stringifyComparable(baseline.sourceMap ?? {}) !== stringifyComparable(current.sourceMap ?? {})
  ) {
    lines.push('Source map modified')
  }
  if (stringifyComparable(baseline.flows ?? []) !== stringifyComparable(current.flows ?? [])) {
    lines.push('Flows modified')
  }
  if (stringifyComparable(baseline.groups ?? []) !== stringifyComparable(current.groups ?? [])) {
    lines.push('Groups modified')
  }
  return lines.length > 0 ? lines.join('\n') : 'No model changes since baseline.'
}

function changedFields<T extends Record<string, unknown>>(before: T, after: T): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((key) => stringifyComparable(before[key]) !== stringifyComparable(after[key]))
    .sort()
}

function computeDiagramChanges(
  baseline: C4ModelData,
  current: C4ModelData
): DiagramChangeSummary[] {
  const baselineById = new Map((baseline.diagrams ?? []).map((diagram) => [diagram.id, diagram]))
  const currentById = new Map((current.diagrams ?? []).map((diagram) => [diagram.id, diagram]))
  const changes: DiagramChangeSummary[] = []
  for (const [id, diagram] of currentById) {
    const before = baselineById.get(id)
    if (!before) {
      changes.push({ id, name: diagram.name, change: 'added' })
      continue
    }
    if (stringifyComparable(before) !== stringifyComparable(diagram)) {
      changes.push({
        id,
        name: diagram.name,
        change: 'modified',
        changedFields: changedFields(
          before as unknown as Record<string, unknown>,
          diagram as unknown as Record<string, unknown>
        )
      })
    }
  }
  for (const [id, diagram] of baselineById) {
    if (!currentById.has(id)) {
      changes.push({ id, name: diagram.name, change: 'removed' })
    }
  }
  return changes
}

function computeDiagramRefChanges(
  baseline: C4ModelData,
  current: C4ModelData
): DiagramChangeSummary[] {
  const baselineById = new Map((baseline.diagramRefs ?? []).map((ref) => [ref.id, ref]))
  const currentById = new Map((current.diagramRefs ?? []).map((ref) => [ref.id, ref]))
  const changes: DiagramChangeSummary[] = []
  for (const [id, ref] of currentById) {
    const before = baselineById.get(id)
    if (!before) {
      changes.push({ id, name: ref.diagramId, change: 'added' })
      continue
    }
    if (stringifyComparable(before) !== stringifyComparable(ref)) {
      changes.push({
        id,
        name: ref.diagramId,
        change: 'modified',
        changedFields: changedFields(
          before as unknown as Record<string, unknown>,
          ref as unknown as Record<string, unknown>
        )
      })
    }
  }
  for (const [id, ref] of baselineById) {
    if (!currentById.has(id)) {
      changes.push({ id, name: ref.diagramId, change: 'removed' })
    }
  }
  return changes
}

function diagramTargetExists(model: C4ModelData, target: DiagramRefTarget): boolean {
  switch (target.type) {
    case 'node':
      return model.nodes.some((node) => node.id === target.id)
    case 'edge':
      return model.edges.some((edge) => edge.id === target.id)
    case 'group':
      return (model.groups ?? []).some((group) => group.id === target.id)
    case 'flow':
      return (model.flows ?? []).some((flow) => flow.id === target.id)
    case 'flowStep': {
      const flow = (model.flows ?? []).find((candidate) => candidate.id === target.flowId)
      return flow ? Boolean(findFlowStep(flow, target.stepId)) : false
    }
    case 'source':
      return validateWorkspaceRelativeSourcePattern(target.pattern, 'parser').ok
  }
}

function validateDiagramRefs(model: C4ModelData): DiagramValidationSummary {
  const diagramIds = new Set((model.diagrams ?? []).map((diagram) => diagram.id))
  const danglingRefIds: string[] = []
  const warnings: ModelValidationWarning[] = []
  for (const ref of model.diagramRefs ?? []) {
    if (!diagramIds.has(ref.diagramId) || !diagramTargetExists(model, ref.target)) {
      danglingRefIds.push(ref.id)
      warnings.push({
        kind: 'diagram-validation',
        path: `diagramRefs.${ref.id}`,
        reference: ref.diagramId,
        message: `Diagram ref '${ref.id}' points to a missing diagram or target.`,
        code: diagramIds.has(ref.diagramId) ? 'parser.missing-target' : 'parser.missing-diagram',
        diagramRefId: ref.id,
        diagramId: ref.diagramId,
        target: ref.target
      })
    }
  }
  return {
    warnings,
    danglingRefIds,
    invalidDiagramIds: []
  }
}

export async function callScryerTool(
  projectPath: string,
  call: ScryerToolCall
): Promise<ScryerToolResult> {
  const { modelName, toolArgs } = stripModelArg(call.arguments)
  switch (call.toolName) {
    case 'set_diagrams': {
      const model = await readModel(projectPath, modelName)
      return handleSetDiagrams(toolArgs as SetDiagramsArgs, {
        projectPath,
        modelName,
        model: model as C4ModelDataV2,
        writeModel
      })
    }
    case 'get_diagram': {
      const model = await readModel(projectPath, modelName)
      return handleGetDiagram(toolArgs as GetDiagramArgs, {
        projectPath,
        modelName,
        model: model as C4ModelDataV2
      })
    }
    case 'update_diagram_refs': {
      const model = await readModel(projectPath, modelName)
      return handleUpdateDiagramRefs(toolArgs as UpdateDiagramRefsArgs, {
        projectPath,
        modelName,
        model: model as C4ModelDataV2,
        writeModel
      })
    }
    case 'delete_diagram': {
      const model = await readModel(projectPath, modelName)
      return handleDeleteDiagram(toolArgs as DeleteDiagramArgs, {
        projectPath,
        modelName,
        model: model as C4ModelDataV2,
        writeModel,
        clearDiagramCache: clearDiagramCacheForMcp
      })
    }
    case 'list_models': {
      await readModel(projectPath)
      return ok(`* ${getProjectModelPath(projectPath)} (project)`)
    }
    case 'set_model':
      return setModel(projectPath, call.arguments)
    case 'get_model': {
      const model = stripPositions(await readModel(projectPath))
      await writeBaseline(projectPath, model)
      const data = withCompactDiagramContext(model)
      return ok(JSON.stringify(data, null, 2), data)
    }
    case 'get_node': {
      const model = await readModel(projectPath)
      const nodeId = String(call.arguments.node_id ?? call.arguments.nodeId ?? '')
      const scoped = getScopedNode(model, nodeId)
      if (!scoped) {
        return fail(`Node '${nodeId}' not found`)
      }
      await writeBaseline(projectPath, model)
      const data = {
        ...(scoped as Record<string, unknown>),
        diagramContext: getScopedDiagramContext(model, nodeId)
      }
      return ok(JSON.stringify(data, null, 2), data)
    }
    case 'add_nodes':
      return addNodes(projectPath, call.arguments)
    case 'set_node':
      return setNode(projectPath, call.arguments)
    case 'update_nodes':
      return updateNodes(projectPath, call.arguments)
    case 'delete_nodes': {
      const ids = new Set(
        (Array.isArray(call.arguments.node_ids) ? call.arguments.node_ids : []).map(String)
      )
      const model = await readModel(projectPath)
      const toDelete = new Set<string>()
      for (const id of ids) {
        for (const descendant of collectDescendantIds(model, id)) {
          toDelete.add(descendant)
        }
      }
      const before = model.nodes.length
      model.nodes = model.nodes.filter((node) => !toDelete.has(node.id))
      model.edges = model.edges.filter(
        (edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)
      )
      cleanupReferences(model, toDelete)
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted ${before - model.nodes.length} node(s)`, model)
    }
    case 'add_edges':
      return addEdges(projectPath, call.arguments)
    case 'update_edges':
      return updateEdges(projectPath, call.arguments)
    case 'delete_edges': {
      const ids = new Set(
        (Array.isArray(call.arguments.edge_ids) ? call.arguments.edge_ids : []).map(String)
      )
      const model = await readModel(projectPath)
      const missing = [...ids].filter((id) => !model.edges.some((edge) => edge.id === id))
      if (missing.length > 0) {
        return fail(`Edge '${missing[0]}' not found`)
      }
      model.edges = model.edges.filter((edge) => !ids.has(edge.id))
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted ${ids.size} edge(s)`, model)
    }
    case 'update_source_map': {
      const model = await readModel(projectPath)
      const sourceMap = { ...model.sourceMap }
      if (Array.isArray(call.arguments.entries)) {
        for (const entry of call.arguments.entries) {
          if (!isRecord(entry) || typeof entry.node_id !== 'string') {
            return fail('Each update_source_map entry requires node_id')
          }
          const exists =
            model.nodes.some((node) => node.id === entry.node_id) ||
            (model.flows ?? []).some((flow) => flow.id === entry.node_id)
          if (!exists) {
            return fail(`Node or flow '${entry.node_id}' not found`)
          }
          const { locations, error } = normalizeSourceLocationsStrict(
            entry.locations,
            `source map entry '${entry.node_id}'`
          )
          if (error) {
            return fail(error)
          }
          const nextLocations = locations ?? []
          if (nextLocations.length === 0) {
            delete sourceMap[entry.node_id]
          } else {
            sourceMap[entry.node_id] = nextLocations
          }
        }
      } else {
        return fail('update_source_map requires entries')
      }
      model.sourceMap = sourceMap
      await writeModelAndBaseline(projectPath, model)
      return ok('Updated source map', model)
    }
    case 'set_flows': {
      if (typeof call.arguments.data !== 'string') {
        return fail('set_flows requires data')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(call.arguments.data) as unknown
      } catch (error) {
        return fail(`Invalid flow JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (isRecord(parsed) && Array.isArray(parsed.flows)) {
        return fail(
          'set_flows data must be a single flow object or an array, not an object with a flows property'
        )
      }
      const rawFlows = Array.isArray(parsed) ? parsed : [parsed]
      if (rawFlows.length === 0) {
        return fail('Empty flow array')
      }
      const flowErrors = rawFlows.flatMap((flow, index) => validateFlowRuntimeShape(flow, index))
      if (flowErrors.length > 0) {
        return fail(flowErrors.join('\n'))
      }
      const flows = rawFlows.map((flow) => normalizeFlowForStorage(flow as Flow))
      const model = await readModel(projectPath)
      const next = [...(model.flows ?? [])]
      for (const flow of flows) {
        const index = next.findIndex((candidate) => candidate.id === flow.id)
        if (index === -1) {
          next.push(flow)
        } else {
          next[index] = flow
        }
      }
      model.flows = next
      await writeModelAndBaseline(projectPath, model)
      return ok(`Set ${flows.length} flow(s)`, model)
    }
    case 'delete_flow': {
      const flowId = String(call.arguments.flow_id ?? '')
      const model = await readModel(projectPath)
      const before = (model.flows ?? []).length
      model.flows = (model.flows ?? []).filter((flow) => flow.id !== flowId)
      if (model.flows.length === before) {
        return fail(`Flow '${flowId}' not found`)
      }
      delete model.sourceMap?.[flowId]
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted flow '${flowId}'`, model)
    }
    case 'set_groups': {
      if (typeof call.arguments.data !== 'string') {
        return fail('set_groups requires data')
      }
      let parsed: Group | Group[]
      try {
        parsed = JSON.parse(call.arguments.data) as Group | Group[]
      } catch (error) {
        return fail(`Invalid group JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      const groups = Array.isArray(parsed) ? parsed : [parsed]
      const model = await readModel(projectPath)
      const nodeIds = new Set(model.nodes.map((node) => node.id))
      for (const group of groups) {
        for (const memberId of group.memberIds) {
          if (!nodeIds.has(memberId)) {
            return fail(`Member '${memberId}' in group '${group.name}' not found in model`)
          }
        }
      }
      const next = [...(model.groups ?? [])]
      for (const group of groups) {
        const memberIds = new Set(group.memberIds)
        for (const existing of next) {
          if (existing.id !== group.id) {
            existing.memberIds = existing.memberIds.filter((id) => !memberIds.has(id))
          }
        }
        const index = next.findIndex((candidate) => candidate.id === group.id)
        if (index === -1) {
          next.push(group)
        } else {
          next[index] = group
        }
      }
      model.groups = next.filter((group) => group.memberIds.length > 0)
      await writeModelAndBaseline(projectPath, model)
      return ok(`Set ${groups.length} group(s)`, model)
    }
    case 'delete_group': {
      const groupId = String(call.arguments.group_id ?? '')
      const model = await readModel(projectPath)
      const before = (model.groups ?? []).length
      model.groups = (model.groups ?? []).filter((group) => group.id !== groupId)
      if (model.groups.length === before) {
        return fail(`Group '${groupId}' not found`)
      }
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted group '${groupId}'`, model)
    }
    case 'set_implementing': {
      await setImplementing(projectPath, call.arguments.active === true)
      return ok(
        call.arguments.active === true ? 'Drift detection suppressed' : 'Drift detection resumed'
      )
    }
    case 'get_rules':
      return ok(SCRYER_RULES)
    case 'validate_model': {
      const model = await readModel(projectPath)
      const errors = [...validateModelShape(model), ...validateMentionEdges(model)]
      const diagramValidation = validateDiagramRefs(model)
      const allErrors = [...errors, ...diagramValidation.warnings.map((warning) => warning.message)]
      const data = { diagramValidation }
      return allErrors.length === 0 ? ok('Model is valid', data) : fail(allErrors.join('\n'), data)
    }
    case 'get_task':
      return getTask(projectPath, call.arguments)
    case 'get_changes': {
      const baseline = await readBaseline(projectPath)
      if (!baseline) {
        return fail('No baseline found. Call get_model first to establish a reference point.')
      }
      const model = await readModel(projectPath)
      return ok(computeDiff(baseline, model), {
        baseline: withCompactDiagramContext(baseline),
        current: withCompactDiagramContext(model),
        diagrams: computeDiagramChanges(baseline, model),
        diagramRefs: computeDiagramRefChanges(baseline, model)
      })
    }
    case 'get_structure': {
      const path = String(call.arguments.path ?? projectPath)
      const tree = await projectStructure(path)
      return ok(tree, { tree })
    }
  }
}
