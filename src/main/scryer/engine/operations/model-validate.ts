import type {
  ScryerModelValidateInput,
  ScryerModelValidateResult,
  ScryerOperationExecutor
} from '../types'
import { failure, success } from './operation-result'

export const modelValidateOperation: ScryerOperationExecutor<
  ScryerModelValidateInput,
  ScryerModelValidateResult
> = ({ input, state, services }) => {
  const layer = input.layer ?? 'committed'
  const candidate = layer === 'plan' ? state.planned : state.committed
  if (!candidate) {
    return failure('internal_error', `Declared ${layer} state was not loaded for validation`, {
      reason: 'policy_violation',
      contractOperationId: 'scryer.model.validate'
    })
  }
  const findings = services.validators.validateModel(candidate)
  return success({
    result: {
      findings,
      validationWarningCount: findings.filter((item) => item.severity === 'warning').length,
      validationErrorCount: findings.filter((item) => item.severity === 'error').length
    }
  })
}
