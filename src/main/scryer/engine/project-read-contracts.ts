import type { ScryerValidationFinding } from './operation-results'
import type { ScryerReadView, ScryerReadViewInput } from './model-read-contracts'

export type ScryerRuleIndexEntry = {
  id: string
  title: string
  tags: string[]
}

export type ScryerRuleDetail = ScryerRuleIndexEntry & {
  body: string
}

export type ScryerRulesReadInput = {
  topic?: string
}

export type ScryerRulesReadResult =
  | {
      mode: 'index'
      rules: ScryerRuleIndexEntry[]
    }
  | {
      mode: 'topic'
      topic: string
      rules: ScryerRuleDetail[]
    }
  | {
      mode: 'miss'
      topic: string
      guidance: 'choose_topic_from_index'
      rules: ScryerRuleIndexEntry[]
    }

export type ScryerCodebaseReadInput = {
  project?: string
  path?: string
  maxDepth?: number
  maxEntries?: number
}

export type ScryerCodebaseMarker = 'manifest' | 'infrastructure' | 'environment'

export type ScryerCodebaseEntry = {
  path: string
  name: string
  kind: 'file' | 'directory'
  depth: number
  markers: ScryerCodebaseMarker[]
}

export type ScryerCodebaseReadResult = {
  root: string
  entries: ScryerCodebaseEntry[]
  summary: {
    fileCount: number
    directoryCount: number
    manifestCount: number
    infrastructureCount: number
    environmentCount: number
    skippedCount: number
  }
  truncated: boolean
}

export type ScryerModelReadInput = ScryerReadViewInput
export type ScryerModelReadResult = ScryerReadView

export type ScryerModelValidateInput = {
  project?: string
}

export type ScryerModelValidateResult = {
  findings: ScryerValidationFinding[]
  validationWarningCount: number
  validationErrorCount: number
}

export type ScryerModelHealthInput = {
  project?: string
  node_id?: string
}

export type ScryerHealthCounts = {
  responsibilities: number
  properties: number
  vagrant: number
  stale: number
  anchorable: number
  anchored: number
  unmapped: number
  lastTouchedAt?: number
}

export type ScryerBoundaryCoverage = {
  totalFiles: number
  anchoredFiles: number
  darkFiles: string[]
}

export type ScryerNodeHealth = {
  own: ScryerHealthCounts
  subtree: ScryerHealthCounts
  boundary?: ScryerBoundaryCoverage
}

export type ScryerModelHealthResult = {
  nodes: Record<string, ScryerNodeHealth>
  totals: ScryerHealthCounts
}
