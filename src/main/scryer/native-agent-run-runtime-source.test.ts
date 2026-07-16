import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AgentHookServer } from '../agent-hooks/server'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { createScryerEditLeaseStore } from './edit-lease-store'
import { createScryerEditSessionController } from './edit-session-controller'
import { createScryerEngine } from './engine'
import { createNativeScryerAgentRunRuntime } from './native-agent-run-runtime'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_RUN_ID = 'run-native-source'
const PANE_KEY = `${AGENT_RUN_ID}:${LEAF_ID}`

function createNativeSources(): {
  agentHookServer: AgentHookServer
  runtimeService: OrcaRuntimeService
} {
  const runtimeService = new OrcaRuntimeService(null)
  runtimeService.attachWindow(1)
  runtimeService.syncWindowGraph(1, {
    tabs: [
      {
        tabId: AGENT_RUN_ID,
        worktreeId: 'repo::/worktree',
        title: 'Codex',
        activeLeafId: LEAF_ID,
        layout: null
      }
    ],
    leaves: [
      {
        tabId: AGENT_RUN_ID,
        worktreeId: 'repo::/worktree',
        leafId: LEAF_ID,
        paneRuntimeId: 1,
        ptyId: 'pty-native-source'
      }
    ]
  })
  return { agentHookServer: new AgentHookServer(), runtimeService }
}

function createRuntime(agentHookServer: AgentHookServer, runtimeService: OrcaRuntimeService) {
  return createNativeScryerAgentRunRuntime(
    {
      resolveAgentRunIdentity: async (agentRunId) =>
        runtimeService.resolveAgentRunIdentity(agentRunId),
      getAgentStatusSnapshot: () => agentHookServer.getAgentStatusEventSnapshot(),
      subscribeAgentStatus: (listener) => agentHookServer.subscribeAgentStatusEvents(listener),
      subscribeTerminalTermination: (listener) =>
        runtimeService.subscribeTerminalTerminations(listener)
    },
    { now: () => 0, identityResolveDelaysMs: [0] }
  )
}

describe('native Scryer agent run source wiring', () => {
  it('receives an identity-preserving done event from AgentHookServer', async () => {
    const { agentHookServer, runtimeService } = createNativeSources()
    const runtime = createRuntime(agentHookServer, runtimeService)
    const finished = vi.fn()
    const rendererListener = vi.fn()
    agentHookServer.setListener(rendererListener)

    await runtime.onRunFinished(AGENT_RUN_ID, finished)
    agentHookServer.ingestTerminalStatus({
      paneKey: PANE_KEY,
      tabId: AGENT_RUN_ID,
      connectionId: null,
      payload: { state: 'done', prompt: '' }
    })

    expect(finished).toHaveBeenCalledWith({ agentRunId: AGENT_RUN_ID, status: 'done' })
    expect(rendererListener).toHaveBeenCalledTimes(1)
    runtime.dispose()
    agentHookServer.stop()
  })

  it('receives PTY exit zero as crash evidence from OrcaRuntimeService', async () => {
    const { agentHookServer, runtimeService } = createNativeSources()
    const runtime = createRuntime(agentHookServer, runtimeService)
    const finished = vi.fn()

    await runtime.onRunFinished(AGENT_RUN_ID, finished)
    runtimeService.onPtyExit('pty-native-source', 0)

    expect(finished).toHaveBeenCalledWith({ agentRunId: AGENT_RUN_ID, status: 'crashed' })
    runtime.dispose()
    agentHookServer.stop()
  })

  it('releases the active edit lease when native done is interrupted', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-native-interrupted-'))
    const { agentHookServer, runtimeService } = createNativeSources()
    const runtime = createRuntime(agentHookServer, runtimeService)
    const leaseStore = createScryerEditLeaseStore()
    const controller = createScryerEditSessionController({
      engine: createScryerEngine(),
      leaseStore,
      agentRuntime: runtime
    })
    await controller.beginAgentEditSession({ projectPath, agentRunId: AGENT_RUN_ID })

    agentHookServer.ingestTerminalStatus({
      paneKey: PANE_KEY,
      tabId: AGENT_RUN_ID,
      connectionId: null,
      payload: { state: 'done', prompt: '', interrupted: true }
    })

    await vi.waitFor(async () => {
      await expect(leaseStore.read({ projectPath })).resolves.toBeNull()
    })
    runtime.dispose()
    agentHookServer.stop()
  })

  it('releases the active edit lease when the native PTY exits nonzero', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-native-crashed-'))
    const { agentHookServer, runtimeService } = createNativeSources()
    const runtime = createRuntime(agentHookServer, runtimeService)
    const leaseStore = createScryerEditLeaseStore()
    const controller = createScryerEditSessionController({
      engine: createScryerEngine(),
      leaseStore,
      agentRuntime: runtime
    })
    await controller.beginAgentEditSession({ projectPath, agentRunId: AGENT_RUN_ID })

    runtimeService.onPtyExit('pty-native-source', 9)

    await vi.waitFor(async () => {
      await expect(leaseStore.read({ projectPath })).resolves.toBeNull()
    })
    runtime.dispose()
    agentHookServer.stop()
  })
})
