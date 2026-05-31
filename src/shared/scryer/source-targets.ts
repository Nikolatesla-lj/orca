export type SourceTargetPatternValidationReason =
  | 'empty'
  | 'absolute'
  | 'windows-drive'
  | 'home-prefix'
  | 'url-scheme'
  | 'nul-byte'
  | 'parent-traversal'
  | 'unsupported-glob'

export type SourceTargetPatternValidationResult =
  | { ok: true; normalizedPattern: string }
  | {
      ok: false
      code: 'parser.invalid-source-target' | 'controller.invalid-source-target'
      reason: SourceTargetPatternValidationReason
      rejectedPattern: string
    }

function failure(
  pattern: string,
  caller: 'parser' | 'controller',
  reason: SourceTargetPatternValidationReason
): SourceTargetPatternValidationResult {
  return {
    ok: false,
    code: caller === 'parser' ? 'parser.invalid-source-target' : 'controller.invalid-source-target',
    reason,
    rejectedPattern: pattern
  }
}

function hasUnsupportedGlobSyntax(pattern: string): boolean {
  return (
    pattern.includes('[') ||
    pattern.includes(']') ||
    /[{}()!+]/.test(pattern) ||
    /\*{3,}/.test(pattern)
  )
}

function isAbsolutePosixPath(pattern: string): boolean {
  return pattern.startsWith('/')
}

function normalizeWorkspaceRelativePosixPattern(pattern: string): string {
  return pattern
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/')
}

export function validateWorkspaceRelativeSourcePattern(
  pattern: string,
  caller: 'parser' | 'controller'
): SourceTargetPatternValidationResult {
  const trimmed = pattern.trim()
  if (!trimmed) {
    return failure(pattern, caller, 'empty')
  }
  if (trimmed.includes('\0')) {
    return failure(pattern, caller, 'nul-byte')
  }
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return failure(pattern, caller, 'windows-drive')
  }
  if (trimmed.startsWith('~')) {
    return failure(pattern, caller, 'home-prefix')
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    return failure(pattern, caller, 'url-scheme')
  }
  const posixPattern = trimmed.replace(/\\/g, '/')
  if (isAbsolutePosixPath(posixPattern)) {
    return failure(pattern, caller, 'absolute')
  }
  if (posixPattern.split('/').includes('..')) {
    return failure(pattern, caller, 'parent-traversal')
  }
  if (hasUnsupportedGlobSyntax(posixPattern)) {
    return failure(pattern, caller, 'unsupported-glob')
  }

  const normalizedPattern = normalizeWorkspaceRelativePosixPattern(posixPattern)
  if (!normalizedPattern) {
    return failure(pattern, caller, 'empty')
  }
  if (normalizedPattern.split('/').includes('..')) {
    return failure(pattern, caller, 'parent-traversal')
  }

  return { ok: true, normalizedPattern }
}
