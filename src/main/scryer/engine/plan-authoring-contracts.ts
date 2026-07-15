import type { ScryModel } from './model'
import type { ScryerRecommendedRead } from './model-read-contracts'
import type { ScryerValidationFinding } from './operation-results'
import type { PendingSummary } from './pending-contracts'

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
  appearance?: ScryModel['nodes'][number]['appearance']
  notes?: string
  parent_id?: string | null
}

export type ScryerNodeUpdateInput = {
  project?: string
  nodes: UpdateNodeItem[]
}

export type ScryerNodeUpdateResult = {
  updatedCount: number
  findings?: ScryerValidationFinding[]
  pendingSummary?: PendingSummary
}

export type ScryerNodeDeleteInput = {
  project?: string
  node_ids: string[]
}

export type ScryerNodeDeleteResult = {
  deletedCount: number
  deletedLinkCount: number
  findings?: ScryerValidationFinding[]
  pendingSummary?: PendingSummary
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
  addedIds: string[]
  findings?: ScryerValidationFinding[]
  pendingSummary?: PendingSummary
}

export type UpdateLinkItem = {
  link_id: string
  label?: string
  method?: string
}

export type ScryerLinkUpdateInput = {
  project?: string
  links: UpdateLinkItem[]
}

export type ScryerLinkUpdateResult = {
  updatedCount: number
  findings?: ScryerValidationFinding[]
  pendingSummary?: PendingSummary
}

export type ScryerLinkDeleteInput = {
  project?: string
  link_ids: string[]
}

export type ScryerLinkDeleteResult = {
  deletedCount: number
  missingIds?: string[]
  pendingSummary?: PendingSummary
}

export type ScryerStructuralGroupCleanupSummary = {
  removedGroupCount: number
  updatedGroupCount: number
  removedMembershipCount: number
}

export type ScryerNodeSetSubtreeInput = {
  project?: string
  node_id: string
  data: {
    nodes: ScryModel['nodes']
    links?: ScryModel['links']
  }
}

export type ScryerNodeSetSubtreeResult = {
  rootId: string
  addedNodeCount: number
  removedNodeCount: number
  addedLinkCount: number
  removedLinkCount: number
  groupCleanup: ScryerStructuralGroupCleanupSummary
  findings: ScryerValidationFinding[]
  pendingSummary: PendingSummary
  recommendedNextReads: ScryerRecommendedRead[]
}

export type ScryerNodeMoveInput = {
  project?: string
  moves: { node_id: string; new_parent_id?: string | null }[]
}

export type ScryerNodeMoveResult = {
  moved: { nodeId: string; fromParentId?: string; toParentId?: string }[]
  groupCleanup: ScryerStructuralGroupCleanupSummary
  findings: ScryerValidationFinding[]
  pendingSummary: PendingSummary
  recommendedNextReads: ScryerRecommendedRead[]
}

export type ScryerResponsibilityMoveInput = {
  project?: string
  moves: { responsibility_id: string; from_node_id: string; to_node_id: string }[]
}

export type ScryerResponsibilityMoveResult = {
  moved: { responsibilityId: string; fromNodeId: string; toNodeId: string }[]
  findings: ScryerValidationFinding[]
  pendingSummary: PendingSummary
  recommendedNextReads: ScryerRecommendedRead[]
}

export type ScryerNodeDescopeInput = {
  project?: string
  node_ids: string[]
}

export type ScryerNodeDescopeResult = {
  descopedCount: number
  relocatedResponsibilityCount: number
  droppedResponsibilityCount: number
  removedLinkCount: number
  groupCleanup: ScryerStructuralGroupCleanupSummary
  modelCorrection: true
  codeAction: 'code_unchanged'
  pendingReason: 'model_correction_code_unchanged'
  findings: ScryerValidationFinding[]
  pendingSummary: PendingSummary
  recommendedNextReads: ScryerRecommendedRead[]
}
