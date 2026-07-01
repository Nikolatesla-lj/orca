import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createDefaultScryerOperationCatalog } from './catalog'
import { createScryerEngine, createScryerStateStore } from './index'
import type { ScryModel } from './model'
import { operationSchemas } from './schemas'
import type { ScryerModelHealthResult, ScryerOperationContext } from './types'

function context(projectPath: string, requestId = 'req-33'): ScryerOperationContext {
  return {
    requestId,
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath
  }
}

function healthModel(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      {
        id: 'customer',
        kind: 'person',
        name: 'Customer',
        responsibilities: [{ id: 'resp-customer', statement: 'Places orders', lastTouchedAt: 2 }]
      },
      {
        id: 'stripe',
        kind: 'system',
        name: 'Stripe',
        external: true,
        responsibilities: [{ id: 'resp-stripe', statement: 'Processes cards', lastTouchedAt: 3 }]
      },
      {
        id: 'shop',
        kind: 'system',
        name: 'Shop',
        responsibilities: [{ id: 'resp-shop', statement: 'Runs commerce', lastTouchedAt: 1 }]
      },
      {
        id: 'api',
        kind: 'container',
        name: 'API',
        parentId: 'shop',
        responsibilities: [{ id: 'resp-api', statement: 'Serves API', lastTouchedAt: 4 }]
      },
      {
        id: 'orders',
        kind: 'component',
        name: 'Orders',
        parentId: 'api',
        responsibilities: [{ id: 'resp-orders', statement: 'Coordinates orders', lastTouchedAt: 5 }]
      },
      {
        id: 'handler',
        kind: 'symbol',
        name: 'handleOrder',
        parentId: 'orders',
        responsibilities: [
          { id: 'resp-handler', statement: 'Handles order requests', lastTouchedAt: 10 },
          {
            id: 'resp-vagrant',
            statement: 'Retries webhook delivery',
            vagrant: true,
            lastTouchedAt: 15
          },
          {
            id: 'resp-stale',
            statement: 'Sends legacy emails',
            stale: true,
            lastTouchedAt: 20
          }
        ],
        properties: [
          { label: 'orderId', description: 'Order identifier', lastTouchedAt: 11 },
          {
            label: 'legacyEmail',
            description: 'Legacy email address',
            stale: true,
            lastTouchedAt: 12
          }
        ]
      },
      {
        id: 'repo',
        kind: 'symbol',
        name: 'loadOrder',
        parentId: 'orders',
        responsibilities: [{ id: 'resp-repo', statement: 'Loads orders', lastTouchedAt: 30 }]
      }
    ],
    links: [],
    groups: [
      {
        id: 'group-api',
        name: 'API Group',
        memberIds: ['orders'],
        parentNodeId: 'api',
        responsibilities: [{ id: 'resp-group', statement: 'Organizes API work', lastTouchedAt: 50 }]
      }
    ],
    sourceMap: {
      'resp-handler': [{ pattern: 'src/api/orders/handler.ts' }],
      'resp-stale': [{ pattern: 'src/api/orders/stale.ts' }],
      handler: [{ pattern: 'src/api/orders/types.ts' }]
    },
    boundaries: { api: [{ pattern: 'src/api/**/*.ts' }] }
  }
}

function driftModel(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
      {
        id: 'orders',
        kind: 'component',
        name: 'Orders',
        parentId: 'api',
        responsibilities: [{ id: 'resp-old', statement: 'Charges cards' }]
      },
      {
        id: 'handler',
        kind: 'symbol',
        name: 'handleOrder',
        parentId: 'orders',
        properties: [{ label: 'id', description: 'Order id' }]
      }
    ],
    links: [],
    groups: [],
    sourceMap: { handler: [{ pattern: 'src/orders.ts', symbol: 'Order' }] },
    boundaries: { api: [{ pattern: 'src/**/*.ts' }] }
  }
}

