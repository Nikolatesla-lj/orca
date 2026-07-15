import type { ScryerRecommendedRead } from './model-read-contracts'
import type { ScryerValidationFinding } from './operation-results'

// Container generation (#21 / #34): the atomic `scryer.container.fill` primitive.
// A proposal uses request-local `key`s to reference its own elements; it must
// never carry real model ids (those are minted here through the shared minter).
export type ScryerProposedResponsibility =
  | string
  | { statement: string; line?: number; endLine?: number }

export type ScryerProposedProperty = {
  label: string
  description?: string
}

export type ScryerProposedSymbol = {
  key: string
  name: string
  source_file: string
  line?: number
  end_line?: number
  responsibilities?: ScryerProposedResponsibility[]
  properties?: ScryerProposedProperty[]
  visual?: boolean
}

export type ScryerProposedComponent = {
  key: string
  name: string
  description?: string
  responsibilities?: string[]
  symbols: ScryerProposedSymbol[]
}

export type ScryerProposedLink = {
  src: string
  dst: string
  label: string
  method?: string
}

export type ScryerProposedGroup = {
  name: string
  description?: string
  member_keys: string[]
  responsibilities?: string[]
}

export type ScryerContainerFillInput = {
  project?: string
  container_id: string
  components: ScryerProposedComponent[]
  links?: ScryerProposedLink[]
  groups?: ScryerProposedGroup[]
}

// The deterministic codebase dependency graph cached at `.scryer/.build_edges.json`.
// Endpoints are the extractor's `path#name@startLine` symbol keys; the fill join
// is on `(path, name)` so a slightly different reported line still matches.
export type ScryerBuildEdge = {
  src: string
  dst: string
}

export type ScryerBuildEdgeGraph = {
  symbolEdges: ScryerBuildEdge[]
}

// Why callers can distinguish "no evidence" from "evidence unavailable" when a
// generation derives few code links.
export type ScryerEdgeGraphStatus =
  | 'available'
  | 'missing'
  | 'empty'
  | 'stale'
  | 'partially_unresolved'

export type ScryerDroppedLink = {
  src: string
  dst: string
  label: string
  method?: string
  reason: string
}

export type ScryerContainerFillCreatedComponent = {
  id: string
  key: string
  name: string
  responsibilityIds: string[]
  symbolIds: string[]
}

export type ScryerContainerFillCreatedSymbol = {
  id: string
  key: string
  name: string
  parentComponentId: string
  responsibilityIds: string[]
  propertyLabels: string[]
  sourceKeys: string[]
}

export type ScryerContainerFillCreatedGroup = {
  id: string
  name: string
  memberIds: string[]
  responsibilityIds: string[]
}

export type ScryerContainerFillResult = {
  commit: {
    committedWritten: boolean
    plannedMirrored: boolean
    // Atomic generation defers the baseline snapshot to the build-end fold.
    baselineRefreshed: boolean
  }
  summary: {
    containerId: string
    components: number
    symbols: number
    groups: number
    derivedLinks: number
    keptLinks: number
    droppedLinks: number
    sourceAnchors: number
  }
  created: {
    components: ScryerContainerFillCreatedComponent[]
    symbols: ScryerContainerFillCreatedSymbol[]
    groups: ScryerContainerFillCreatedGroup[]
  }
  reports: {
    droppedLinks: ScryerDroppedLink[]
    edgeGraphStatus: ScryerEdgeGraphStatus
    thinSymbolCount: number
    findings: ScryerValidationFinding[]
  }
  recommendedNextReads: ScryerRecommendedRead[]
}
