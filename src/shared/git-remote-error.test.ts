import { describe, expect, it } from 'vitest'
import { isNoUpstreamError, normalizeGitErrorMessage } from './git-remote-error'

describe('isNoUpstreamError', () => {
  it('treats a missing HEAD@{u} tracking ref as no upstream', () => {
    const error = new Error(
      "fatal: ambiguous argument 'HEAD@{u}': unknown revision or path not in the working tree.\n" +
        "Use '--' to separate paths from revisions, like this:\n" +
        "'git <command> [<revision>...] -- [<file>...]'"
    )

    expect(isNoUpstreamError(error)).toBe(true)
  })

  it('does not treat unrelated ambiguous refs as no upstream', () => {
    const error = new Error(
      "fatal: ambiguous argument 'feature': unknown revision or path not in the working tree."
    )

    expect(isNoUpstreamError(error)).toBe(false)
  })
})

describe('normalizeGitErrorMessage', () => {
  it('normalizes git-version-specific non-repository messages', () => {
    expect(
      normalizeGitErrorMessage(
        new Error('fatal: not a git repository (or any of the parent directories): .git'),
        'upstream'
      )
    ).toBe('Not a git repository.')
    expect(
      normalizeGitErrorMessage(
        new Error(
          'fatal: Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).'
        ),
        'upstream'
      )
    ).toBe('Not a git repository.')
  })
})
