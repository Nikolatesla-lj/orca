import { readFile } from 'fs/promises'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  normalizeDiagramSourceForHash
} from './diagram-cache'

function fixturePath(name: string): string {
  return join(__dirname, '__fixtures__', 'diagram-library', name)
}

describe('diagram cache hash helpers', () => {
  it('normalizes only line endings before computing the source hash', async () => {
    const source = await readFile(fixturePath('valid-mermaid-flowchart.mmd'), 'utf8')

    expect(normalizeDiagramSourceForHash(source.replace(/\n/g, '\r\n'))).toBe(source)
    expect(computeDiagramSourceHash(source.replace(/\n/g, '\r\n'))).toBe(
      computeDiagramSourceHash(source)
    )
    expect(computeDiagramSourceHash(` ${source}`)).not.toBe(computeDiagramSourceHash(source))
  })

  it('computes stable cache keys from the exact render inputs only', async () => {
    const source = await readFile(fixturePath('valid-mermaid-flowchart.mmd'), 'utf8')
    const baseInput = {
      sourceHash: computeDiagramSourceHash(source),
      notation: 'mermaid' as const,
      detectedKind: 'flowchart' as const,
      theme: 'light',
      rendererVersion: 'mermaid@test|adapter@test|dompurify@test',
      outputProfile: 'review' as const
    }
    const cacheKey = computeDiagramCacheKey(baseInput)

    expect(cacheKey).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(
      computeDiagramCacheKey({
        outputProfile: baseInput.outputProfile,
        rendererVersion: baseInput.rendererVersion,
        theme: baseInput.theme,
        detectedKind: baseInput.detectedKind,
        notation: baseInput.notation,
        sourceHash: baseInput.sourceHash
      })
    ).toBe(cacheKey)
    expect(computeDiagramCacheKey({ ...baseInput, theme: 'dark' })).not.toBe(cacheKey)
    expect(computeDiagramCacheKey({ ...baseInput, outputProfile: 'export' })).not.toBe(cacheKey)
  })
})
