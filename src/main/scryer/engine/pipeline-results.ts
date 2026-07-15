import { errorDetailSchemas } from './operation-error-schemas'
import type {
  ScryerErrorMapper,
  ScryerExecutorFailure,
  ScryerFieldError,
  ScryerOperationContract,
  ScryerOperationError,
  ScryerOperationErrorCode,
  ScryerOperationMeta,
  ScryerOperationResult
} from './types'

export function failureResult(
  operationId: string,
  requestId: string,
  errorMapper: ScryerErrorMapper,
  args: {
    code: ScryerOperationErrorCode
    message: string
    details?: Record<string, unknown>
    fieldErrors?: ScryerFieldError[]
    path?: string
    jsonPointer?: string
    retryable?: boolean
    meta?: ScryerOperationMeta
  }
): ScryerOperationResult {
  return errorMapper.toOperationResult({
    ok: false,
    operationId,
    requestId,
    error: errorMapper.mapPipelineFailure(args),
    ...(args.meta ? { meta: args.meta } : {})
  })
}

export function internalError(
  operationId: string,
  requestId: string,
  errorMapper: ScryerErrorMapper,
  reason:
    | 'success_schema_failed'
    | 'error_details_schema_failed'
    | 'undeclared_error_code'
    | 'policy_violation'
    | 'malformed_warning'
    | 'unknown_warning_code'
    | 'unexpected_exception',
  message: string
): ScryerOperationResult {
  return failureResult(operationId, requestId, errorMapper, {
    code: 'internal_error',
    message,
    details: { reason, contractOperationId: operationId }
  })
}
function schemaForError(
  contract: ScryerOperationContract<unknown, unknown>,
  code: ScryerOperationErrorCode
) {
  return contract.errors[code] ?? errorDetailSchemas[code]
}

const COMMON_ERROR_CODES = new Set<ScryerOperationErrorCode>([
  'invalid_input',
  'invalid_context',
  'incompatible_model',
  'io_error',
  'lock_busy',
  'lease_required',
  'operation_not_found',
  'internal_error'
])

export function validateErrorDetails(
  contract: ScryerOperationContract<unknown, unknown>,
  error: ScryerOperationError | ScryerExecutorFailure
): 'ok' | 'undeclared_error_code' | 'error_details_schema_failed' {
  const isCommon = COMMON_ERROR_CODES.has(error.code)
  if (!isCommon && !contract.errors[error.code]) {
    return 'undeclared_error_code'
  }
  const schema = schemaForError(contract, error.code)
  const result = schema.safeParse(error.details)
  return result.success ? 'ok' : 'error_details_schema_failed'
}
