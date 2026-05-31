export type C4Kind =
  | 'person'
  | 'system'
  | 'container'
  | 'component'
  | 'operation'
  | 'process'
  | 'model'

export type C4Shape =
  | 'rectangle'
  | 'person'
  | 'cylinder'
  | 'pipe'
  | 'trapezoid'
  | 'bucket'
  | 'hexagon'

export type Status = 'proposed' | 'implemented' | 'verified' | 'vagrant'

export type ContractImage = {
  filename: string
  mimeType: string
  data: string
}

export type ContractItem =
  | string
  | { text: string; passed?: boolean; url?: string; image?: ContractImage }

export type Contract = {
  expect: ContractItem[]
  ask: ContractItem[]
  never: ContractItem[]
}

export type SourceLocation = {
  pattern: string
  line?: number
  endLine?: number
  command?: string
}

export const SCRY_SCHEMA_VERSION = 2

export type DiagramNotation = 'mermaid'

export type DiagramKind =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'architecture'
  | 'gitGraph'
  | 'c4'
  | 'gantt'
  | 'journey'
  | 'mindmap'
  | 'timeline'
  | 'requirement'
  | 'quadrant'
  | 'xy'
  | 'block'
  | 'packet'
  | 'kanban'
  | 'other'

export type DiagramSourceRange = {
  startLine: number
  startColumn?: number
  endLine?: number
  endColumn?: number
}

export type Diagram = {
  id: string
  name: string
  kind: DiagramKind
  notation: DiagramNotation
  source: string
  description?: string
  tags?: string[]
  updatedAt?: string
}

export type DiagramRefTarget =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'group'; id: string }
  | { type: 'flow'; id: string }
  | { type: 'flowStep'; flowId: string; stepId: string }
  | { type: 'source'; pattern: string; line?: number; endLine?: number }

export type DiagramRefRole =
  | 'architecture-detail'
  | 'behavior-detail'
  | 'sequence-detail'
  | 'state-detail'
  | 'data-detail'
  | 'class-detail'
  | 'deployment-detail'
  | 'evidence'
  | 'other'

export type DiagramRef = {
  id: string
  diagramId: string
  target: DiagramRefTarget
  role: DiagramRefRole
  elementKey?: string
  sourceRange?: DiagramSourceRange
  note?: string
}

export type DiagramErrorCode =
  | `parser.${string}`
  | `renderer.${string}`
  | `controller.${string}`
  | `cache.${string}`
  | `mcp.${string}`
  | `bridge.${string}`
  | `standalone.${string}`

export type DiagramDiagnostic = {
  severity: 'error' | 'warning'
  code: DiagramErrorCode
  message: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}

export type DiagramRenderedElement = {
  elementKey: string
  label?: string
  kind?: string
  sourceRange?: DiagramSourceRange
  svgSelector?: string
}

export type DiagramRenderResult =
  | {
      ok: true
      svg: string
      elements: DiagramRenderedElement[]
      diagnostics: DiagramDiagnostic[]
      sourceHash: `sha256:${string}`
      rendererVersion: string
    }
  | {
      ok: false
      diagnostics: DiagramDiagnostic[]
      sourceHash: `sha256:${string}`
      rendererVersion: string
    }

export type ModelValidationWarning = {
  kind: 'missing-mention' | 'diagram-validation'
  path: string
  reference?: string
  message: string
  code?: DiagramErrorCode
  diagramId?: string
  diagramRefId?: string
  target?: DiagramRefTarget
  details?: Record<string, unknown>
}

export type ModelProperty = {
  label: string
  description: string
}

export type C4NodeData = {
  name: string
  description: string
  kind: C4Kind
  technology?: string
  external?: boolean
  expanded?: boolean
  shape?: C4Shape
  sources?: { pattern: string; comment: string }[]
  status?: Status
  statusReason?: string
  contract?: Contract
  notes?: string[]
  properties?: ModelProperty[]
  _reference?: boolean
  _relationships?: { direction: 'in' | 'out'; label: string; method?: string }[]
  _operations?: { id: string; name: string }[]
  _needsLayout?: boolean
  [key: string]: unknown
}

export type C4Node = {
  id: string
  type?: 'c4' | 'operation' | 'process' | 'model'
  position?: { x: number; y: number }
  data: C4NodeData
  parentId?: string
  selected?: boolean
  measured?: unknown
}

export type C4EdgeData = {
  label: string
  method?: string
  _route?: { x: number; y: number }[]
  _bundleAngle?: number
  [key: string]: unknown
}

export type C4Edge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  data?: C4EdgeData
  selected?: boolean
}

export type Group = {
  id: string
  name: string
  description?: string
  memberIds: string[]
  parentGroupId?: string
  contract?: Contract
}

export type FlowBranch = {
  condition: string
  steps: FlowStep[]
}

export type FlowStep = {
  id: string
  label?: string
  description?: string
  branches?: FlowBranch[]
}

export type FlowTransition = {
  source: string
  target: string
  label?: string
}

export type Flow = {
  id: string
  name: string
  description?: string
  steps: FlowStep[]
  transitions?: FlowTransition[]
}

export type StartingLevel = 'system' | 'container' | 'component'

export type C4ModelData = {
  nodes: C4Node[]
  edges: C4Edge[]
  startingLevel?: StartingLevel
  sourceMap?: Record<string, SourceLocation[]>
  projectPath?: string
  refPositions?: Record<string, { x: number; y: number }>
  groups?: Group[]
  flows?: Flow[]
  validationWarnings?: ModelValidationWarning[]
  schemaVersion?: typeof SCRY_SCHEMA_VERSION
  diagrams?: Diagram[]
  diagramRefs?: DiagramRef[]
  [key: string]: unknown
}

export type C4ModelDataV2 = C4ModelData & {
  schemaVersion: typeof SCRY_SCHEMA_VERSION
  diagrams: Diagram[]
  diagramRefs: DiagramRef[]
}

export type DriftedNode = {
  nodeId: string
  nodeName: string
  patterns: string[]
}

export type DriftReport = {
  nodes: DriftedNode[]
  structureChanged: boolean
}

export type DriftedDiagramRef = {
  refId: string
  diagramId: string
  diagramName: string
  target: DiagramRefTarget
  patterns: string[]
  sourceHash: `sha256:${string}`
  sourceOmitted: true
}

export type DriftReportV2 = DriftReport & {
  diagramRefs: DriftedDiagramRef[]
}

export type { ScryerToolCall, ScryerToolName, ScryerToolResult } from './tool-types'
