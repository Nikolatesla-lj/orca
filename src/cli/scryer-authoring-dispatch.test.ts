import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScryModel } from '../main/scryer/engine/model'

vi.mock('./runtime-client', () => {
  class RuntimeClient {
    call = async () => ({})
  }

  class RuntimeClientError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }

  class RuntimeRpcFailureError extends RuntimeClientError {
    readonly response: unknown

    constructor(response: unknown) {
      super('runtime_error', 'runtime_error')
      this.response = response
    }
  }

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError
  }
})

import { main } from './index'

function model(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
      { id: 'orders', kind: 'component', name: 'Orders', parentId: 'api' },
      { id: 'billing', kind: 'component', name: 'Billing', parentId: 'api' }
    ],
    links: [{ id: 'link-orders-billing', src: 'orders', dst: 'billing', label: 'uses' }],
    groups: [
      { id: 'group-core', name: 'Core', memberIds: ['orders', 'billing'], parentNodeId: 'api' }
    ],
    sourceMap: {},
    boundaries: {}
  }
}

async function writeProject(projectModel: ScryModel = model()): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-authoring-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  const serialized = JSON.stringify(projectModel, null, 2)
  await writeFile(join(projectPath, '.scryer', 'model.scry'), serialized, 'utf8')
  await writeFile(join(projectPath, '.scryer', 'planned.scry'), serialized, 'utf8')
  return projectPath
}

async function readModel(
  projectPath: string,
  file: 'model.scry' | 'planned.scry'
): Promise<ScryModel> {
  return JSON.parse(await readFile(join(projectPath, '.scryer', file), 'utf8')) as ScryModel
}

async function runJson(argv: string[], cwd: string, stdin?: unknown) {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const stdinStream = stdin
    ? (Object.assign(Readable.from([JSON.stringify(stdin)]), {
        fd: 0 as const
      }) as unknown as NodeJS.ReadStream & { fd: 0 })
    : null
  const stdinSpy = stdin ? vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdinStream!) : null
  process.exitCode = undefined
  await main(argv, cwd)
  const output = log.mock.calls.length > 0 ? JSON.parse(String(log.mock.calls.at(-1)?.[0])) : null
  stdinSpy?.mockRestore()
  error.mockRestore()
  log.mockRestore()
  return { output, exitCode: process.exitCode }
}

describe('orca scryer #35 authoring/group/source CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('authors a planned component node through intent add', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'component', 'add', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      { items: [{ name: 'Payments', parent_id: 'api' }] }
    )

    expect(output).toMatchObject({
      ok: true,
      operationId: 'scryer.component.add',
      result: { addedIds: [expect.any(String)] }
    })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.nodes.some((node) => node.name === 'Payments' && node.parentId === 'api')).toBe(
      true
    )
  })

  it('authors a planned person node through intent add', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'person', 'add', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      { items: [{ name: 'Customer' }] }
    )

    expect(output).toMatchObject({ ok: true, operationId: 'scryer.person.add' })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.nodes.some((node) => node.kind === 'person' && node.name === 'Customer')).toBe(
      true
    )
  })

  it('deletes planned nodes through the node delete command', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'node', 'delete', '--project', projectPath, '--node-ids', 'orders', '--json'],
      projectPath
    )

    expect(output).toMatchObject({ ok: true, operationId: 'scryer.node.delete' })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.nodes.some((node) => node.id === 'orders')).toBe(false)
  })

  it('updates a planned link label through link update', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'link', 'update', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      { links: [{ link_id: 'link-orders-billing', label: 'depends on' }] }
    )

    expect(output).toMatchObject({ ok: true, operationId: 'scryer.link.update' })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.links.find((link) => link.id === 'link-orders-billing')?.label).toBe(
      'depends on'
    )
  })

  it('deletes a planned group through group delete', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'group', 'delete', '--project', projectPath, '--group-id', 'group-core', '--json'],
      projectPath
    )

    expect(output).toMatchObject({ ok: true, operationId: 'scryer.group.delete' })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.groups.some((group) => group.id === 'group-core')).toBe(false)
  })

  it('updates source anchors through source update', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'source', 'update', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      { entries: [{ node_id: 'orders', locations: [{ pattern: 'src/orders.ts' }] }] }
    )

    expect(output).toMatchObject({ ok: true, operationId: 'scryer.source.update' })
    const planned = await readModel(projectPath, 'planned.scry')
    expect(planned.sourceMap['orders']?.[0]?.pattern).toBe('src/orders.ts')
  })

  it('replaces the whole model through model set and refreshes the baseline', async () => {
    const projectPath = await writeProject()

    const { output } = await runJson(
      ['scryer', 'model', 'set', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      {
        data: {
          version: '0.3',
          nodes: [{ id: 'root', kind: 'system', name: 'Root' }],
          links: [],
          groups: [],
          sourceMap: {},
          boundaries: {}
        }
      }
    )

    expect(output).toMatchObject({
      ok: true,
      operationId: 'scryer.model.set',
      result: { nodeCount: 1 }
    })
    const committed = await readModel(projectPath, 'model.scry')
    expect(committed.nodes).toEqual([{ id: 'root', kind: 'system', name: 'Root' }])
    // model.set refreshes the baseline snapshot.
    expect(existsSync(join(projectPath, '.scryer', 'model.baseline.scry'))).toBe(true)
  })
})
