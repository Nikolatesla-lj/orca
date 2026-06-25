import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (_event: unknown, args: unknown) => Promise<unknown>>()
const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock }
}))

import {
  registerArchitectureHandlers,
  shouldNotifyModelFile,
  type ArchitectureIpcRegistrar
} from './architecture'

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

  it('bridges revisioned document reads and node patches through IPC', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-revision-'))
    const send = vi.fn()

    const first = (await handlers.get('architecture:writeModelDocument')!(
      { sender: { send } },
      {
        projectPath,
        model: {
          nodes: [
            {
              id: 'api',
              type: 'c4',
              data: { name: 'API', description: 'Initial description', kind: 'system' }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        }
      }
    )) as { model: { nodes: { data: Record<string, unknown> }[] }; revision: string }
    expect(first).toMatchObject({
      model: expect.objectContaining({ nodes: expect.any(Array) }),
      revision: expect.any(String)
    })

    const patched = await handlers.get('architecture:patchNodeData')!(
      { sender: { send } },
      {
        projectPath,
        nodeId: 'api',
        patch: { name: 'API Local Draft' },
        baseRevision: first.revision,
        baseNodeData: first.model.nodes[0]!.data
      }
    )

    expect(patched).toMatchObject({
      model: expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({ name: 'API Local Draft' })
          })
        ]
      }),
      revision: expect.any(String)
    })
    expect(send).toHaveBeenLastCalledWith('architecture:modelChanged', {
      projectPath,
      fileName: 'model.scry'
    })
  })

  it('forwards Native Scryer Engine operation envelopes through IPC', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-engine-'))
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
    const send = vi.fn()

    const result = await handlers.get('architecture:executeScryerOperation')!(
      { sender: { send } },
      {
        projectPath,
        operationId: 'scryer.node.update',
        requestId: 'ipc-test',
        input: { nodes: [{ node_id: 'api', name: 'Public API' }] }
      }
    )

    expect(result).toMatchObject({
      ok: true,
      operationId: 'scryer.node.update',
      requestId: 'ipc-test',
      result: { updatedCount: 1 }
    })
    expect(send).toHaveBeenCalledWith('architecture:modelChanged', {
      projectPath,
      fileName: 'model.scry'
    })
  })

  it('bridges project model management and AI prompt preparation through IPC', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-models-'))

    const template = await handlers.get('architecture:createModel')!(null, {
      projectPath,
      modelName: 'game-plan',
      templateId: 'game'
    })
    expect(template).toMatchObject({
      modelName: 'game-plan',
      model: expect.objectContaining({ nodes: expect.any(Array) })
    })

    await handlers.get('architecture:saveModelAs')!(null, {
      projectPath,
      fromModelName: 'game-plan',
      toModelName: 'game-plan-copy'
    })

    const models = await handlers.get('architecture:listModels')!(null, { projectPath })
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'game-plan' }),
        expect.objectContaining({ name: 'game-plan-copy' })
      ])
    )

    const initialPrompt = await handlers.get('architecture:prepareInitialModelPrompt')!(null, {
      projectPath,
      modelName: 'game-plan'
    })
    expect(initialPrompt).toMatchObject({
      prompt: expect.stringContaining('Build a C4 architecture model named "game-plan"')
    })

    const fillPrompt = await handlers.get('architecture:prepareNodeFillPrompt')!(null, {
      projectPath,
      modelName: 'game-plan',
      nodeId: 'node-2'
    })
    expect(fillPrompt).toMatchObject({
      prompt: expect.stringContaining('Fill out the internals')
    })

    const advisorPrompt = await handlers.get('architecture:prepareAdvisorPrompt')!(null, {
      projectPath,
      modelName: 'game-plan'
    })
    expect(advisorPrompt).toMatchObject({
      prompt: expect.stringContaining('Review the C4 architecture model')
    })

    await handlers.get('architecture:deleteModel')!(null, {
      projectPath,
      modelName: 'game-plan-copy'
    })
    const remaining = await handlers.get('architecture:listModels')!(null, { projectPath })
    expect(remaining).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'game-plan-copy' })])
    )
  })

  it('filters internal and temporary Scryer watcher files', () => {
    expect(shouldNotifyModelFile('model.scry')).toBe(true)
    expect(shouldNotifyModelFile('release-plan.scry')).toBe(true)
    expect(shouldNotifyModelFile('model.baseline.scry')).toBe(false)
    expect(shouldNotifyModelFile('model.presync.scry')).toBe(false)
    expect(shouldNotifyModelFile('.123.tmp')).toBe(false)
    expect(shouldNotifyModelFile('model.scry.tmp')).toBe(false)
  })

  it('writes Claude and Codex MCP config files for the project', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-mcp-config-'))
    const result = await handlers.get('architecture:writeMcpConfig')!(null, { projectPath })
    expect(result).toMatchObject({
      claudePath: expect.stringContaining('.mcp.json'),
      codexPath: expect.stringContaining('config.toml')
    })
    expect(await readFile(join(projectPath, '.mcp.json'), 'utf8')).toContain('scryer')
    expect(await readFile(join(projectPath, '.codex', 'config.toml'), 'utf8')).toContain(
      'mcp_servers.scryer'
    )
  })

  it('can register against an injected IPC registrar for isolated tests', async () => {
    const injectedHandlers = new Map<string, (_event: unknown, args: unknown) => unknown>()
    const registrar: ArchitectureIpcRegistrar = {
      handle: (channel, handler) => {
        injectedHandlers.set(channel, handler as (_event: unknown, args: unknown) => unknown)
      }
    }
    const handleSpy = vi.spyOn(registrar, 'handle')
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-ipc-injected-'))

    registerArchitectureHandlers(registrar)

    expect(handleSpy).toHaveBeenCalledWith('architecture:readModel', expect.any(Function))
    expect(
      await injectedHandlers.get('architecture:readModel')!(null, { projectPath })
    ).toMatchObject({
      nodes: [],
      edges: [],
      projectPath
    })
  })
})
