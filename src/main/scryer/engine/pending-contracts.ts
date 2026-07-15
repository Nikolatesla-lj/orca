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
