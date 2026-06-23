import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createScryerEngine } from './index'
import type { ScryerOperationContext } from './types'

function testContext(projectPath: string, requestId = 'req-link'): ScryerOperationContext {
  return {
    requestId,
    transport: 'test',
    caller: 'test',
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

describe('scryer link operations', () => {
  it('adds same-level links to planned state without changing committed state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-engine-link-add-'))
    await writeModel(projectPath, {
      version: '0.3',
      nodes: [
        { id: 'shop', kind: 'system', name: 'Shop' },
        { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' },
        { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
      ],
      links: [],
      groups: [],
      sourceMap: {},
      boundaries: {}
    })

    const result = await createScryerEngine().executeOperation(
      'scryer.link.add',
      { links: [{ src: 'web', dst: 'api', label: 'calls', method: 'HTTP' }] },
      testContext(projectPath)
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.link.add',
      result: {
        added: ['link-web-api'],
        pendingSummary: { total: 1 }
      }
    })

    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(committed.links).toEqual([])
    expect(planned.links).toEqual([
      { id: 'link-web-api', src: 'web', dst: 'api', label: 'calls', method: 'HTTP' }
    ])
  })

  it('rejects containment links before writing planned state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-engine-link-illegal-'))
    await writeModel(projectPath, {
      version: '0.3',
      nodes: [
        { id: 'shop', kind: 'system', name: 'Shop' },
        { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
      ],
      links: [],
      groups: [],
      sourceMap: {},
      boundaries: {}
    })

    const result = await createScryerEngine().executeOperation(
      'scryer.link.add',
      { links: [{ src: 'shop', dst: 'api', label: 'contains' }] },
      testContext(projectPath, 'req-link-illegal')
    )

    expect(result).toMatchObject({
      ok: false,
      operationId: 'scryer.link.add',
      requestId: 'req-link-illegal',
      error: {
        code: 'illegal_link',
        retryable: false
      }
    })
    await expect(readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8')).rejects.toThrow()
  })

  it('deletes links from planned state and reports missing ids', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-engine-link-delete-'))
    await writeModel(projectPath, {
      version: '0.3',
      nodes: [
        { id: 'shop', kind: 'system', name: 'Shop' },
        { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' },
        { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
      ],
      links: [{ id: 'link-web-api', src: 'web', dst: 'api', label: 'calls' }],
      groups: [],
      sourceMap: {},
      boundaries: {}
    })

    const result = await createScryerEngine().executeOperation(
      'scryer.link.delete',
      { link_ids: ['link-web-api', 'missing-link'] },
      testContext(projectPath, 'req-link-delete')
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.link.delete',
      requestId: 'req-link-delete',
      result: {
        deleted: 1,
        missing: ['missing-link'],
        pendingSummary: { total: 1, toDelete: 1 }
      }
    })

    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(committed.links).toHaveLength(1)
    expect(planned.links).toEqual([])
  })
})
