import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createScryerEngine, createScryerStateStore } from './index'
import type { ScryModel } from './model'
import { operationSchemas } from './schemas'
import type {
  ScryerContainerFillInput,
  ScryerContainerFillResult,
  ScryerOperationContext
} from './types'

function context(projectPath: string, requestId = 'req-34'): ScryerOperationContext {
  return {
    requestId,
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath
  }
}

function emptyContainerModel(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
    ],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {}
  }
}

async function writeProject(
  model: ScryModel,
  options: { buildEdges?: unknown } = {}
): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-34-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  const serialized = JSON.stringify(model, null, 2)
  await writeFile(join(projectPath, '.scryer', 'model.scry'), serialized, 'utf8')
  await writeFile(join(projectPath, '.scryer', 'planned.scry'), serialized, 'utf8')
  if (options.buildEdges) {
    await writeFile(
      join(projectPath, '.scryer', '.build_edges.json'),
      JSON.stringify(options.buildEdges),
      'utf8'
    )
  }
  return projectPath
}

async function writeActiveLease(projectPath: string, token: string): Promise<void> {
  await writeFile(
    join(projectPath, '.scryer', '.model-edit-lease.json'),
    JSON.stringify({ token, owner: 'human' }),
    'utf8'
  )
}

const ordersInput: ScryerContainerFillInput = {
  container_id: 'api',
  components: [
    {
      key: 'orders',
      name: 'Orders',
      responsibilities: ['Coordinates order lifecycle'],
      symbols: [
        {
          key: 'handleOrder',
          name: 'handleOrder',
          source_file: 'src/orders.ts',
          line: 10,
          end_line: 40,
          responsibilities: ['Handles an order request'],
          properties: [{ label: 'route', description: 'POST /orders' }]
        }
      ]
    }
  ]
}

describe('scryer.container.fill operation', () => {
  it('has an input schema that rejects a component without symbols', () => {
    const parsed = operationSchemas['scryer.container.fill'].input.safeParse({
      container_id: 'api',
      components: [{ key: 'orders', name: 'Orders', symbols: [] }]
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects malformed input through the engine with invalid_input', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    const result = await createScryerEngine().executeOperation(
      'scryer.container.fill',
      { container_id: 'api', components: [] },
      context(projectPath)
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input')
    }
  })

  it('commits the component subtree to committed and planned in one write', async () => {
    const projectPath = await writeProject(emptyContainerModel())

    const result = await createScryerEngine().executeOperation<ScryerContainerFillResult>(
      'scryer.container.fill',
      ordersInput,
      context(projectPath)
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.result.summary.components).toBe(1)
    expect(result.result.summary.symbols).toBe(1)
    expect(result.result.commit.baselineRefreshed).toBe(false)

    const componentId = result.result.created.components[0].id
    const committed = JSON.parse(
      await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')
    ) as ScryModel
    const planned = JSON.parse(
      await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8')
    ) as ScryModel
    expect(committed.nodes.some((node) => node.id === componentId)).toBe(true)
    expect(planned.nodes.some((node) => node.id === componentId)).toBe(true)

    // Source anchors land in committed and are mirrored into planned.
    const respId = result.result.created.symbols[0].responsibilityIds[0]
    expect(committed.sourceMap[respId]?.[0]?.pattern).toBe('src/orders.ts')
    expect(planned.sourceMap[respId]?.[0]?.pattern).toBe('src/orders.ts')

    // A best-effort born history event is appended; the baseline is NOT refreshed.
    const history = await readFile(join(projectPath, '.scryer', 'history.jsonl'), 'utf8')
    expect(history).toContain('"kind":"born"')
    expect(history).toContain(componentId)
    expect(existsSync(join(projectPath, '.scryer', 'model.baseline.scry'))).toBe(false)
  })

  it('derives code links from the build-edge cache on disk', async () => {
    const projectPath = await writeProject(emptyContainerModel(), {
      buildEdges: {
        symbolEdges: [{ src: 'src/a.ts#a1@1', dst: 'src/b.ts#b1@1' }]
      }
    })
    const result = await createScryerEngine().executeOperation<ScryerContainerFillResult>(
      'scryer.container.fill',
      {
        container_id: 'api',
        components: [
          { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'src/a.ts' }] },
          { key: 'b', name: 'B', symbols: [{ key: 'b1', name: 'b1', source_file: 'src/b.ts' }] }
        ]
      },
      context(projectPath)
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.summary.derivedLinks).toBe(1)
      expect(result.result.reports.edgeGraphStatus).toBe('available')
    }
  })

  it('does not leave a partial write when a primary commit target fails', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    const before = {
      model: await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'),
      planned: await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8')
    }

    const engine = createScryerEngine({
      stateStore: createScryerStateStore({ test: { failPrimaryTarget: 'committed' } })
    })
    const result = await engine.executeOperation(
      'scryer.container.fill',
      ordersInput,
      context(projectPath)
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('io_error')
    }
    // The transaction rolled back: neither layer changed.
    expect(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')).toBe(before.model)
    expect(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8')).toBe(
      before.planned
    )
    expect(existsSync(join(projectPath, '.scryer', 'history.jsonl'))).toBe(false)
  })

  it('writes when no model-edit lease is active (write_if_active)', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    const result = await createScryerEngine().executeOperation<ScryerContainerFillResult>(
      'scryer.container.fill',
      ordersInput,
      context(projectPath)
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.summary.components).toBe(1)
    }
  })

  it('rejects the semantic write when an active lease is unmatched', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    await writeActiveLease(projectPath, 'lease-token-abc')
    const before = await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')

    const result = await createScryerEngine().executeOperation(
      'scryer.container.fill',
      ordersInput,
      context(projectPath)
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('lease_required')
    }
    // The active lease blocked the write; the committed model is untouched.
    expect(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')).toBe(before)
  })

  it('allows the write when the caller presents the matching lease token', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    await writeActiveLease(projectPath, 'lease-token-abc')

    const result = await createScryerEngine().executeOperation<ScryerContainerFillResult>(
      'scryer.container.fill',
      ordersInput,
      { ...context(projectPath), leaseToken: 'lease-token-abc' }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      const componentId = result.result.created.components[0].id
      const committed = JSON.parse(
        await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')
      ) as ScryModel
      expect(committed.nodes.some((node) => node.id === componentId)).toBe(true)
    }
  })

  it('returns not_found for a missing container through the engine', async () => {
    const projectPath = await writeProject(emptyContainerModel())
    const result = await createScryerEngine().executeOperation(
      'scryer.container.fill',
      { ...ordersInput, container_id: 'ghost' },
      context(projectPath)
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('not_found')
    }
  })
})
