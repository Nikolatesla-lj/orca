import type { ScryerCompletionGateResult } from '../../../../shared/scryer/edit-session'
import {
  formatCompletionGateMessage,
  isArchitectureCompletionGateSuccess
} from './architecture-completion-gate-terminal'

export type ContainerFillTerminal =
  | { phase: 'done'; message: string }
  | { phase: 'needs_attention'; message: string }

export type ContainerFillTerminalInput = {
  gate: ScryerCompletionGateResult | null
  // Whether the refreshed committed view now contains the container's generated
  // subtree. Required for success in addition to a passing gate.
  generatedSubtreePresent: boolean
}

// Why: a container fill mirrors committed+planned, so after the agent's atomic
// generation the completion gate legitimately reports nothing_to_fold — that is the
// only success terminal. But a zero-pending gate ALSO results from a failed/no-op
// fill (the agent's `orca scryer container fill` errored, nothing was written), so
// success additionally requires the refreshed view to actually contain the generated
// subtree — an operation failure must never be turned into success by a zero-pending
// read. Every other gate outcome (blocked_by_lease, fix_validation, manual_review,
// fold_allowed) left work unfolded and must surface as attention, never cleared to
// success; a null gate (the session could not be evaluated) is attention too.
export function resolveContainerFillTerminal(
  input: ContainerFillTerminalInput
): ContainerFillTerminal {
  if (
    input.gate &&
    isArchitectureCompletionGateSuccess(input.gate) &&
    input.generatedSubtreePresent
  ) {
    return { phase: 'done', message: 'Container generated with AI' }
  }
  if (input.gate && isArchitectureCompletionGateSuccess(input.gate)) {
    // Gate passed but the container is still empty: the generation did not land.
    return { phase: 'needs_attention', message: 'Container generation did not add anything' }
  }
  return {
    phase: 'needs_attention',
    message: input.gate
      ? formatCompletionGateMessage(input.gate)
      : 'Container generation needs attention'
  }
}
