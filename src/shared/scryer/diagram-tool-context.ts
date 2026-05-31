import type {
  DiagramKind,
  DiagramNotation,
  DiagramRefRole,
  DiagramRefTarget,
  DiagramSourceRange,
  ModelValidationWarning
} from './model-types'

export type CompactDiagramSummary = {
  id: string
  name: string
  kind: DiagramKind
  notation: DiagramNotation
  description?: string
  tags?: string[]
  updatedAt?: string
  sourceHash: `sha256:${string}`
  sourceOmitted: true
  refCount: number
  relatedTargets: DiagramRefTarget[]
}

export type CompactDiagramRefSummary = {
  id: string
  diagramId: string
  target: DiagramRefTarget
  role: DiagramRefRole
  elementKey?: string
  sourceRange?: DiagramSourceRange
  note?: string
}

export type ExistingToolDiagramContext = {
  diagramSummaries: CompactDiagramSummary[]
  diagramRefs: CompactDiagramRefSummary[]
}

export type DiagramChangeSummary = {
  id: string
  name?: string
  change: 'added' | 'removed' | 'modified'
  changedFields?: string[]
}

export type DiagramValidationSummary = {
  warnings: ModelValidationWarning[]
  danglingRefIds: string[]
  invalidDiagramIds: string[]
}
