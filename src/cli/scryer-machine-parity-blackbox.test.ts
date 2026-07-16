import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALL_SCRYER_OPERATION_IDS } from '../main/scryer/engine/catalog'
import type { HandlerContext } from './dispatch'
import { SCRYER_HANDLERS } from './handlers/scryer'

function handlerKeyToOperationId(key: string): string {
  return key.split(' ').join('.')
}

function ctx(projectPath: string, flags: Map<string, string | boolean>): HandlerContext {
  return { flags, cwd: projectPath, json: true, client: {} as HandlerContext['client'] }
}

async function seedProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-cli-parity-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify({
      version: '0.3',
      nodes: [{ id: 'api', kind: 'system', name: 'API' }],
      links: [],
      groups: [],
      sourceMap: {},
      boundaries: {}
    }),
    'utf8'
  )
  return projectPath
}

// Black-box proof that the CLI adapter surface is exactly the cataloged operation set
// and that a command actually executes through the engine.
describe('CLI transport parity with the operation catalog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers one CLI handler per cataloged operation and nothing else', () => {
    const handlerIds = Object.keys(SCRYER_HANDLERS).map(handlerKeyToOperationId).sort()
    expect(handlerIds).toEqual([...ALL_SCRYER_OPERATION_IDS].sort())
  })

  it('dispatches a command through the engine and prints the shared envelope', async () => {
    const projectPath = await seedProject()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await SCRYER_HANDLERS['scryer model read']!(
      ctx(projectPath, new Map([['project', projectPath]]))
    )

    const output = JSON.parse(String(log.mock.calls[0]![0])) as {
      ok: boolean
      operationId: string
    }
    expect(output).toMatchObject({ ok: true, operationId: 'scryer.model.read' })
  })
})
