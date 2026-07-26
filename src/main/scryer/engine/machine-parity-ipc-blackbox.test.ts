import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchitectureIpcRegistrar } from '../../ipc/architecture'

// architecture.ts imports electron's ipcMain at module load; a custom registrar means
// we never touch it, but the import must still resolve.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { registerArchitectureHandlers } = await import('../../ipc/architecture')

type IpcListener = (event: unknown, args: unknown) => Promise<unknown>

const handlers = new Map<string, IpcListener>()

const capturingRegistrar: ArchitectureIpcRegistrar = {
  handle: (channel, listener) => {
    handlers.set(channel, listener as unknown as IpcListener)
  }
}

async function seedProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-parity-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify({
      version: '0.3',
      nodes: [],
      links: [],
      groups: [],
      sourceMap: {},
      boundaries: {}
    }),
    'utf8'
  )
  return projectPath
}

// Black-box proof that the SINGLE generic IPC channel routes any cataloged operation id
// to the engine and returns a structured envelope — the runtime basis for the gate's
// generic-IPC evidence.
describe('generic IPC transport routes cataloged operations to the engine', () => {
  beforeEach(() => {
    handlers.clear()
    registerArchitectureHandlers(capturingRegistrar, undefined)
  })

  it('exposes exactly one generic execute channel', () => {
    expect(handlers.has('architecture:executeScryerOperation')).toBe(true)
  })

  it('routes a read operation and returns its envelope', async () => {
    const projectPath = await seedProject()
    const execute = handlers.get('architecture:executeScryerOperation')!
    const result = (await execute(
      { sender: { send: vi.fn() } },
      { projectPath, operationId: 'scryer.model.read', input: {} }
    )) as { ok: boolean; operationId: string }
    expect(result.operationId).toBe('scryer.model.read')
    expect(result.ok).toBe(true)
  })

  it('routes a planned-write operation through the same channel', async () => {
    const projectPath = await seedProject()
    const execute = handlers.get('architecture:executeScryerOperation')!
    const result = (await execute(
      { sender: { send: vi.fn() } },
      {
        projectPath,
        operationId: 'scryer.person.add',
        input: { items: [{ name: 'Customer' }] }
      }
    )) as { ok: boolean; operationId: string }
    expect(result.operationId).toBe('scryer.person.add')
    expect(result.ok).toBe(true)
  })
})
