import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
import { SCRYER_COMMAND_SPECS } from './specs/scryer'

function model(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      {
        id: 'api',
        kind: 'container',
        name: 'API',
        parentId: 'shop',
        responsibilities: [{ id: 'resp-api', statement: 'Serves API traffic' }]
      }
    ],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {}
  }
}

async function writeProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-dispatch-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(model(), null, 2),
    'utf8'
  )
  await writeFile(join(projectPath, 'package.json'), '{"name":"fixture"}\n', 'utf8')
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

describe('orca scryer #31 read CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('dispatches model read overview, subtree, and explicit full reads', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(['scryer', 'model', 'read', '--project', projectPath, '--json'], projectPath)
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.model.read', result: { view: 'overview' } },
      exitCode: undefined
    })
    await expect(
      runJson(
        ['scryer', 'model', 'read', '--project', projectPath, '--node', 'shop', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.model.read', result: { view: 'subtree' } },
      exitCode: undefined
    })
    await expect(
      runJson(
        ['scryer', 'model', 'read', '--project', projectPath, '--full', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.model.read', result: { view: 'full' } },
      exitCode: undefined
    })
    await expect(
      runJson(
        ['scryer', 'model', 'read', '--project', projectPath, '--view', 'full', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.model.read', result: { view: 'full' } },
      exitCode: undefined
    })
  })

  it('returns invalid_input for conflicting full and node flags through the engine envelope', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        ['scryer', 'model', 'read', '--project', projectPath, '--full', '--node', 'shop', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: false,
        operationId: 'scryer.model.read',
        error: { code: 'invalid_input' }
      },
      exitCode: 1
    })
  })

  it('dispatches search, query, rules, and codebase reads', async () => {
    const projectPath = await writeProject()

    await expect(
      runJson(
        ['scryer', 'model', 'search', '--project', projectPath, '--query', 'api', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.model.search',
        result: { hits: [expect.objectContaining({ id: 'api' })] }
      },
      exitCode: undefined
    })
    await expect(
      runJson(
        ['scryer', 'model', 'query', '--project', projectPath, '--json-input', '-', '--json'],
        projectPath,
        { where: [{ field: 'kind', op: 'eq', value: 'container' }] }
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.model.query',
        result: { hits: [expect.objectContaining({ id: 'api' })] }
      },
      exitCode: undefined
    })
    await expect(
      runJson(['scryer', 'rules', 'read', '--json'], projectPath)
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.rules.read', result: { mode: 'index' } },
      exitCode: undefined
    })
    await expect(
      runJson(['scryer', 'rules', 'read', '--topic', 'links', '--json'], projectPath)
    ).resolves.toMatchObject({
      output: { ok: true, operationId: 'scryer.rules.read', result: { mode: 'topic' } },
      exitCode: undefined
    })
    await expect(
      runJson(
        ['scryer', 'codebase', 'read', '--project', projectPath, '--max-depth', '1', '--json'],
        projectPath
      )
    ).resolves.toMatchObject({
      output: {
        ok: true,
        operationId: 'scryer.codebase.read',
        result: { entries: [expect.objectContaining({ path: 'package.json' })] }
      },
      exitCode: undefined
    })
  })

  it('rejects the removed public --lease-token flag on read and write commands', async () => {
    const projectPath = await writeProject()
    const secret = 'scryer-edit-context-secret'

    for (const argv of [
      ['scryer', 'model', 'read', '--project', projectPath, '--lease-token', secret, '--json'],
      ['scryer', 'node', 'update', '--project', projectPath, '--lease-token', secret, '--json']
    ]) {
      const { output, exitCode } = await runJson(argv, projectPath)
      expect(exitCode).toBe(1)
      expect(output).toMatchObject({
        ok: false,
        error: { code: 'invalid_argument' }
      })
      // Why: an unknown-flag rejection must not echo the secret token value.
      expect(JSON.stringify(output)).toContain('Unknown flag --lease-token')
      expect(JSON.stringify(output)).not.toContain(secret)
    }
  })

  it('never exposes lease-token as a public flag on any scryer command', () => {
    for (const spec of SCRYER_COMMAND_SPECS) {
      expect(spec.allowedFlags).not.toContain('lease-token')
    }
  })
})
