import { ScryerDriftVerdictRecorder } from '../drift-verdict-recorder'
import type { ScryerDriftFlagInput, ScryerDriftFlagResult, ScryerOperationExecutor } from '../types'
import { failure } from './operation-result'

export const driftFlagOperation: ScryerOperationExecutor<
  ScryerDriftFlagInput,
  ScryerDriftFlagResult
> = ({ input, state, services }) => {
  if (!state.planned) {
    return failure('internal_error', 'Planned state was not loaded for scryer.drift.flag', {
      reason: 'policy_violation',
      contractOperationId: 'scryer.drift.flag'
    })
  }
  const committed = state.committed ?? state.planned
  return new ScryerDriftVerdictRecorder().record({
    input,
    committed,
    planned: state.planned,
    services
  })
}
