import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createScryerEngine } from './index'
import type { ScryerOperationContext } from './types'

function testContext(projectPath: string): ScryerOperationContext {
  return {
    requestId: 'req-node-update',
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath
  }
}

async function writeModel(projectPath: string, model: unknown): Promise<void> {
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(model, null, 2),
    'utf8'
  )
}

describe('scryer.node.update', () => {
  it('writes node patches to planned state and leaves committed state unchanged', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-engine-node-update-'))
    await writeModel(projectPath, {
      version: '0.3',
      nodes: [{ id: 'api', kind: 'system', name: 'API', responsibilities: [] }],
      links: [],
      groups: [],
      sourceMap: { api: [{ pattern: 'src/api.ts', line: 10, endLine: 20 }] },
      boundaries: { api: [{ pattern: 'src/api/**/*.ts', comment: 'API container sources' }] }
    })

    const result = await createScryerEngine().executeOperation(
      'scryer.node.update',
      {
        nodes: [
          {
            node_id: 'api',
            name: 'Public API',
            responsibilities: [{ id: 'resp-1', statement: 'serves user requests' }]
          }
        ]
      },
      testContext(projectPath)
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.node.update',
      requestId: 'req-node-update',
      result: {
        updatedCount: 1,
        pendingSummary: { total: 2 }
      }
    })

    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(committed.nodes[0].name).toBe('API')
    expect(committed.nodes[0].responsibilities).toEqual([])
    expect(planned.nodes[0].name).toBe('Public API')
    expect(planned.nodes[0].responsibilities).toEqual([
      { id: 'resp-1', statement: 'serves user requests' }
    ])
    expect(planned.sourceMap).toEqual({})
    expect(planned.boundaries).toEqual({})
  })

  it('returns lock_busy when another writer owns the model lock', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-engine-node-lock-'))
    await writeModel(projectPath, {
      version: '0.3',
      nodes: [{ id: 'api', kind: 'system', name: 'API' }],
      links: [],
      groups: [],
      sourceMap: {},
      boundaries: {}
    })
    await writeFile(join(projectPath, '.scryer', '.lock'), 'held', 'utf8')

    const result = await createScryerEngine().executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Public API' }] },
      testContext(projectPath)
    )

    expect(result).toMatchObject({
      ok: false,
      operationId: 'scryer.node.update',
      requestId: 'req-node-update',
      error: {
        code: 'lock_busy',
        retryable: true
      }
    })
  })
})
