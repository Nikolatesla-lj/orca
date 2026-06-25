import type { ScryerOperationErrorCode } from './types'

export class ScryerEngineError extends Error {
  constructor(
    readonly code: ScryerOperationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly retryable = false
  ) {
    super(message)
  }
}
