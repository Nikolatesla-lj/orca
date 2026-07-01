import { mkdir, mkdtemp, writeFile } from 'fs/promises'
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
      { id: 'crm', kind: 'system', name: 'CRM' },
      {
        id: 'api',
        kind: 'container',
        name: 'API',
        parentId: 'shop',
        responsibilities: [{ id: 'resp-api', statement: 'Serves API traffic' }]
      },
      { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' },
      { id: 'handler', kind: 'component', name: 'Handler', parentId: 'api' }
    ],
    links: [],
    groups: [],
    sourceMap: { 'resp-api': [{ pattern: 'src/api.ts' }] },
    boundaries: {}
  }
}

async function writeProject(projectModel: ScryModel = model()): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-structural-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(projectModel, null, 2),
    'utf8'
  )
  await writeFile(
    join(projectPath, '.scryer', 'planned.scry'),
    JSON.stringify(projectModel, null, 2),
    'utf8'
  )
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

describe('orca scryer #32 structural CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('dispatches node set-subtree through the real CLI command path', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        [
          'scryer',
          'node',
          'set-subtree',
          '--project',
          projectPath,
          '--node-id',
          'api',
          '--json-input',
          '-',
          '--json'
        ],
        projectPath,
        {
          data: {
            nodes: [
              { id: 'controller', kind: 'component', name: 'Controller', parentId: 'api' },
              { id: 'storage', kind: 'component', name: 'Storage', parentId: 'api' }
            ],
            links: [
              { id: 'link-controller-storage', src: 'controller', dst: 'storage', label: 'uses' }
            ]
          }
        }
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.node.set-subtree',
        result: { rootId: 'api', addedNodeCount: 2 }
      },
      exitCode: undefined
    })
  })

  it('dispatches node move through the real CLI command path', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        [
          'scryer',
          'node',
          'move',
          '--project',
          projectPath,
          '--node-id',
          'api',
          '--new-parent-id',
          'crm',
          '--json'
        ],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.node.move',
        result: { moved: [{ nodeId: 'api', fromParentId: 'shop', toParentId: 'crm' }] }
      },
      exitCode: undefined
    })
  })

  it('dispatches responsibility move through the real CLI command path', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        [
          'scryer',
          'responsibility',
          'move',
          '--project',
          projectPath,
          '--responsibility-id',
          'resp-api',
          '--from-node-id',
          'api',
          '--to-node-id',
          'web',
          '--json'
        ],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.responsibility.move',
        result: { moved: [{ responsibilityId: 'resp-api', fromNodeId: 'api', toNodeId: 'web' }] }
      },
      exitCode: undefined
    })
  })

  it('dispatches node descope through the real CLI command path', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        ['scryer', 'node', 'descope', '--project', projectPath, '--node-ids', 'api', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.node.descope',
        result: { descopedCount: 1, codeAction: 'code_unchanged' }
      },
      exitCode: undefined
    })
  })
})
