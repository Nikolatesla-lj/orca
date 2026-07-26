import type {
  ResolvedScryerProject,
  ScryerExecutorFailure,
  ScryerFlatOperationPolicy,
  ScryerOperationId,
  ScryerSideEffect,
  ScryerStateChanges
} from './types'
import type {
  ScryerBestEffortCommitItem,
  ScryerPrimaryCommitItem,
  ScryerStateCommitPlan
} from './state-store'

function maintenanceMode(
  policy: ScryerFlatOperationPolicy,
  target: string
): 'required' | 'best_effort' | null {
  return policy.maintenanceWrites.find((item) => item.target === target)?.mode ?? null
}

function pushMaintenance(
  primary: ScryerPrimaryCommitItem[],
  bestEffort: ScryerBestEffortCommitItem[],
  policy: ScryerFlatOperationPolicy,
  target: ScryerBestEffortCommitItem['target'],
  item: ScryerPrimaryCommitItem | ScryerBestEffortCommitItem,
  requiredSideEffect: ScryerSideEffect
): ScryerExecutorFailure | null {
  const mode = maintenanceMode(policy, target)
  if (!mode || !policy.sideEffects.includes(requiredSideEffect)) {
    return {
      code: 'internal_error',
      message: `Executor requested undeclared maintenance write ${target}`,
      details: { reason: 'policy_violation' }
    }
  }
  if (mode === 'required') {
    primary.push(item as ScryerPrimaryCommitItem)
  } else {
    bestEffort.push(item as ScryerBestEffortCommitItem)
  }
  return null
}

export function buildCommitPlan(args: {
  operationId: ScryerOperationId
  requestId: string
  project: ResolvedScryerProject
  policy: ScryerFlatOperationPolicy
  changes?: ScryerStateChanges
}): ScryerStateCommitPlan | ScryerExecutorFailure {
  const primary: ScryerPrimaryCommitItem[] = []
  const bestEffort: ScryerBestEffortCommitItem[] = []
  const changes = args.changes
  if (!changes) {
    return {
      operationId: args.operationId,
      requestId: args.requestId,
      project: args.project,
      primary,
      bestEffort
    }
  }
  if (changes.planned) {
    if (!args.policy.semanticWrites.includes('planned')) {
      return {
        code: 'internal_error',
        message: 'Executor returned undeclared planned write',
        details: { reason: 'policy_violation' }
      }
    }
    primary.push({ target: 'planned', model: changes.planned })
  }
  if (changes.committed) {
    if (!args.policy.semanticWrites.includes('committed')) {
      return {
        code: 'internal_error',
        message: 'Executor returned undeclared committed write',
        details: { reason: 'policy_violation' }
      }
    }
    primary.push({ target: 'committed', model: changes.committed })
  }
  if (changes.historyEvents && changes.historyEvents.length > 0) {
    const failure = pushMaintenance(
      primary,
      bestEffort,
      args.policy,
      'history',
      { target: 'history', events: changes.historyEvents },
      'history_append'
    )
    if (failure) {
      return failure
    }
  }
  if (changes.syncState) {
    const effect = args.policy.sideEffects.includes('sync_state_write')
      ? 'sync_state_write'
      : 'seed_sync_if_absent'
    const failure = pushMaintenance(
      primary,
      bestEffort,
      args.policy,
      'sync',
      { target: 'sync', state: changes.syncState },
      effect
    )
    if (failure) {
      return failure
    }
  }
  if (changes.baseline === 'refresh') {
    const failure = pushMaintenance(
      primary,
      bestEffort,
      args.policy,
      'baseline',
      { target: 'baseline', action: 'refresh' },
      'baseline_refresh'
    )
    if (failure) {
      return failure
    }
  }
  if (changes.anchorBaseline === 'refresh') {
    const effect = args.policy.sideEffects.includes('anchor_baseline_refresh')
      ? 'anchor_baseline_refresh'
      : 'write_anchor_baseline_if_absent'
    const failure = pushMaintenance(
      primary,
      bestEffort,
      args.policy,
      'anchor_baseline',
      { target: 'anchor_baseline', action: 'refresh' },
      effect
    )
    if (failure) {
      return failure
    }
  }
  if (changes.committedSourceMapReanchor === 'refresh') {
    const failure = pushMaintenance(
      primary,
      bestEffort,
      args.policy,
      'committed_source_map_reanchor',
      { target: 'committed_source_map_reanchor', action: 'refresh' },
      'silent_reanchor_committed_source_map'
    )
    if (failure) {
      return failure
    }
  }
  return {
    operationId: args.operationId,
    requestId: args.requestId,
    project: args.project,
    primary,
    bestEffort
  }
}
