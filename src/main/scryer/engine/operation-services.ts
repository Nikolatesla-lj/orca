import type { ScryModel } from './model'
import type { ScryerIdKind } from './operation-identifiers'
import type { ScryerValidationFinding } from './operation-results'
import type { ScryerFoldedItem, ScryerFoldTarget, PendingChange } from './pending-contracts'
import type { ScryerClock } from './operation-state-contracts'

export type ScryerIdMinter = {
  node(): string
  responsibility(): string
  group(): string
  link(src: string, dst: string): string
  reserveExisting(id: string, kind?: ScryerIdKind): void
}

export type ScryerDiffService = {
  diffModels(from: ScryModel, to: ScryModel): PendingChange[]
}

export type ScryerFoldService = {
  foldTargets(args: { committed: ScryModel; planned: ScryModel; targets: ScryerFoldTarget[] }): {
    committed: ScryModel
    planned: ScryModel
    folded: ScryerFoldedItem[]
  }
}

export type ScryerSourceTarget =
  | { kind: 'responsibility'; responsibilityId: string }
  | { kind: 'node'; nodeId: string }
  | { kind: 'raw'; key: string }

export type ScryerSourceRouteDecision = {
  targetKind: 'sourceMap' | 'boundary'
  key: string
  targetLayer: 'committed' | 'planned'
  clearOtherLayer: boolean
  reason: 'target_in_committed' | 'target_only_in_planned' | 'clear_requested'
  entry?: ScryModel['sourceMap'][string] | ScryModel['boundaries'][string]
}

export type ScryerSourceRouter = {
  routeSourceEntry(args: {
    target: ScryerSourceTarget
    entry: ScryModel['sourceMap'][string]
    committed: ScryModel
    planned: ScryModel
    targetLayer?: 'auto' | 'committed' | 'planned'
  }): ScryerSourceRouteDecision
  routeBoundaryEntry(args: {
    nodeId: string
    entry: ScryModel['boundaries'][string]
    committed: ScryModel
    planned: ScryModel
  }): ScryerSourceRouteDecision
  clearSourceTarget(args: {
    target: ScryerSourceTarget
    committed: ScryModel
    planned: ScryModel
  }): ScryerSourceRouteDecision
  applySourceRoutes(args: {
    committed: ScryModel
    planned: ScryModel
    decisions: ScryerSourceRouteDecision[]
  }): { committed: ScryModel; planned: ScryModel; routed: ScryerSourceRouteDecision[] }
}

export type ScryerValidatorSet = {
  validateModel(model: ScryModel): ScryerValidationFinding[]
  linkViolation(
    model: ScryModel,
    src: string,
    dst: string
  ): {
    reason: 'self_link' | 'ancestor_descendant' | 'same_level_reference' | 'duplicate_link'
  } | null
}

export type ScryerOperationServices = {
  ids: ScryerIdMinter
  validators: ScryerValidatorSet
  diff: ScryerDiffService
  fold: ScryerFoldService
  sourceRouter: ScryerSourceRouter
  clock: ScryerClock
}
