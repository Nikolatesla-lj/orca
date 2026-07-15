import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
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
      {
        id: 'orders',
        kind: 'component',
        name: 'Orders',
        parentId: 'api',
        responsibilities: [{ id: 'resp-orders', statement: 'Coordinates orders' }]
      }
    ],
    links: [],
    groups: [],
    sourceMap: { 'resp-orders': [{ pattern: 'src/orders.ts' }] },
    boundaries: { api: [{ pattern: 'src/**/*.ts' }] }
  }
}

async function writeProject(projectModel: ScryModel = model()): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-drift-health-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  const serialized = JSON.stringify(projectModel, null, 2)
  await writeFile(join(projectPath, '.scryer', 'model.scry'), serialized, 'utf8')
  await writeFile(join(projectPath, '.scryer', 'planned.scry'), serialized, 'utf8')
  return projectPath
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

describe('orca scryer #35 drift/health CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('dispatches model health through the real CLI command path', async () => {
    const projectPath = await writeProject()

    const { output, exitCode } = await runJson(
      ['scryer', 'model', 'health', '--project', projectPath, '--node-id', 'api', '--json'],
      projectPath
    )

    expect(exitCode).toBeUndefined()
    expect(output).toMatchObject({
      ok: true,
      operationId: 'scryer.model.health',
      result: { totals: expect.objectContaining({ responsibilities: expect.any(Number) }) }
    })
  })

  it('dispatches drift get through the real CLI command path', async () => {
    const projectPath = await writeProject()

    const { output, exitCode } = await runJson(
      ['scryer', 'drift', 'get', '--project', projectPath, '--json'],
      projectPath
    )

    expect(exitCode).toBeUndefined()
    expect(output).toMatchObject({ ok: true, operationId: 'scryer.drift.get' })
  })

  it('records a drift finding into planned state only, leaving committed unchanged', async () => {
    const projectPath = await writeProject()
    const committedBefore = await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')

    const { output, exitCode } = await runJson(
      ['scryer', 'drift', 'flag', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      {
        node_id: 'api',
        undescribed: [
          { node_id: 'orders', statement: 'Cancels stale orders', source_file: 'src/orders.ts' }
        ]
      }
    )

    expect(exitCode).toBeUndefined()
    expect(output).toMatchObject({
      ok: true,
      operationId: 'scryer.drift.flag',
      result: { flagged: 1 }
    })

    // Engine-owned write: the vagrant responsibility lands in planned, not committed.
    const planned = JSON.parse(
      await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8')
    ) as ScryModel
    const orders = planned.nodes.find((node) => node.id === 'orders')!
    expect(
      orders.responsibilities?.some((r) => r.statement === 'Cancels stale orders' && r.vagrant)
    ).toBe(true)
    expect(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8')).toBe(committedBefore)
  })

  it('dispatches drift reconcile and advances the sync baseline', async () => {
    const projectPath = await writeProject()

    const { output, exitCode } = await runJson(
      ['scryer', 'drift', 'reconcile', '--project', projectPath, '--json'],
      projectPath
    )

    expect(exitCode).toBeUndefined()
    expect(output).toMatchObject({ ok: true, operationId: 'scryer.drift.reconcile' })
    expect(existsSync(join(projectPath, '.scryer', '.sync.json'))).toBe(true)
  })
})
