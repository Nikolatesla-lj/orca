import type { ScryModel } from './model'
import type { ScryerLayer } from './operation-identifiers'
import type { ScryerRecommendedRead } from './operation-results'

export type ScryerReadViewInput = {
  project?: string
  view?: 'overview' | 'subtree' | 'full'
  node?: string
  layer?: ScryerLayer
}

export type ScryerReadOverviewNode = {
  id: string
  kind: ScryModel['nodes'][number]['kind']
  name: string
  path: string
  depth: number
  childCount: number
  directSymbolCount: number
  responsibilityCount: number
  propertyCount: number
  groupCount: number
  hasSourceAnchors: boolean
  hasBoundaries: boolean
  hasExternalLinks: boolean
  hiddenSymbolDescendants: boolean
  hasChildren: boolean
  parentId?: string
  description?: string
  technology?: string
  external?: boolean
  stale?: boolean
  vagrant?: boolean
}

export type ScryerReadNodeSummary = {
  id: string
  kind: ScryModel['nodes'][number]['kind']
  name: string
  path: string
  depth: number
  childCount: number
  nResp: number
  nProps: number
  parentId?: string
  description?: string
  technology?: string
  external?: boolean
  stale?: boolean
  vagrant?: boolean
}

export type ScryerModelOverviewResult = {
  view: 'overview'
  layer: ScryerLayer
  version: ScryModel['version']
  nodeCount: number
  linkCount: number
  groupCount: number
  truncated: boolean
  overview: ScryerReadOverviewNode[]
  recommendedNextReads: ScryerRecommendedRead[]
  baselineRefreshed?: boolean
}

export type ScryerModelSubtreeResult = {
  view: 'subtree'
  layer: ScryerLayer
  version: ScryModel['version']
  nodeCount: number
  linkCount: number
  groupCount: number
  node: ScryerReadNodeSummary
  descendants: ScryModel['nodes']
  internalLinks: ScryModel['links']
  externalLinks: ScryModel['links']
  contextNodes: ScryerReadNodeSummary[]
  referencesForChildren: {
    id: string
    kind: ScryModel['nodes'][number]['kind']
    name: string
    path: string
    direction: 'incoming' | 'outgoing'
    label: string
  }[]
  sourceMap: ScryModel['sourceMap']
  boundaries: ScryModel['boundaries']
  degraded: boolean
  truncated: boolean
  approximateSizeBytes?: number
  children?: ScryerReadNodeSummary[]
  recommendedNextReads: ScryerRecommendedRead[]
  baselineRefreshed?: boolean
}

export type ScryerModelFullResult = {
  view: 'full'
  layer: ScryerLayer
  version: ScryModel['version']
  nodeCount: number
  linkCount: number
  groupCount: number
  model: ScryModel
  baselineRefreshed?: boolean
}

export type ScryerReadView =
  | ScryerModelOverviewResult
  | ScryerModelSubtreeResult
  | ScryerModelFullResult

export type ScryerModelSearchInput = {
  project?: string
  query: string
  kind?: ScryModel['nodes'][number]['kind']
  layer?: ScryerLayer
}

export type ScryerSearchMatch = {
  field: string
  value: string
  match: 'exact' | 'fuzzy'
  score: number
}

export type ScryerModelSearchHit = {
  id: string
  kind: ScryModel['nodes'][number]['kind']
  name: string
  path: string
  score: number
  matched: ScryerSearchMatch[]
  parentId?: string
}

export type ScryerModelSearchResult = {
  layer: ScryerLayer
  query: string
  resultCount: number
  truncated: boolean
  hits: ScryerModelSearchHit[]
  kind?: ScryModel['nodes'][number]['kind']
}

export type ScryerQueryCondition = {
  field: string
  op: 'eq' | 'ne' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'absent'
  value?: string | number | boolean
}

export type ScryerModelQueryInput = {
  project?: string
  where: ScryerQueryCondition[]
  under?: string
  layer?: ScryerLayer
}

export type ScryerModelQueryHit = {
  id: string
  kind: ScryModel['nodes'][number]['kind']
  name: string
  path: string
  nResp: number
  nProps: number
  childCount: number
  parentId?: string
  external?: boolean
  visual?: boolean
  empty?: boolean
  vagrant?: boolean
}

export type ScryerModelQueryResult = {
  layer: ScryerLayer
  resultCount: number
  truncated: boolean
  hits: ScryerModelQueryHit[]
  where: ScryerQueryCondition[]
  under?: string
}
