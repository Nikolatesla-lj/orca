import type { CompletionGateResult } from './edit-session-gate'

export function reportEditSessionCompletion<Input>(
  observer: ((input: Input, result: CompletionGateResult) => void) | undefined,
  input: Input,
  result: CompletionGateResult
): CompletionGateResult {
  try {
    observer?.(input, result)
  } catch {
    // Why: an observer cannot roll back a completion or lease release that already succeeded.
    console.error('[scryer] completion gate observer failed')
  }
  return result
}
