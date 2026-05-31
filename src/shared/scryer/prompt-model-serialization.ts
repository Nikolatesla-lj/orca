import type {
  C4ModelData,
  Diagram,
  DiagramKind,
  DiagramNotation,
  DiagramRefTarget
} from './model-types'
import { computeDiagramSourceHash } from './diagram-cache'
import { validateWorkspaceRelativeSourcePattern } from './source-targets'

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

type PromptDiagramWithSource = Omit<Diagram, 'updatedAt'> & {
  sourceOmitted: false
  sourceHash: `sha256:${string}`
  relatedTargets: DiagramRefTarget[]
}

type PromptDiagram = PromptDiagramSummary | PromptDiagramWithSource

function stripCompact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCompact).filter((item) => item !== undefined)
  }
  if (typeof value !== 'object' || value === null) {
    return value === '' ? undefined : value
  }

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      key === 'position' ||
      (key === 'type' &&
        (item === 'c4' || item === 'operation' || item === 'process' || item === 'model')) ||
      key === 'refPositions' ||
      key === 'notes'
    ) {
      continue
    }
    const next = stripCompact(item)
    if (
      next === undefined ||
      next === null ||
      (Array.isArray(next) && next.length === 0) ||
      (typeof next === 'object' && !Array.isArray(next) && Object.keys(next).length === 0)
    ) {
      continue
    }
    output[key] = next
  }
  return output
}

function sourceTargetPattern(value: DiagramRefTarget): string | null {
  if (value.type !== 'source') {
    return null
  }
  const validation = validateWorkspaceRelativeSourcePattern(value.pattern, 'parser')
  return validation.ok ? validation.normalizedPattern : null
}

export function diagramRefTargetMatchesPromptScope(
  refTarget: DiagramRefTarget,
  scopedTarget: DiagramRefTarget
): boolean {
  if (refTarget.type !== scopedTarget.type) {
    return false
  }
  switch (refTarget.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return refTarget.id === (scopedTarget as typeof refTarget).id
    case 'flowStep':
      return (
        refTarget.flowId === (scopedTarget as typeof refTarget).flowId &&
        refTarget.stepId === (scopedTarget as typeof refTarget).stepId
      )
    case 'source':
      return (
        sourceTargetPattern(refTarget) !== null &&
        sourceTargetPattern(refTarget) === sourceTargetPattern(scopedTarget)
      )
  }
}

function relatedTargetsForDiagram(model: C4ModelData, diagramId: string): DiagramRefTarget[] {
  return (model.diagramRefs ?? [])
    .filter((ref) => ref.diagramId === diagramId)
    .map((ref) => ref.target)
}

function shouldIncludeDiagramSource(
  model: C4ModelData,
  diagramId: string,
  options: SerializeModelForPromptOptions
): boolean {
  const explicitIds = new Set([
    ...(options.includeDiagramSourcesForDiagramIds ?? []),
    ...(options.driftedDiagramIds ?? [])
  ])
  if (explicitIds.has(diagramId)) {
    return true
  }
  const scopedTargets = options.includeDiagramSourcesForTargets ?? []
  if (scopedTargets.length === 0) {
    return false
  }
  return (model.diagramRefs ?? []).some(
    (ref) =>
      ref.diagramId === diagramId &&
      scopedTargets.some((target) => diagramRefTargetMatchesPromptScope(ref.target, target))
  )
}

function compactDiagramForPrompt(
  model: C4ModelData,
  diagram: Diagram,
  options: SerializeModelForPromptOptions
): PromptDiagram {
  const { source, updatedAt: _updatedAt, ...rest } = diagram
  const common = {
    ...rest,
    sourceHash: computeDiagramSourceHash(source),
    relatedTargets: relatedTargetsForDiagram(model, diagram.id)
  }
  if (shouldIncludeDiagramSource(model, diagram.id, options)) {
    return { ...common, source, sourceOmitted: false }
  }
  return { ...common, sourceOmitted: true }
}

export function serializeModelForPrompt(
  model: C4ModelData,
  options: SerializeModelForPromptOptions = {}
): string {
  const promptModel: Omit<C4ModelData, 'diagrams'> & { diagrams?: PromptDiagram[] } = {
    ...model,
    diagrams: (model.diagrams ?? []).map((diagram) =>
      compactDiagramForPrompt(model, diagram, options)
    )
  }
  return JSON.stringify(stripCompact(promptModel))
}