async function writeProject(model: ScryModel, options: { planned?: boolean } = {}) {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-33-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await mkdir(join(projectPath, 'src', 'api', 'orders'), { recursive: true })
  await writeFile(join(projectPath, 'src', 'api', 'orders', 'handler.ts'), 'handler\n', 'utf8')
  await writeFile(join(projectPath, 'src', 'api', 'orders', 'stale.ts'), 'stale\n', 'utf8')
  await writeFile(join(projectPath, 'src', 'api', 'orders', 'types.ts'), 'types\n', 'utf8')
  await writeFile(join(projectPath, 'src', 'api', 'orders', 'dark.ts'), 'dark\n', 'utf8')
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(model, null, 2),
    'utf8'
  )
  if (options.planned) {
    await writeFile(
      join(projectPath, '.scryer', 'planned.scry'),
      JSON.stringify(model, null, 2),
      'utf8'
    )
  }
  return projectPath
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function maybeRead(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, 'utf8') : null
}

async function scryerFingerprint(projectPath: string) {
  const dir = join(projectPath, '.scryer')
  const files = [
    'model.scry',
    'planned.scry',
    'history.jsonl',
    '.sync.json',
    '.anchors.baseline.json'
  ]
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await maybeRead(join(dir, file))]))
  )
}

describe('Decision #33 health report operation', () => {
  it('returns a whole-model upstream-shaped golden report', async () => {
    const projectPath = await writeProject(healthModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.model.health',
      {},
      context(projectPath, 'health-whole')
    )

    expect(result).toMatchObject({
      ok: true,
      result: {
        totals: {
          responsibilities: 10,
          properties: 2,
          vagrant: 1,
          stale: 2,
          anchorable: 5,
          anchored: 3,
          unmapped: 2,
          lastTouchedAt: 50
        },
        nodes: {
          shop: { own: { anchorable: 0, unmapped: 0 }, subtree: { responsibilities: 8 } },
          api: {
            subtree: {
              responsibilities: 7,
              properties: 2,
              vagrant: 1,
              stale: 2,
              anchorable: 5,
              anchored: 3,
              unmapped: 2,
              lastTouchedAt: 50
            },
            boundary: {
              totalFiles: 4,
              anchoredFiles: 3,
              darkFiles: ['src/api/orders/dark.ts']
            }
          },
          customer: { own: { anchorable: 0, unmapped: 0 } },
          stripe: { own: { anchorable: 0, unmapped: 0 } },
          handler: { own: { responsibilities: 3, properties: 2, anchorable: 4, anchored: 3 } }
        }
      }
    })
  })

  it('scopes a health report to an existing node subtree', async () => {
    const projectPath = await writeProject(healthModel())

    const result = await createScryerEngine().executeOperation<ScryerModelHealthResult>(
      'scryer.model.health',
      { node_id: 'api' },
      context(projectPath, 'health-scoped')
    )

    expect(result).toMatchObject({
      ok: true,
      result: {
        totals: {
          responsibilities: 7,
          properties: 2,
          vagrant: 1,
          stale: 2,
          anchorable: 5,
          anchored: 3,
          unmapped: 2,
          lastTouchedAt: 50
        }
      }
    })
    expect(Object.keys(result.ok ? result.result.nodes : {})).toEqual([
      'api',
      'orders',
      'handler',
      'repo'
    ])
  })

  it('returns not_found for a missing scoped node', async () => {
    const projectPath = await writeProject(healthModel())

    await expect(
      createScryerEngine().executeOperation(
        'scryer.model.health',
        { node_id: 'missing' },
        context(projectPath, 'health-missing')
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'not_found', details: { entity: 'node', id: 'missing' } }
    })
  })

  it('does not change model.scry or planned.scry when maintenance writes are allowed', async () => {
    const projectPath = await writeProject(healthModel(), { planned: true })
    const before = await scryerFingerprint(projectPath)

    const result = await createScryerEngine().executeOperation(
      'scryer.model.health',
      {},
      context(projectPath, 'health-maintenance')
    )
    const after = await scryerFingerprint(projectPath)

    expect(result).toMatchObject({ ok: true })
    expect(after['model.scry']).toEqual(before['model.scry'])
    expect(after['planned.scry']).toEqual(before['planned.scry'])
    expect(after['history.jsonl']).toEqual(before['history.jsonl'])
    expect(after['.sync.json']).not.toEqual(before['.sync.json'])
    expect(after['.anchors.baseline.json']).not.toEqual(before['.anchors.baseline.json'])
  })

  it('keeps success and surfaces a warning when maintenance write fails', async () => {
    const projectPath = await writeProject(healthModel(), { planned: true })
    const before = await scryerFingerprint(projectPath)
    const engine = createScryerEngine({
      stateStore: createScryerStateStore({ test: { failBestEffortTarget: 'sync' } })
    })

    const result = await engine.executeOperation(
      'scryer.model.health',
      {},
      context(projectPath, 'health-maintenance-warning')
    )
    const after = await scryerFingerprint(projectPath)

    expect(result).toMatchObject({
      ok: true,
      meta: { warnings: [expect.objectContaining({ target: 'sync' })] }
    })
    expect(after['model.scry']).toEqual(before['model.scry'])
    expect(after['planned.scry']).toEqual(before['planned.scry'])
    expect(after['.sync.json']).toEqual(before['.sync.json'])
    expect(after['.anchors.baseline.json']).not.toEqual(before['.anchors.baseline.json'])
  })
})

