import type { ScryerCompletionGateResult } from '../../../../shared/scryer/edit-session'

export type ArchitectureSyncFinishOutcome = { kind: 'success' } | { kind: 'attention' }

// Why: a sync only truly finished when the completion gate folded the plan into the
// committed model (post-fold the gate reports nextAction 'nothing_to_fold' with ok),
// or there was nothing to fold. fold_allowed/fix_validation/manual_review/
// blocked_by_lease all leave pending changes unfolded and must NOT finish, mark
// synced, clear the pre-sync snapshot, advance the baseline, or report success.
export function isArchitectureCompletionGateSuccess(gate: ScryerCompletionGateResult): boolean {
  return gate.ok && gate.nextAction === 'nothing_to_fold'
}

export function isArchitectureCompletionGateAttention(gate: ScryerCompletionGateResult): boolean {
  return !isArchitectureCompletionGateSuccess(gate)
}

// Why: drives the renderer sync terminal. A null gate (no completed edit session to
// evaluate) falls through to the finish attempt, which the main process still guards
// with its own completion-gate check.
export function resolveArchitectureSyncFinishOutcome(
  gate: ScryerCompletionGateResult | null
): ArchitectureSyncFinishOutcome {
  return gate && isArchitectureCompletionGateAttention(gate)
    ? { kind: 'attention' }
    : { kind: 'success' }
}

export function formatCompletionGateMessage(gate: ScryerCompletionGateResult): string {
  switch (gate.nextAction) {
    case 'nothing_to_fold':
      return 'No model changes to fold'
    case 'fold_allowed': {
      const count = gate.pending.total
      return `${count} pending change${count === 1 ? '' : 's'} ready to fold`
    }
    case 'fix_validation': {
      const count = gate.validation.blockingCount
      return `Fix ${count} validation error${count === 1 ? '' : 's'} before folding`
    }
    case 'manual_review':
      return 'Manual review required before folding'
    case 'blocked_by_lease':
      return 'Edit session blocked by another lease'
  }
}
