import type { ScryModel } from './model'

export type ScryerDriftFlagNodeTarget =
  | { node_id: string; node_key?: never }
  | { node_key: string; node_id?: never }

export type ScryerDriftNewNodeInput = {
  key: string
  kind: ScryModel['nodes'][number]['kind']
  name: string
  parent_id?: string
  parent_key?: string
  description?: string
  technology?: string
}

export type ScryerDriftUndescribedInput = ScryerDriftFlagNodeTarget & {
  statement: string
  source_file?: string
  symbol?: string
  line?: number
  end_line?: number
  reason?: string
}

export type ScryerDriftUndescribedPropertyInput = ScryerDriftFlagNodeTarget & {
  label: string
  description?: string
  source_file?: string
  symbol?: string
  line?: number
  end_line?: number
  reason?: string
}

export type ScryerDriftStaleResponsibilityInput = {
  responsibility_id: string
  reason?: string
  proposedStatement?: string
}

export type ScryerDriftStalePropertyInput = {
  node_id: string
  label: string
  reason?: string
}

export type ScryerDriftStaleNodeInput = {
  node_id: string
  reason?: string
}

export type ScryerDriftFlagInput = {
  project?: string
  node_id: string
  undescribed?: ScryerDriftUndescribedInput[]
  new_nodes?: ScryerDriftNewNodeInput[]
  undescribed_properties?: ScryerDriftUndescribedPropertyInput[]
  stale?: ScryerDriftStaleResponsibilityInput[]
  stale_properties?: ScryerDriftStalePropertyInput[]
  stale_nodes?: ScryerDriftStaleNodeInput[]
}

export type ScryerDriftFlagResult = {
  flagged: number
  mintedNodes: Record<string, string>
  vagrantResponsibilities: { nodeId: string; responsibilityId: string; statement: string }[]
  vagrantProperties: { nodeId: string; label: string }[]
  staleResponsibilities: { responsibilityId: string; staleProposal?: string }[]
  staleProperties: { nodeId: string; label: string }[]
  staleNodes: { nodeId: string }[]
  skippedExistingProperties?: { nodeId: string; label: string }[]
}
