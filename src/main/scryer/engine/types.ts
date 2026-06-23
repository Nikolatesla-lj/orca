import type { ScryModel } from './model'
import type { PendingChange } from './diff'

export type ScryerOperationId =
  | 'scryer.model.read'
  | 'scryer.model.validate'
  | 'scryer.node.update'
  | 'scryer.link.add'
  | 'scryer.link.delete'
  | 'scryer.plan.pending'
  | 'scryer.plan.fold'

export type ScryerLayer = 'plan' | 'committed'

export type ScryerOperationContext = {
  requestId: string
  transport: 'cli' | 'ipc' | 'ui' | 'agent' | 'test' | 'system'
  caller: 'human' | 'agent' | 'system' | 'test'
  cwd: string
  projectRoot?: string
  workspaceRoot?: string
  sessionId?: string
  agentRunId?: string
  leaseToken?: string
  output?: {
    json?: boolean
    verbose?: boolean
  }
}

export type ScryerOperationErrorCode =
  | 'incompatible_model'
  | 'invalid_context'
  | 'lock_busy'
  | 'lease_required'
  | 'invalid_input'
  | 'not_found'
  | 'illegal_link'
  | 'operation_not_found'
  | 'validation_failed'
  | 'io_error'
  | 'internal_error'

export type ScryerOperationError = {
  code: ScryerOperationErrorCode
  message: string
  details?: Record<string, unknown>
  fieldErrors?: { path: string; message: string }[]
  retryable: boolean
}

export type ScryerOperationMeta = {
  projectRoot?: string
  warnings?: ValidationWarning[]
  completionGate?: {
    complete: boolean
    pendingCount: number
    validationWarningCount: number
  }
}

export type ScryerOperationResult<T = unknown> =
  | {
      ok: true
      operationId: ScryerOperationId
      requestId: string
      result: T
      meta?: ScryerOperationMeta
    }
  | {
      ok: false
      operationId: ScryerOperationId
      requestId: string
      error: ScryerOperationError
      meta?: ScryerOperationMeta
    }

export type ValidationWarning = {
  code: string
  message: string
  path?: string
}

export type ScryerProjectRef = {
  projectRoot: string
}

export type ScryerViewOptions = {
  layer?: ScryerLayer
}

export type ScryerModelReadInput = {
  project?: string
  node?: string
  layer?: ScryerLayer
}

export type ScryerModelReadResult = {
  layer: ScryerLayer
  model?: ScryModel
  overview?: unknown
  subtree?: unknown
  referencesForChildren?: unknown
  sourceMap?: ScryModel['sourceMap']
  boundaries?: ScryModel['boundaries']
  truncated?: boolean
}

export type ScryerModelValidateInput = {
  project?: string
  layer?: ScryerLayer
}

export type ScryerModelValidateResult = {
  layer: ScryerLayer
  warnings: ValidationWarning[]
}

export type UpdateNodeItem = {
  node_id: string
  kind?: string
  name?: string
  description?: string
  technology?: string
  external?: boolean
  responsibilities?: ScryModel['nodes'][number]['responsibilities']
  properties?: ScryModel['nodes'][number]['properties']
  visual?: boolean
  parent_id?: string | null
}

export type ScryerNodeUpdateInput = {
  project?: string
  nodes: UpdateNodeItem[]
}

export type PendingSummary = {
  total: number
  toImplement: number
  toReimplement: number
  toMove: number
  toDelete: number
  toRepoint: number
}

export type ScryerNodeUpdateResult = {
  updated: number
  warnings: ValidationWarning[]
  pendingSummary: PendingSummary
}

export type AddLinkItem = {
  src: string
  dst: string
  label: string
  method?: string
}

export type ScryerLinkAddInput = {
  project?: string
  links: AddLinkItem[]
}

export type ScryerLinkAddResult = {
  added: string[]
  warnings: ValidationWarning[]
  pendingSummary: PendingSummary
}

export type ScryerLinkDeleteInput = {
  project?: string
  link_ids: string[]
}

export type ScryerLinkDeleteResult = {
  deleted: number
  missing: string[]
  pendingSummary: PendingSummary
}

export type ScryerPlanPendingInput = {
  project?: string
}

export type ScryerPlanPendingResult = {
  changes: PendingChange[]
  summary: PendingSummary
}

export type FoldedItem = {
  kind: 'node' | 'link' | 'responsibility' | 'property'
  id: string
  ownerId?: string
}

export type ScryerPlanFoldInput = {
  project?: string
  node_id: string
  responsibility_ids?: string[]
  property_labels?: string[]
  link_ids?: string[]
  all?: boolean
}

export type ScryerPlanFoldResult = {
  folded: FoldedItem[]
  remaining: PendingChange[]
  warnings: ValidationWarning[]
}
