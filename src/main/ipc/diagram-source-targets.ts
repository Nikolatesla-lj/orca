import { lstat, readdir, realpath } from 'fs/promises'
import { posix } from 'path'
import { resolve, relative } from 'path'
import type { Store } from '../persistence'
import type { DiagramRefTarget } from '../../shared/scryer/model-types'
import { validateWorkspaceRelativeSourcePattern } from '../../shared/scryer/source-targets'
import { assertAuthorizedArchitectureProjectPath } from './architecture-project-auth'
import { isDescendantOrEqual } from './filesystem-auth'

export type SourceTargetResolutionReason =
  | 'glob-escape'
  | 'outside-project'
  | 'no-matches'
  | 'unauthorized-project'
  | 'filesystem-error'

export type SourceTargetResolutionResult =
  | {
      ok: true
      authorizedProjectPath: string
      normalizedPattern: string
      matchedRelativePaths: string[]
    }
  | {
      ok: false
      code: 'controller.invalid-source-target' | 'controller.source-open-failed'
      reason: SourceTargetResolutionReason
      rejectedPattern: string
    }

export type SourceOpenLocation = {
  relativePath: string
  line?: number
  endLine?: number
}

export type SourceTargetRuntimeContext = {
  projectPath: string
  store: Store
}

export type OpenDiagramSourceTargetResult =
  | { ok: true; action: 'opened'; locations: SourceOpenLocation[] }
  | { ok: true; action: 'selection-required'; locations: SourceOpenLocation[] }
  | {
      ok: false
      code: 'controller.invalid-source-target' | 'controller.source-open-failed'
      reason: string
      rejectedPattern: string
    }

function resolutionFailure(
  code: 'controller.invalid-source-target' | 'controller.source-open-failed',
  reason: SourceTargetResolutionReason,
  rejectedPattern: string
): SourceTargetResolutionResult {
  return { ok: false, code, reason, rejectedPattern }
}

function hasGlob(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?')
}

function globToRegex(pattern: string): RegExp {
  let output = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]
    const afterNext = pattern[index + 2]
    if (char === '*' && next === '*' && afterNext === '/') {
      output += '(?:.*/)?'
      index += 2
    } else if (char === '*' && next === '*') {
      output += '.*'
      index += 1
    } else if (char === '*') {
      output += '[^/]*'
    } else if (char === '?') {
      output += '[^/]'
    } else {
      output += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  output += '$'
  return new RegExp(output)
}

function toPosixRelative(projectPath: string, filePath: string): string | null {
  const relativePath = relative(projectPath, filePath).replace(/\\/g, '/')
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..') {
    return null
  }
  return relativePath
}

async function collectProjectFiles(
  authorizedProjectPath: string,
  directoryPath = authorizedProjectPath
): Promise<
  { ok: true; files: string[] } | { ok: false; reason: 'glob-escape' | 'filesystem-error' }
> {
  const files: string[] = []
  let entries
  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch {
    return { ok: false, reason: 'filesystem-error' }
  }

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue
    }
    const entryPath = resolve(directoryPath, entry.name)
    let realEntryPath: string
    try {
      realEntryPath = await realpath(entryPath)
    } catch {
      continue
    }
    if (!isDescendantOrEqual(realEntryPath, authorizedProjectPath)) {
      return { ok: false, reason: 'glob-escape' }
    }
    if (entry.isDirectory()) {
      const childResult = await collectProjectFiles(authorizedProjectPath, entryPath)
      if (!childResult.ok) {
        return childResult
      }
      files.push(...childResult.files)
      continue
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const stats = await lstat(entryPath)
        if (!stats.isFile() && !stats.isSymbolicLink()) {
          continue
        }
      } catch {
        continue
      }
      const relativePath = toPosixRelative(authorizedProjectPath, realEntryPath)
      if (!relativePath) {
        return { ok: false, reason: 'glob-escape' }
      }
      files.push(relativePath)
    }
  }

  return { ok: true, files }
}

async function resolveOneFile(
  authorizedProjectPath: string,
  normalizedPattern: string
): Promise<string | null | 'outside-project' | 'filesystem-error'> {
  const candidate = resolve(authorizedProjectPath, normalizedPattern)
  if (!isDescendantOrEqual(candidate, authorizedProjectPath)) {
    return 'outside-project'
  }
  try {
    const realCandidate = await realpath(candidate)
    if (!isDescendantOrEqual(realCandidate, authorizedProjectPath)) {
      return 'outside-project'
    }
    const relativePath = toPosixRelative(authorizedProjectPath, realCandidate)
    return relativePath
  } catch {
    return null
  }
}

export async function resolveWorkspaceSourcePattern(
  context: SourceTargetRuntimeContext,
  normalizedPattern: string
): Promise<SourceTargetResolutionResult> {
  let authorizedProjectPath: string
  try {
    authorizedProjectPath = await assertAuthorizedArchitectureProjectPath(
      context.projectPath,
      context.store
    )
  } catch {
    return resolutionFailure(
      'controller.invalid-source-target',
      'unauthorized-project',
      normalizedPattern
    )
  }

  if (!hasGlob(normalizedPattern)) {
    const match = await resolveOneFile(authorizedProjectPath, normalizedPattern)
    if (match === 'outside-project') {
      return resolutionFailure(
        'controller.invalid-source-target',
        'outside-project',
        normalizedPattern
      )
    }
    if (match === 'filesystem-error') {
      return resolutionFailure(
        'controller.source-open-failed',
        'filesystem-error',
        normalizedPattern
      )
    }
    return {
      ok: true,
      authorizedProjectPath,
      normalizedPattern,
      matchedRelativePaths: match ? [match] : []
    }
  }

  const collected = await collectProjectFiles(authorizedProjectPath)
  if (!collected.ok) {
    return resolutionFailure(
      collected.reason === 'glob-escape'
        ? 'controller.invalid-source-target'
        : 'controller.source-open-failed',
      collected.reason,
      normalizedPattern
    )
  }
  const matcher = globToRegex(normalizedPattern)
  const matchedRelativePaths = [...new Set(collected.files)]
    .filter((file) => matcher.test(posix.normalize(file)))
    .sort((left, right) => left.localeCompare(right))

  return {
    ok: true,
    authorizedProjectPath,
    normalizedPattern,
    matchedRelativePaths
  }
}

export async function openDiagramSourceTarget(
  context: SourceTargetRuntimeContext,
  target: Extract<DiagramRefTarget, { type: 'source' }>
): Promise<OpenDiagramSourceTargetResult> {
  const validation = validateWorkspaceRelativeSourcePattern(target.pattern, 'controller')
  if (!validation.ok) {
    return {
      ok: false,
      code: 'controller.invalid-source-target',
      reason: validation.reason,
      rejectedPattern: validation.rejectedPattern
    }
  }

  const resolution = await resolveWorkspaceSourcePattern(context, validation.normalizedPattern)
  if (!resolution.ok) {
    return resolution
  }
  if (resolution.matchedRelativePaths.length === 0) {
    return {
      ok: false,
      code: 'controller.source-open-failed',
      reason: 'no-matches',
      rejectedPattern: validation.normalizedPattern
    }
  }

  const locations = resolution.matchedRelativePaths.map((relativePath) => ({
    relativePath,
    ...(target.line === undefined ? {} : { line: target.line }),
    ...(target.endLine === undefined ? {} : { endLine: target.endLine })
  }))

  if (locations.length > 1) {
    return { ok: true, action: 'selection-required', locations }
  }
  return { ok: true, action: 'opened', locations }
}
