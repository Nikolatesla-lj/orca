import type { ScryerOperationError, ScryerOperationResult } from './types'

const SENSITIVE_DETAIL_KEY = /token|leaseid|authorization/i
const GENERATED_LEASE_TOKEN = /scryer-edit-[a-z0-9._:-]+/gi
const LABELED_CREDENTIAL =
  /\b(?:lease[ _-]?token|leaseToken|activeLeaseId|leaseId|token)\b\s*(?::|=|is)?\s*['"]?[^\s,'"}]+/gi

function redactString(value: string, secrets: readonly string[]): string {
  let redacted = value
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, '[redacted]')
    }
  }
  return redacted
    .replace(GENERATED_LEASE_TOKEN, '[redacted]')
    .replace(LABELED_CREDENTIAL, '[redacted credential]')
}

function sanitizeDetails(
  value: unknown,
  secrets: readonly string[]
): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_DETAIL_KEY.test(key)) {
      continue
    }
    if (typeof item === 'string') {
      output[key] = redactString(item, secrets)
    } else if (Array.isArray(item)) {
      output[key] = item.map((entry) =>
        typeof entry === 'string' ? redactString(entry, secrets) : entry
      )
    } else if (typeof item === 'object' && item !== null) {
      output[key] = sanitizeDetails(item, secrets)
    } else {
      output[key] = item
    }
  }
  return output
}

function sanitizeError(
  error: ScryerOperationError,
  secrets: readonly string[]
): ScryerOperationError {
  const details = error.details ? sanitizeDetails(error.details, secrets) : undefined
  return {
    ...error,
    message: redactString(error.message, secrets),
    ...(details ? { details } : {}),
    ...(error.fieldErrors
      ? {
          fieldErrors: error.fieldErrors.map((fieldError) => ({
            ...fieldError,
            message: redactString(fieldError.message, secrets)
          }))
        }
      : {})
  }
}

export function sanitizeScryerOperationResult<TResult>(
  result: ScryerOperationResult<TResult>,
  secrets: readonly string[] = []
): ScryerOperationResult<TResult> {
  return result.ok ? result : { ...result, error: sanitizeError(result.error, secrets) }
}