describe('Decision #33 drift.flag operation', () => {
  it('records a vagrant responsibility in planned state only', async () => {
    const projectPath = await writeProject(driftModel())
    const beforeCommitted = await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        undescribed: [
          {
            node_id: 'orders',
            statement: 'Cancels stale orders',
            source_file: 'src/orders.ts',
            symbol: 'cancelOrder'
          }
        ]
      },
      context(projectPath, 'drift-vagrant-resp')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))
    const added = planned.nodes
      .find((node) => node.id === 'orders')!
      .responsibilities!.find(
        (responsibility) => responsibility.statement === 'Cancels stale orders'
      )!

    expect(result).toMatchObject({
      ok: true,
      result: {
        flagged: 1,
        vagrantResponsibilities: [
          { nodeId: 'orders', responsibilityId: added.id, statement: 'Cancels stale orders' }
        ]
      }
    })
    expect(added.vagrant).toBe(true)
    expect(planned.sourceMap[added.id]).toEqual([
      { pattern: 'src/orders.ts', symbol: 'cancelOrder' }
    ])
    expect(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')).toEqual(
      beforeCommitted
    )
    await expect(
      readFile(join(projectPath, '.scryer', 'history.jsonl'), 'utf8')
    ).resolves.toContain('"type":"drift.flag"')
  })

  it('mints a new-node chain with shared ids and attaches verdicts by node_key', async () => {
    const projectPath = await writeProject(driftModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        new_nodes: [
          { key: 'checkout', kind: 'component', name: 'Checkout', parent_id: 'api' },
          { key: 'submit', kind: 'symbol', name: 'submitCheckout', parent_key: 'checkout' }
        ],
        undescribed: [
          {
            node_key: 'submit',
            statement: 'Submits checkout requests',
            source_file: 'src/checkout.ts'
          }
        ]
      },
      context(projectPath, 'drift-new-node-chain')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))

    expect(result).toMatchObject({
      ok: true,
      result: {
        mintedNodes: { checkout: 'node-1', submit: 'node-2' },
        flagged: 3
      }
    })
    expect(planned.nodes.find((node) => node.id === 'node-1')).toMatchObject({
      kind: 'component',
      parentId: 'api',
      vagrant: true
    })
    expect(planned.nodes.find((node) => node.id === 'node-2')).toMatchObject({
      kind: 'symbol',
      parentId: 'node-1',
      vagrant: true,
      responsibilities: [expect.objectContaining({ statement: 'Submits checkout requests' })]
    })
  })

  it('records vagrant properties and reports skipped existing property labels', async () => {
    const projectPath = await writeProject(driftModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        undescribed_properties: [
          {
            node_id: 'handler',
            label: 'email',
            description: 'Customer email',
            source_file: 'src/orders.ts',
            symbol: 'Order'
          },
          {
            node_id: 'handler',
            label: 'phone',
            description: 'Customer phone',
            source_file: 'src/phone.ts',
            symbol: 'OrderPhone'
          },
          { node_id: 'handler', label: 'id', source_file: 'src/orders.ts', symbol: 'Order' }
        ]
      },
      context(projectPath, 'drift-vagrant-property')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))
    const handler = planned.nodes.find((node) => node.id === 'handler')!

    expect(result).toMatchObject({
      ok: true,
      result: {
        flagged: 2,
        vagrantProperties: [
          { nodeId: 'handler', label: 'email' },
          { nodeId: 'handler', label: 'phone' }
        ],
        skippedExistingProperties: [{ nodeId: 'handler', label: 'id' }]
      }
    })
    expect(handler.properties).toEqual([
      { label: 'id', description: 'Order id' },
      { label: 'email', description: 'Customer email', vagrant: true },
      { label: 'phone', description: 'Customer phone', vagrant: true }
    ])
    expect(planned.sourceMap.handler).toEqual([
      { pattern: 'src/orders.ts', symbol: 'Order' },
      { pattern: 'src/phone.ts', symbol: 'OrderPhone' }
    ])
  })

  it('marks stale responsibilities with staleProposal without changing statement', async () => {
    const projectPath = await writeProject(driftModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        stale: [
          {
            responsibility_id: 'resp-old',
            proposedStatement: 'Authorizes cards',
            reason: 'behavior diverged'
          }
        ]
      },
      context(projectPath, 'drift-stale-resp')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))
    const committed = await readJson<ScryModel>(join(projectPath, '.scryer', 'model.scry'))
    const plannedResp = planned.nodes[2].responsibilities![0]
    const committedResp = committed.nodes[2].responsibilities![0]

    expect(result).toMatchObject({
      ok: true,
      result: {
        staleResponsibilities: [{ responsibilityId: 'resp-old', staleProposal: 'Authorizes cards' }]
      }
    })
    expect(plannedResp).toMatchObject({
      id: 'resp-old',
      statement: 'Charges cards',
      stale: true,
      staleProposal: 'Authorizes cards'
    })
    expect(committedResp).toEqual({ id: 'resp-old', statement: 'Charges cards' })
  })

  it('marks stale properties by node_id and label', async () => {
    const projectPath = await writeProject(driftModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        stale_properties: [{ node_id: 'handler', label: 'id', reason: 'removed field' }]
      },
      context(projectPath, 'drift-stale-property')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))

    expect(result).toMatchObject({
      ok: true,
      result: { staleProperties: [{ nodeId: 'handler', label: 'id' }] }
    })
    expect(planned.nodes.find((node) => node.id === 'handler')!.properties![0]).toMatchObject({
      label: 'id',
      stale: true
    })
  })

  it('marks only the target stale node and not descendants', async () => {
    const projectPath = await writeProject(driftModel())

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      { node_id: 'api', stale_nodes: [{ node_id: 'orders', reason: 'folder removed' }] },
      context(projectPath, 'drift-stale-node')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))

    expect(result).toMatchObject({
      ok: true,
      result: { staleNodes: [{ nodeId: 'orders' }] }
    })
    expect(planned.nodes.find((node) => node.id === 'orders')!.stale).toBe(true)
    expect(planned.nodes.find((node) => node.id === 'handler')!.stale).toBeUndefined()
  })

  it('fails invalid references atomically with no partial planned write', async () => {
    const projectPath = await writeProject(driftModel())
    const before = await scryerFingerprint(projectPath)

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        undescribed: [{ node_id: 'orders', statement: 'Would be partial' }],
        stale_properties: [{ node_id: 'handler', label: 'missing' }]
      },
      context(projectPath, 'drift-atomic-failure')
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'not_found', details: { entity: 'property', id: 'handler.missing' } }
    })
    await expect(scryerFingerprint(projectPath)).resolves.toEqual(before)
  })

  it('does not advance reconcile anchors while recording verdicts', async () => {
    const projectPath = await writeProject(driftModel())
    await writeFile(join(projectPath, '.scryer', '.sync.json'), '{"reconciledAt":"kept"}\n', 'utf8')
    await writeFile(
      join(projectPath, '.scryer', '.anchors.baseline.json'),
      '{"anchors":"kept"}\n',
      'utf8'
    )
    const beforeSync = await readFile(join(projectPath, '.scryer', '.sync.json'), 'utf8')
    const beforeAnchors = await readFile(
      join(projectPath, '.scryer', '.anchors.baseline.json'),
      'utf8'
    )

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      { node_id: 'api', stale_nodes: [{ node_id: 'orders' }] },
      context(projectPath, 'drift-no-anchor')
    )

    expect(result).toMatchObject({ ok: true })
    await expect(readFile(join(projectPath, '.scryer', '.sync.json'), 'utf8')).resolves.toEqual(
      beforeSync
    )
    await expect(
      readFile(join(projectPath, '.scryer', '.anchors.baseline.json'), 'utf8')
    ).resolves.toEqual(beforeAnchors)
  })

  it('treats empty verdict arrays as no-op success with no planned or history write', async () => {
    const projectPath = await writeProject(driftModel())
    const before = await scryerFingerprint(projectPath)

    const result = await createScryerEngine().executeOperation(
      'scryer.drift.flag',
      {
        node_id: 'api',
        undescribed: [],
        new_nodes: [],
        undescribed_properties: [],
        stale: [],
        stale_properties: [],
        stale_nodes: []
      },
      context(projectPath, 'drift-noop')
    )

    expect(result).toMatchObject({ ok: true, result: { flagged: 0, mintedNodes: {} } })
    await expect(scryerFingerprint(projectPath)).resolves.toEqual(before)
  })

  it('keeps planned verdict write when history append fails best-effort', async () => {
    const projectPath = await writeProject(driftModel())
    const engine = createScryerEngine({
      stateStore: createScryerStateStore({ test: { failBestEffortTarget: 'history' } })
    })

    const result = await engine.executeOperation(
      'scryer.drift.flag',
      { node_id: 'api', stale_nodes: [{ node_id: 'orders' }] },
      context(projectPath, 'drift-history-warning')
    )
    const planned = await readJson<ScryModel>(join(projectPath, '.scryer', 'planned.scry'))

    expect(result).toMatchObject({
      ok: true,
      meta: { warnings: [expect.objectContaining({ target: 'history' })] }
    })
    expect(planned.nodes.find((node) => node.id === 'orders')!.stale).toBe(true)
  })
})

