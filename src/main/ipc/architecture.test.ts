import { mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (_event: unknown, args: unknown) => Promise<unknown>>()
const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock }
}))

import { registerArchitectureHandlers } from './architecture'

describe('registerArchitectureHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handleMock.mockReset()
    handleMock.mockImplementation((channel: string, handler: never) => {
      handlers.set(channel, handler)
    })
    registerArchitectureHandlers()
  })

  it('bridges model read/write, drift, sync, and MCP-style tool calls through IPC', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-'))
    const model = await handlers.get('architecture:readModel')!(null, { projectPath })
    expect(model).toMatchObject({ nodes: [], edges: [], projectPath })

    const toolResult = await handlers.get('architecture:callTool')!(null, {
      projectPath,
      call: {
        toolName: 'set_model',
        arguments: {
          data: JSON.stringify({
            nodes: [
              {
                id: 'system',
                data: { name: 'System', description: 'Root system', kind: 'system' }
              }
            ],
            edges: []
          })
        }
      }
    })
    expect(toolResult).toMatchObject({ ok: true })

    await handlers.get('architecture:markSynced')!(null, { projectPath })
    const drift = await handlers.get('architecture:checkDrift')!(null, { projectPath })
    expect(drift).toMatchObject({ nodes: [], structureChanged: false })
  })

  it('notifies the renderer immediately when IPC writes replace the model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-write-'))
    const send = vi.fn()

    await handlers.get('architecture:writeModel')!(
      { sender: { send } },
      {
        projectPath,
        model: {
          nodes: [
            {
              id: 'system',
              type: 'c4',
              data: { name: 'System', description: 'Root system', kind: 'system' }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        }
      }
    )

    expect(send).toHaveBeenCalledWith('architecture:modelChanged', {
      projectPath,
      fileName: 'model.scry'
    })
  })
})
