/* eslint-disable max-lines -- Why: S7A cache tests keep real path, malicious input, authorization, clear, and failure-injection evidence together. */
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import { invalidateAuthorizedRootsCache, registerWorktreeRootsForRepo } from './filesystem-auth'
import { computeDiagramCacheKey, computeDiagramSourceHash } from '../../shared/scryer/diagram-cache'
import {
  clearDiagramCache,
  MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES,
  MAX_DIAGRAM_CACHE_SVG_BYTES,
  readDiagramCache,
  writeDiagramCache
} from './diagram-cache'
import { getProjectModelPath } from '../scryer/model-store'

function fixturePath(name: string): string {
  return join(__dirname, '..', '..', 'shared', 'scryer', '__fixtures__', 'diagram-library', name)
}

function storeFor(projectPath: string): Store {
  return {
    getRepos: () => [
      {
        id: 'repo-1',
        path: projectPath,
        displayName: 'repo',
        badgeColor: '#000',
        addedAt: 0
      }
    ],
    getSettings: () => ({})
  } as unknown as Store
}

function storeWithoutRepos(): Store {
  return {
    getRepos: () => [],
    getSettings: () => ({})
  } as unknown as Store
}

async function createProject(prefix = 'orca-scryer-cache-'): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), prefix))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    getProjectModelPath(projectPath),
    JSON.stringify({
      schemaVersion: 2,
      nodes: [],
      edges: [],
      startingLevel: 'system',
      sourceMap: {},
      refPositions: {},
      groups: [],
      flows: [],
      diagrams: [],
      diagramRefs: []
    })
  )
  return projectPath
}

async function cacheKeyForFx5(outputProfile: 'review' | 'thumbnail' | 'export') {
  const source = await readFile(fixturePath('valid-mermaid-flowchart.mmd'), 'utf8')
  return computeDiagramCacheKey({
    sourceHash: computeDiagramSourceHash(source),
    notation: 'mermaid',
    detectedKind: 'flowchart',
    theme: 'light',
    rendererVersion: 'mermaid@test|adapter@test|dompurify@test',
    outputProfile
  })
}

beforeEach(() => {
  invalidateAuthorizedRootsCache()
})

