import type {
  ScryerMaintenanceWriteTarget,
  ScryerOperationErrorCode,
  ScryerOperationId,
  ScryerOperationWarningCode,
  ScryerValidationFindingCode
} from './operation-identifiers'
import type { ScryerStateChanges } from './operation-state-contracts'

export type ScryerRecommendedRead = {
  operationId: ScryerOperationId
  input: Record<string, unknown>
  reason: string
}

export type ScryerFieldError = {
  path: string
  message: string
  code?: string
}

export type ScryerOperationError = {
  code: ScryerOperationErrorCode
  message: string
  details?: Record<string, unknown>
  fieldErrors?: ScryerFieldError[]
  path?: string
  jsonPointer?: string
  retryable?: boolean
}

export type ScryerOperationWarning = {
  code: ScryerOperationWarningCode
  message: string
  target?: ScryerMaintenanceWriteTarget
  details?: Record<string, unknown>
}

export type ScryerOperationMeta = {
  projectRoot?: string
  warnings?: ScryerOperationWarning[]
  completionGate?: {
    complete: boolean
    pendingCount: number
    validationWarningCount: number
    validationErrorCount?: number
  }
}

export type ScryerOperationResult<TResult = unknown> =
  | {
      ok: true
      operationId: ScryerOperationId | string
      requestId: string
      result: TResult
      meta?: ScryerOperationMeta
    }
  | {
      ok: false
      operationId: ScryerOperationId | string
      requestId: string
      error: ScryerOperationError
      meta?: ScryerOperationMeta
    }

export type ScryerValidationFinding = {
  code: ScryerValidationFindingCode
  severity: 'info' | 'warning' | 'error'
  message: string
  path?: string
  jsonPointer?: string
  details?: Record<string, unknown>
}

export type ScryerOperationOutcome<TResult> = {
  result: TResult
  changes?: ScryerStateChanges
  findings?: ScryerValidationFinding[]
  meta?: ScryerOperationMeta
}

export type ScryerExecutorFailure = {
  code: ScryerOperationErrorCode
  message: string
  details?: Record<string, unknown>
  fieldErrors?: ScryerFieldError[]
  path?: string
  jsonPointer?: string
  retryable?: boolean
}

export type ScryerExecutorResult<TResult> =
  | { ok: true; outcome: ScryerOperationOutcome<TResult> }
  | { ok: false; failure: ScryerExecutorFailure }
