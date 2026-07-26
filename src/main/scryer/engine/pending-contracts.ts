import type { ScryerValidationFinding } from './operation-results'

export type PendingChangeType =
  | 'added'
  | 'deleted'
  | 'moved'
  | 'repointed'
  | 'reworded'
  | 'membersChanged'

export type PendingChange = {
  kind: 'node' | 'link' | 'responsibility' | 'property' | 'group'
  id: string
  ownerId?: string
  label: string
  changes: (
    | { type: 'added' | 'deleted' | 'membersChanged' }
    | { type: 'moved'; from?: string; to?: string }
    | { type: 'repointed'; srcFrom: string; srcTo: string; dstFrom: string; dstTo: string }
    | { type: 'reworded'; field: string; from: string; to: string }
  )[]
}

export type PendingSummary = {
  total: number
  byKind: Partial<Record<PendingChange['kind'], number>>
  byChange: Partial<Record<PendingChange['changes'][number]['type'], number>>
  toImplement: number
  toReimplement: number
  toMove: number
  toDelete: number
  toRepoint: number
}

export type ScryerPlanPendingInput = {
  project?: string
}

export type ScryerPlanPendingResult = {
  clean: boolean
  changes: PendingChange[]
  summary: PendingSummary
}

export type ScryerFoldTarget =
  | { kind: 'node'; node_id: string; includeDescendants?: boolean }
  | { kind: 'responsibility'; responsibility_id: string }
  | { kind: 'property'; node_id: string; label: string }
  | { kind: 'link'; link_id: string }
  | { kind: 'group'; group_id: string }

export type ScryerFoldedItem = {
  kind: 'node' | 'link' | 'responsibility' | 'property' | 'group'
  id: string
  ownerId?: string
  change?: string
}

export type ScryerPlanFoldInput = {
  project?: string
  mode?: 'manual' | 'agent_completion'
  node_id?: string
  responsibility_ids?: string[]
  property_labels?: string[]
  properties?: { node_id: string; label: string }[]
  link_ids?: string[]
  group_ids?: string[]
  include_descendants?: boolean
  all?: boolean
}

export type ScryerPlanFoldResult = {
  folded: ScryerFoldedItem[]
  remaining: PendingChange[]
  findings?: ScryerValidationFinding[]
}
