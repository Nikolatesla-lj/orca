import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createScryerEngine } from './index'
import type { ScryModel } from './model'
import type { ScryerOperationContext } from './types'

const FINGERPRINT_FILES = ['model.scry', 'planned.scry', 'history.jsonl', 'model.baseline.scry']

function context(projectPath: string, requestId = 'req-structural'): ScryerOperationContext {
  return {
    requestId,
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath
  }
}

function structuralModel(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'crm', kind: 'system', name: 'CRM' },
      {
        id: 'api',
        kind: 'container',
        name: 'API',
        parentId: 'shop',
        responsibilities: [
          { id: 'resp-api', statement: 'Serves API traffic' },
          { id: 'resp-vagrant', statement: 'Maybe owns billing', vagrant: true }
        ]
      },
      { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' },
      {
        id: 'handler',
        kind: 'component',
        name: 'Handler',
        parentId: 'api',
        responsibilities: [{ id: 'resp-handler', statement: 'Handles requests' }]
      },
      {
        id: 'store',
        kind: 'component',
        name: 'Store',
        parentId: 'api',
        responsibilities: [{ id: 'resp-store', statement: 'Stores records' }]
      }
    ],
    links: [
      { id: 'link-handler-store', src: 'handler', dst: 'store', label: 'uses' },
      { id: 'link-web-api', src: 'web', dst: 'api', label: 'calls' }
    ],
    groups: [
      {
        id: 'group-shop',
        name: 'Shop containers',
        memberIds: ['api', 'web'],
        parentNodeId: 'shop'
      },
      {
        id: 'group-api',
        name: 'API components',
        memberIds: ['handler', 'store'],
        parentNodeId: 'api'
      }
    ],
    sourceMap: {
      api: [{ pattern: 'src/api.ts' }],
      'resp-api': [{ pattern: 'src/api.ts', line: 1 }],
      'resp-vagrant': [{ pattern: 'src/billing.ts', line: 2 }],
      handler: [{ pattern: 'src/handler.ts' }],
      'resp-handler': [{ pattern: 'src/handler.ts', line: 3 }],
      store: [{ pattern: 'src/store.ts' }],
      'resp-store': [{ pattern: 'src/store.ts', line: 4 }]
    },
    boundaries: {
      api: [{ pattern: 'src/api/**' }],
      handler: [{ pattern: 'src/handler/**' }]
    }
  }
}

function moveModel(withCrossLink = false): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'crm', kind: 'system', name: 'CRM' },
      { id: 'stripe', kind: 'system', name: 'Stripe', external: true },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
      { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' },
      { id: 'worker', kind: 'container', name: 'Worker', parentId: 'crm' }
    ],
    links: withCrossLink ? [{ id: 'link-web-api', src: 'web', dst: 'api', label: 'calls' }] : [],
    groups: [
      {
        id: 'group-shop',
        name: 'Shop containers',
        memberIds: ['api', 'web'],
        parentNodeId: 'shop'
      },
      { id: 'group-crm', name: 'CRM containers', memberIds: ['worker'], parentNodeId: 'crm' }
    ],
    sourceMap: {},
    boundaries: {}
  }
}

async function writeProject(model: ScryModel, options: { planned?: ScryModel | null } = {}) {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-structural-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(model, null, 2),
    'utf8'
  )
  if (options.planned !== null) {
    const planned = options.planned ?? model
    await writeFile(
      join(projectPath, '.scryer', 'planned.scry'),
      JSON.stringify(planned, null, 2),
      'utf8'
    )
  }
  await writeFile(join(projectPath, '.scryer', 'history.jsonl'), '{"event":"kept"}\n', 'utf8')
  await writeFile(
    join(projectPath, '.scryer', 'model.baseline.scry'),
    '{"baseline":"kept"}\n',
    'utf8'
  )
  return projectPath
}

async function readModelFile(projectPath: string, file: 'model.scry' | 'planned.scry') {
  return JSON.parse(await readFile(join(projectPath, '.scryer', file), 'utf8')) as ScryModel
}

