import type { ScryModel } from './model'
import type { ScryerPaths } from './paths'
import type {
  ModelEditLease,
  ResolvedScryerProject,
  ScryerFlatOperationPolicy,
  ScryerLoadedState,
  ScryerOperationId,
  ScryerOperationWarning,
  ScryerSyncState
} from './types'

export type StateStoreFailureInjection = {
  failPrimaryTarget?: 'planned' | 'committed' | 'sync' | 'anchor_baseline'
  failBestEffortTarget?:
    | 'history'
    | 'baseline'
    | 'sync'
    | 'anchor_baseline'
    | 'committed_source_map_reanchor'
}

export type ScryerPrimaryCommitItem =
  | { target: 'planned'; model: ScryModel }
  | { target: 'committed'; model: ScryModel }
  | { target: 'sync'; state: ScryerSyncState }
  | { target: 'anchor_baseline'; action: 'refresh' }

export type ScryerBestEffortCommitItem =
  | { target: 'history'; events: Record<string, unknown>[] }
  | { target: 'baseline'; action: 'refresh' }
  | { target: 'sync'; state: ScryerSyncState }
  | { target: 'anchor_baseline'; action: 'refresh' }
  | { target: 'committed_source_map_reanchor'; action: 'refresh' }

export type ScryerStateCommitPlan = {
  operationId: ScryerOperationId
  requestId: string
  project: ResolvedScryerProject
  primary: ScryerPrimaryCommitItem[]
  bestEffort: ScryerBestEffortCommitItem[]
}

export type ScryerStateCommitResult = {
  warnings: ScryerOperationWarning[]
}

export type ScryerStateStore = {
  paths(projectRoot: string): ScryerPaths
  resolveProject(projectRoot: string): ResolvedScryerProject
  loadDeclaredState(
    project: ResolvedScryerProject,
    policy: ScryerFlatOperationPolicy
  ): Promise<ScryerLoadedState>
  commit(plan: ScryerStateCommitPlan): Promise<ScryerStateCommitResult>
  readCommitted(projectRoot: string): Promise<ScryModel>
  readPlanned(projectRoot: string): Promise<ScryModel>
  readPlannedForEdit(projectRoot: string): Promise<ScryModel>
  readActiveLease(projectRoot: string): Promise<ModelEditLease | null>
  withWriteLock<T>(projectRoot: string, action: () => Promise<T>): Promise<T>
}
