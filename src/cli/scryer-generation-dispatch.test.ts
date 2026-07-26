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
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
    ],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {}
  }
}

async function writeProject(projectModel: ScryModel = model()): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-generation-'))
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

describe('orca scryer #34/#35 container.fill CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('generates a container subtree and writes engine-owned .scryer files', async () => {
    const projectPath = await writeProject()

    const { output, exitCode } = await runJson(
      ['scryer', 'container', 'fill', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      {
        container_id: 'api',
        components: [
          {
            key: 'orders',
            name: 'Orders',
            responsibilities: ['Coordinates orders'],
            symbols: [
              {
                key: 'handleOrder',
                name: 'handleOrder',
                source_file: 'src/orders.ts',
                responsibilities: ['Handles an order request']
              }
            ]
          }
        ]
      }
    )

    expect(exitCode).toBeUndefined()
    expect(output).toMatchObject({
      ok: true,
      operationId: 'scryer.container.fill',
      result: {
        commit: { committedWritten: true, plannedMirrored: true, baselineRefreshed: false },
        summary: { components: 1, symbols: 1 }
      }
    })

    // The engine owns the .scryer write: the component lands in committed and planned.
    const componentId = output.result.created.components[0].id
    const committed = await readModel(projectPath, 'model.scry')
    const planned = await readModel(projectPath, 'planned.scry')
    expect(committed.nodes.some((node) => node.id === componentId && node.parentId === 'api')).toBe(
      true
    )
    expect(planned.nodes.some((node) => node.id === componentId)).toBe(true)
  })

  it('returns a structured not_found envelope for a missing container', async () => {
    const projectPath = await writeProject()

    const { output, exitCode } = await runJson(
      ['scryer', 'container', 'fill', '--project', projectPath, '--json-input', '-', '--json'],
      projectPath,
      {
        container_id: 'ghost',
        components: [
          { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'a.ts' }] }
        ]
      }
    )

    expect(exitCode).toBe(1)
    expect(output).toMatchObject({
      ok: false,
      operationId: 'scryer.container.fill',
      error: { code: 'not_found' }
    })
  })
})