async function fingerprint(projectPath: string) {
  const result: Record<string, string | null> = {}
  for (const file of FINGERPRINT_FILES) {
    const path = join(projectPath, '.scryer', file)
    result[file] = existsSync(path) ? await readFile(path, 'utf8') : null
  }
  return result
}

describe('#32 structural mutation operations', () => {
  it('sets a subtree under an existing root and cleans old descendants, links, groups, and source ownership', async () => {
    const projectPath = await writeProject(structuralModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.node.set-subtree',
      {
        node_id: 'api',
        data: {
          nodes: [
            { id: 'controller', kind: 'component', name: 'Controller', parentId: 'api' },
            { id: 'storage', kind: 'component', name: 'Storage', parentId: 'api' }
          ],
          links: [
            { id: 'link-controller-storage', src: 'controller', dst: 'storage', label: 'uses' }
          ]
        }
      },
      context(projectPath, 'req-set-subtree')
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.node.set-subtree',
      result: {
        rootId: 'api',
        addedNodeCount: 2,
        removedNodeCount: 2,
        addedLinkCount: 1,
        removedLinkCount: 1,
        groupCleanup: { removedGroupCount: 1 },
        recommendedNextReads: expect.arrayContaining([
          expect.objectContaining({ operationId: 'scryer.model.read' })
        ])
      }
    })
    const committed = await readModelFile(projectPath, 'model.scry')
    const planned = await readModelFile(projectPath, 'planned.scry')
    expect(committed.nodes.map((node) => node.id)).toContain('handler')
    expect(planned.nodes.map((node) => node.id)).toEqual([
      'shop',
      'crm',
      'api',
      'web',
      'controller',
      'storage'
    ])
    expect(planned.links).toEqual([
      { id: 'link-web-api', src: 'web', dst: 'api', label: 'calls' },
      { id: 'link-controller-storage', src: 'controller', dst: 'storage', label: 'uses' }
    ])
    expect(planned.groups).toEqual([
      { id: 'group-shop', name: 'Shop containers', memberIds: ['api', 'web'], parentNodeId: 'shop' }
    ])
    expect(planned.sourceMap).toEqual({
      api: [{ pattern: 'src/api.ts' }],
      'resp-api': [{ pattern: 'src/api.ts', line: 1 }],
      'resp-vagrant': [{ pattern: 'src/billing.ts', line: 2 }]
    })
    expect(planned.boundaries).toEqual({ api: [{ pattern: 'src/api/**' }] })
  })

  it('allows empty subtree clearing and no-op empty replacement without durable writes', async () => {
    const clearProject = await writeProject(structuralModel())
    const cleared = await createScryerEngine().executeOperation(
      'scryer.node.set-subtree',
      { node_id: 'api', data: { nodes: [] } },
      context(clearProject, 'req-clear-subtree')
    )
    expect(cleared).toMatchObject({
      ok: true,
      result: { removedNodeCount: 2, addedNodeCount: 0 }
    })
    expect(
      (await readModelFile(clearProject, 'planned.scry')).nodes.map((node) => node.id)
    ).toEqual(['shop', 'crm', 'api', 'web'])

    const noOpModel = { ...moveModel(), links: [], groups: [], sourceMap: {}, boundaries: {} }
    const noOpProject = await writeProject(noOpModel, { planned: null })
    const before = await fingerprint(noOpProject)
    const noOp = await createScryerEngine().executeOperation(
      'scryer.node.set-subtree',
      { node_id: 'api', data: { nodes: [] } },
      context(noOpProject, 'req-clear-noop')
    )
    expect(noOp).toMatchObject({
      ok: true,
      result: { addedNodeCount: 0, removedNodeCount: 0, findings: [{ severity: 'info' }] }
    })
    await expect(fingerprint(noOpProject)).resolves.toEqual(before)
  })

  it('hard-fails invalid set-subtree payloads atomically', async () => {
    const cases = [
      {
        name: 'root payload id',
        input: { node_id: 'api', data: { nodes: [{ id: 'api', kind: 'component', name: 'API' }] } }
      },
      {
        name: 'duplicate payload id',
        input: {
          node_id: 'api',
          data: {
            nodes: [
              { id: 'dup', kind: 'component', name: 'Dup', parentId: 'api' },
              { id: 'dup', kind: 'component', name: 'Dup 2', parentId: 'api' }
            ]
          }
        }
      },
      {
        name: 'external identity collision',
        input: { node_id: 'api', data: { nodes: [{ id: 'web', kind: 'component', name: 'Web' }] } }
      },
      {
        name: 'missing link endpoint',
        input: {
          node_id: 'api',
          data: {
            nodes: [{ id: 'controller', kind: 'component', name: 'Controller', parentId: 'api' }],
            links: [{ id: 'link-missing', src: 'controller', dst: 'missing', label: 'calls' }]
          }
        }
      },
      {
        name: 'external-only link',
        input: {
          node_id: 'api',
          data: {
            nodes: [{ id: 'controller', kind: 'component', name: 'Controller', parentId: 'api' }],
            links: [{ id: 'link-web-crm', src: 'web', dst: 'crm', label: 'calls' }]
          }
        }
      },
      {
        name: 'illegal topology',
        input: {
          node_id: 'api',
          data: {
            nodes: [{ id: 'controller', kind: 'component', name: 'Controller', parentId: 'api' }],
            links: [{ id: 'link-api-controller', src: 'api', dst: 'controller', label: 'contains' }]
          }
        }
      }
    ]

    for (const item of cases) {
      const projectPath = await writeProject(structuralModel())
      const before = await fingerprint(projectPath)
      const result = await createScryerEngine().executeOperation(
        'scryer.node.set-subtree',
        item.input,
        context(projectPath, `req-set-subtree-${item.name}`)
      )
      expect(result, item.name).toMatchObject({
        ok: false,
        operationId: 'scryer.node.set-subtree',
        error: { code: 'validation_failed' }
      })
      await expect(fingerprint(projectPath)).resolves.toEqual(before)
    }

    const malformedProject = await writeProject(structuralModel())
    const malformed = await createScryerEngine().executeOperation(
      'scryer.node.set-subtree',
      { node_id: 'api', data: { nodes: [], sourceMap: {} } },
      context(malformedProject, 'req-set-subtree-malformed')
    )
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'invalid_input', fieldErrors: [expect.objectContaining({ path: 'data' })] }
    })

    const missingRoot = await createScryerEngine().executeOperation(
      'scryer.node.set-subtree',
      { node_id: 'missing', data: { nodes: [] } },
      context(malformedProject, 'req-set-subtree-missing')
    )
    expect(missingRoot).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('moves node subtrees, validates final candidates, cleans old groups, and avoids target auto-join', async () => {
    const projectPath = await writeProject(moveModel())
    const result = await createScryerEngine().executeOperation(
      'scryer.node.move',
      { moves: [{ node_id: 'api', new_parent_id: 'crm' }] },
      context(projectPath, 'req-node-move')
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.node.move',
      result: {
        moved: [{ nodeId: 'api', fromParentId: 'shop', toParentId: 'crm' }],
        groupCleanup: { updatedGroupCount: 1, removedMembershipCount: 1 }
      }
    })
    const committed = await readModelFile(projectPath, 'model.scry')
    const planned = await readModelFile(projectPath, 'planned.scry')
    expect(committed.nodes.find((node) => node.id === 'api')?.parentId).toBe('shop')
    expect(planned.nodes.find((node) => node.id === 'api')?.parentId).toBe('crm')
    expect(planned.groups).toEqual([
      { id: 'group-shop', name: 'Shop containers', memberIds: ['web'], parentNodeId: 'shop' },
      { id: 'group-crm', name: 'CRM containers', memberIds: ['worker'], parentNodeId: 'crm' }
    ])
  })

  it('rejects invalid node moves before writing', async () => {
    const cases = [
      { input: { moves: [{ node_id: 'api', new_parent_id: null }] }, code: 'validation_failed' },
      { input: { moves: [{ node_id: 'api', new_parent_id: 'missing' }] }, code: 'not_found' },
      {
        input: { moves: [{ node_id: 'api', new_parent_id: 'stripe' }] },
        code: 'validation_failed'
      },
      {
        input: { moves: [{ node_id: 'api', new_parent_id: 'api' }] },
        code: 'validation_failed'
      },
      {
        input: {
          moves: [
            { node_id: 'api', new_parent_id: 'crm' },
            { node_id: 'api', new_parent_id: 'shop' }
          ]
        },
        code: 'validation_failed'
      }
    ]
    for (const item of cases) {
      const projectPath = await writeProject(moveModel())
      const before = await fingerprint(projectPath)
      const result = await createScryerEngine().executeOperation(
        'scryer.node.move',
        item.input,
        context(projectPath, `req-node-move-${item.code}`)
      )
      expect(result).toMatchObject({ ok: false, error: { code: item.code } })
      await expect(fingerprint(projectPath)).resolves.toEqual(before)
    }

    const illegalLinkProject = await writeProject(moveModel(true))
    const illegalLink = await createScryerEngine().executeOperation(
      'scryer.node.move',
      { moves: [{ node_id: 'api', new_parent_id: 'crm' }] },
      context(illegalLinkProject, 'req-node-move-illegal-link')
    )
    expect(illegalLink).toMatchObject({ ok: false, error: { code: 'validation_failed' } })
  })

  it('treats no-op node moves as successful no-write requests', async () => {
    const projectPath = await writeProject(moveModel(), { planned: null })
    const before = await fingerprint(projectPath)
    const result = await createScryerEngine().executeOperation(
      'scryer.node.move',
      { moves: [{ node_id: 'api', new_parent_id: 'shop' }] },
      context(projectPath, 'req-node-move-noop')
    )

    expect(result).toMatchObject({
      ok: true,
      result: { moved: [], findings: [{ code: 'no_op', severity: 'info' }] }
    })
    await expect(fingerprint(projectPath)).resolves.toEqual(before)
  })

  it('moves node-owned responsibilities while preserving id-keyed source anchors', async () => {
    const projectPath = await writeProject(structuralModel())
    const result = await createScryerEngine().executeOperation(
      'scryer.responsibility.move',
      { moves: [{ responsibility_id: 'resp-api', from_node_id: 'api', to_node_id: 'web' }] },
      context(projectPath, 'req-responsibility-move')
    )

    expect(result).toMatchObject({
      ok: true,
      result: { moved: [{ responsibilityId: 'resp-api', fromNodeId: 'api', toNodeId: 'web' }] }
    })
    const planned = await readModelFile(projectPath, 'planned.scry')
    expect(
      planned.nodes.find((node) => node.id === 'api')?.responsibilities?.map((item) => item.id)
    ).toEqual(['resp-vagrant'])
    expect(planned.nodes.find((node) => node.id === 'web')?.responsibilities).toContainEqual({
      id: 'resp-api',
      statement: 'Serves API traffic'
    })
    expect(planned.sourceMap['resp-api']).toEqual([{ pattern: 'src/api.ts', line: 1 }])
  })

  it('rejects unsupported responsibility moves and no-ops without writes', async () => {
    const vagrantProject = await writeProject(structuralModel())
    const beforeVagrant = await fingerprint(vagrantProject)
    const vagrant = await createScryerEngine().executeOperation(
      'scryer.responsibility.move',
      { moves: [{ responsibility_id: 'resp-vagrant', from_node_id: 'api', to_node_id: 'web' }] },
      context(vagrantProject, 'req-responsibility-vagrant')
    )
    expect(vagrant).toMatchObject({ ok: false, error: { code: 'validation_failed' } })
    await expect(fingerprint(vagrantProject)).resolves.toEqual(beforeVagrant)

    const groupOwnedModel = structuralModel()
    groupOwnedModel.groups[0]!.responsibilities = [{ id: 'resp-group', statement: 'Groups work' }]
    const groupOwnedProject = await writeProject(groupOwnedModel)
    const groupOwned = await createScryerEngine().executeOperation(
      'scryer.responsibility.move',
      { moves: [{ responsibility_id: 'resp-group', from_node_id: 'api', to_node_id: 'web' }] },
      context(groupOwnedProject, 'req-responsibility-group')
    )
    expect(groupOwned).toMatchObject({ ok: false, error: { code: 'validation_failed' } })

    const missingProject = await writeProject(structuralModel())
    await expect(
      createScryerEngine().executeOperation(
        'scryer.responsibility.move',
        { moves: [{ responsibility_id: 'missing', from_node_id: 'api', to_node_id: 'web' }] },
        context(missingProject, 'req-responsibility-missing')
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'not_found' } })
    await expect(
      createScryerEngine().executeOperation(
        'scryer.responsibility.move',
        { moves: [{ responsibility_id: 'resp-api', from_node_id: 'missing', to_node_id: 'web' }] },
        context(missingProject, 'req-responsibility-missing-source')
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'not_found' } })
    await expect(
      createScryerEngine().executeOperation(
        'scryer.responsibility.move',
        { moves: [{ responsibility_id: 'resp-api', from_node_id: 'api', to_node_id: 'missing' }] },
        context(missingProject, 'req-responsibility-missing-destination')
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'not_found' } })

    const noOpProject = await writeProject(structuralModel(), { planned: null })
    const beforeNoOp = await fingerprint(noOpProject)
    const noOp = await createScryerEngine().executeOperation(
      'scryer.responsibility.move',
      { moves: [{ responsibility_id: 'resp-api', from_node_id: 'api', to_node_id: 'api' }] },
      context(noOpProject, 'req-responsibility-noop')
    )
    expect(noOp).toMatchObject({
      ok: true,
      result: { moved: [], findings: [{ code: 'no_op', severity: 'info' }] }
    })
    await expect(fingerprint(noOpProject)).resolves.toEqual(beforeNoOp)
  })

  it('descopes planned model nodes as code-unchanged model corrections', async () => {
    const projectPath = await writeProject(structuralModel())
    const result = await createScryerEngine().executeOperation(
      'scryer.node.descope',
      { node_ids: ['api'] },
      context(projectPath, 'req-node-descope')
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.node.descope',
      result: {
        descopedCount: 1,
        relocatedResponsibilityCount: 1,
        droppedResponsibilityCount: 3,
        removedLinkCount: 2,
        modelCorrection: true,
        codeAction: 'code_unchanged',
        pendingReason: 'model_correction_code_unchanged'
      }
    })
    const committed = await readModelFile(projectPath, 'model.scry')
    const planned = await readModelFile(projectPath, 'planned.scry')
    expect(committed.nodes.map((node) => node.id)).toContain('api')
    expect(planned.nodes.map((node) => node.id)).toEqual(['shop', 'crm', 'web'])
    expect(planned.nodes.find((node) => node.id === 'shop')?.responsibilities).toEqual([
      { id: 'resp-api', statement: 'Serves API traffic' }
    ])
    expect(planned.links).toEqual([])
    expect(planned.groups).toEqual([
      { id: 'group-shop', name: 'Shop containers', memberIds: ['web'], parentNodeId: 'shop' }
    ])
    expect(planned.sourceMap).toEqual({ 'resp-api': [{ pattern: 'src/api.ts', line: 1 }] })
    expect(planned.boundaries).toEqual({})
  })

  it('rejects missing and top-level descopes before writing', async () => {
    const projectPath = await writeProject(structuralModel())
    const before = await fingerprint(projectPath)

    await expect(
      createScryerEngine().executeOperation(
        'scryer.node.descope',
        { node_ids: ['missing'] },
        context(projectPath, 'req-descope-missing')
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'not_found' } })
    await expect(
      createScryerEngine().executeOperation(
        'scryer.node.descope',
        { node_ids: ['shop'] },
        context(projectPath, 'req-descope-top-level')
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'validation_failed' } })
    await expect(fingerprint(projectPath)).resolves.toEqual(before)
  })
})