describe('Decision #33 release gate checks', () => {
  it('uses strict success schemas and executes health and drift.flag through the generic pipeline', async () => {
    const projectPath = await writeProject(driftModel())
    const catalog = createDefaultScryerOperationCatalog()

    for (const operationId of ['scryer.model.health', 'scryer.drift.flag'] as const) {
      const contract = catalog.getOperationContract(operationId)
      expect(contract).toBeTruthy()
      expect(String(contract!.execute)).not.toContain('registered but not implemented')
      expect(contract!.successSchema).toBe(operationSchemas[operationId].success)
      expect(contract!.successSchema.safeParse({ arbitrary: 'generic-record' }).success).toBe(false)
    }

    await expect(
      createScryerEngine().executeOperation(
        'scryer.model.health',
        {},
        context(projectPath, 'generic-health')
      )
    ).resolves.toMatchObject({ ok: true, operationId: 'scryer.model.health' })
    await expect(
      createScryerEngine().executeOperation(
        'scryer.drift.flag',
        { node_id: 'api', stale_nodes: [] },
        context(projectPath, 'generic-drift-flag')
      )
    ).resolves.toMatchObject({ ok: true, operationId: 'scryer.drift.flag' })
  })

  it('keeps #33 modules out of adapter and legacy semantic bypass imports', async () => {
    const files = [
      'src/main/scryer/engine/health-reporter.ts',
      'src/main/scryer/engine/drift-verdict-recorder.ts',
      'src/main/scryer/engine/operations/model-health.ts',
      'src/main/scryer/engine/operations/drift-flag.ts'
    ]
    const forbidden = [
      'mcp-tools',
      'renderer',
      'src/cli',
      'runtime/rpc',
      'model-store',
      'adapters/legacy-c4',
      'writeFile('
    ]

    for (const file of files) {
      const source = await readFile(join(process.cwd(), file), 'utf8')
      for (const token of forbidden) {
        expect(source, `${file} must not import/use ${token}`).not.toContain(token)
      }
    }
  })
})