describe('diagram cache service', () => {
  it('writes and reads review SVG plus PNG profiles under the normalized model cache path', async () => {
    const projectPath = await createProject()
    const store = storeFor(projectPath)
    const reviewKey = await cacheKeyForFx5('review')
    const exportKey = await cacheKeyForFx5('export')

    await expect(
      writeDiagramCache(
        {
          projectPath,
          modelName: null,
          diagramId: 'diagram-cache-safe',
          cacheKey: reviewKey,
          outputProfile: 'review',
          svg: '<svg><text>safe</text></svg>'
        },
        store
      )
    ).resolves.toEqual({ ok: true })

    await expect(
      readDiagramCache(
        {
          projectPath,
          modelName: undefined,
          diagramId: 'diagram-cache-safe',
          cacheKey: reviewKey,
          outputProfile: 'review'
        },
        store
      )
    ).resolves.toEqual({
      ok: true,
      hit: true,
      outputProfile: 'review',
      svg: '<svg><text>safe</text></svg>'
    })

    await expect(
      writeDiagramCache(
        {
          projectPath,
          modelName: 'Product Model.scry',
          diagramId: 'diagram-cache-safe',
          cacheKey: exportKey,
          outputProfile: 'export',
          pngDataUrl: 'data:image/png;base64,AAAA'
        },
        store
      )
    ).resolves.toEqual({ ok: true })

    expect(
      existsSync(
        join(
          projectPath,
          '.scryer',
          'cache',
          'diagrams',
          'product-model',
          'diagram-cache-safe',
          `${exportKey.replace('sha256:', '')}.export.png.txt`
        )
      )
    ).toBe(true)
  })

  it('rejects unauthorized projects until the existing filesystem-auth worktree seam authorizes them', async () => {
    const projectPath = await createProject()
    const store = storeWithoutRepos()
    const cacheKey = await cacheKeyForFx5('review')

    await expect(
      writeDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey,
          outputProfile: 'review',
          svg: '<svg />'
        },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.unauthorized-project' })

    registerWorktreeRootsForRepo(storeFor(projectPath), 'repo-1', [projectPath])
    await expect(
      writeDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey,
          outputProfile: 'review',
          svg: '<svg />'
        },
        store
      )
    ).resolves.toEqual({ ok: true })
  })

  it('rejects malicious cache requests and leaves no partial payload files', async () => {
    const projectPath = await createProject()
    const store = storeFor(projectPath)
    const fixture = JSON.parse(await readFile(fixturePath('malicious-cache-requests.json'), 'utf8'))
    const validCacheKey = await cacheKeyForFx5('review')

    await expect(
      writeDiagramCache(
        { ...fixture.pathTraversalDiagramId, projectPath, cacheKey: validCacheKey },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.invalid-diagram-id' })
    await expect(
      readDiagramCache({ ...fixture.invalidCacheKey, projectPath }, store)
    ).resolves.toMatchObject({ ok: false, code: 'cache.invalid-cache-key' })
    await expect(
      writeDiagramCache(
        { ...fixture.emptyWritePayload, projectPath, cacheKey: validCacheKey },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.empty-payload' })
    await expect(
      writeDiagramCache(
        { ...fixture.payloadProfileMismatch, projectPath, cacheKey: validCacheKey },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.payload-profile-mismatch' })

    const oversizedSvg = `<svg>${'x'.repeat(MAX_DIAGRAM_CACHE_SVG_BYTES)}</svg>`
    await expect(
      writeDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey: validCacheKey,
          outputProfile: 'review',
          svg: oversizedSvg
        },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.payload-too-large' })

    const pngKey = await cacheKeyForFx5('thumbnail')
    const oversizedPng = `data:image/png;base64,${'a'.repeat(MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES)}`
    await expect(
      writeDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey: pngKey,
          outputProfile: 'thumbnail',
          pngDataUrl: oversizedPng
        },
        store
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.payload-too-large' })

    expect(JSON.stringify(await readFile(getProjectModelPath(projectPath), 'utf8'))).not.toContain(
      '<svg'
    )
  })

  it('returns read misses for missing or corrupt cache files and clears only the targeted cache scope', async () => {
    const projectPath = await createProject()
    const store = storeFor(projectPath)
    const reviewKey = await cacheKeyForFx5('review')
    const siblingKey = await cacheKeyForFx5('thumbnail')

    await expect(
      readDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey: reviewKey,
          outputProfile: 'review'
        },
        store
      )
    ).resolves.toEqual({ ok: true, hit: false, outputProfile: 'review', code: 'cache.read-miss' })

    await writeDiagramCache(
      {
        projectPath,
        diagramId: 'diagram-cache-safe',
        cacheKey: reviewKey,
        outputProfile: 'review',
        svg: '<svg />'
      },
      store
    )
    await writeDiagramCache(
      {
        projectPath,
        diagramId: 'diagram-sibling',
        cacheKey: siblingKey,
        outputProfile: 'thumbnail',
        pngDataUrl: 'data:image/png;base64,AAAA'
      },
      store
    )

    await expect(
      clearDiagramCache({ projectPath, diagramId: 'diagram-cache-safe' }, store)
    ).resolves.toEqual({ ok: true })
    await expect(
      readDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey: reviewKey,
          outputProfile: 'review'
        },
        store
      )
    ).resolves.toMatchObject({ ok: true, hit: false, code: 'cache.read-miss' })
    await expect(
      readDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-sibling',
          cacheKey: siblingKey,
          outputProfile: 'thumbnail'
        },
        store
      )
    ).resolves.toMatchObject({ ok: true, hit: true, pngDataUrl: 'data:image/png;base64,AAAA' })

    await expect(clearDiagramCache({ projectPath, modelName: null }, store)).resolves.toEqual({
      ok: true
    })
  })

  it('returns structured write and clear failures when filesystem operations fail', async () => {
    const projectPath = await createProject()
    const store = storeFor(projectPath)
    const cacheKey = await cacheKeyForFx5('review')

    await expect(
      writeDiagramCache(
        {
          projectPath,
          diagramId: 'diagram-cache-safe',
          cacheKey,
          outputProfile: 'review',
          svg: '<svg />'
        },
        store,
        {
          fs: {
            writeFile: vi.fn(async () => {
              throw new Error('disk full')
            })
          }
        }
      )
    ).resolves.toMatchObject({ ok: false, code: 'cache.write-failed' })

    await expect(
      clearDiagramCache({ projectPath, diagramId: 'diagram-cache-safe' }, store, {
        fs: {
          rm: vi.fn(async () => {
            throw new Error('permission denied')
          })
        }
      })
    ).resolves.toMatchObject({ ok: false, code: 'cache.clear-failed' })
  })
})
