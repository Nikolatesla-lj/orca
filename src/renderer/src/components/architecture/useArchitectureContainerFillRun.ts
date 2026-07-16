import { useCallback } from 'react'
import { toast } from 'sonner'
import { launchAgentInNewTab } from '../../lib/launch-agent-in-new-tab'
import { useAppStore } from '../../store'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TuiAgent } from '../../../../shared/types'
import { resolveContainerFillTerminal } from './architecture-container-fill-terminal'
import type { ArchitectureAiRunPhase } from './architecture-ai-run-state'

// Why: Fill with AI runs an agent that atomically generates a container's subtree via
// `orca scryer container fill`. This hook owns that run's lifecycle: it acquires the
// edit-session lease BEFORE the agent launches (so the write is authorized under the
// session, not racing it), then reflects the token-free completion gate once the agent
// finishes — success only when the gate passed and the generated subtree is present.

export type ContainerFillRunDeps = {
  projectPath: string
  worktreeId: string
  agentName: TuiAgent
  activeModelName: string
  beginFillRun: (message: string) => boolean
  markFillRun: (phase: ArchitectureAiRunPhase, message: string) => void
  flushPendingWork: () => Promise<void>
  reloadModel: () => Promise<void>
  setMessage: (message: string) => void
  setError: (message: string) => void
}

type ActiveContainerFill = {
  projectPath: string
  agentRunId: string
  containerId: string
  modelName: string
  startedAt: number
  ptyIds: Set<string>
  settling: boolean
  reflect: (outcome: { interrupted: boolean }) => Promise<void>
}

const READ_GATE_RETRY_DELAYS_MS = [0, 40, 120, 250, 400]

const activeContainerFills = new Map<string, ActiveContainerFill>()
let storeUnsubscribe: (() => void) | null = null
let ptyExitUnsubscribe: (() => void) | null = null

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanupWatchers(): void {
  if (activeContainerFills.size > 0) {
    return
  }
  storeUnsubscribe?.()
  storeUnsubscribe = null
  ptyExitUnsubscribe?.()
  ptyExitUnsubscribe = null
}

// Why: the finished pane belongs to this run only if its status updated after the run
// started; an 'interrupted' done is a cancel, not a completion.
function findFinishedFillPane(args: {
  agentRunId: string
  startedAt: number
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
}): { interrupted: boolean } | null {
  const panePrefix = `${args.agentRunId}:`
  for (const [paneKey, entry] of Object.entries(args.agentStatusByPaneKey)) {
    if (!paneKey.startsWith(panePrefix) || entry.updatedAt < args.startedAt) {
      continue
    }
    if (entry.state === 'done') {
      return { interrupted: entry.interrupted === true }
    }
  }
  return null
}

function settleFill(agentRunId: string, outcome: { interrupted: boolean }): void {
  const active = activeContainerFills.get(agentRunId)
  if (!active || active.settling) {
    return
  }
  active.settling = true
  void Promise.resolve(active.reflect(outcome))
    .catch(() => {
      // Keep token-free: reflection failures must not surface lease details.
      console.error('[architecture] container fill reflection failed')
    })
    .finally(() => {
      activeContainerFills.delete(agentRunId)
      cleanupWatchers()
    })
}

function ensureWatchers(): void {
  if (!storeUnsubscribe) {
    storeUnsubscribe = useAppStore.subscribe((state) => {
      for (const [agentRunId, active] of activeContainerFills) {
        for (const ptyId of state.ptyIdsByTabId[active.agentRunId] ?? []) {
          active.ptyIds.add(ptyId)
        }
        const finished = findFinishedFillPane({
          agentRunId: active.agentRunId,
          startedAt: active.startedAt,
          agentStatusByPaneKey: state.agentStatusByPaneKey
        })
        if (finished) {
          settleFill(agentRunId, { interrupted: finished.interrupted })
        }
      }
    })
  }
  if (!ptyExitUnsubscribe) {
    ptyExitUnsubscribe = window.api.pty.onExit(({ id, code }) => {
      for (const [agentRunId, active] of activeContainerFills) {
        if (!active.ptyIds.has(id)) {
          continue
        }
        // Why: a non-zero PTY exit means the agent run vanished before reporting done;
        // main reconciles by cancelling the lease, so reflect it as a cancel.
        settleFill(agentRunId, { interrupted: code !== 0 })
      }
    })
  }
}

async function readGateAfterCompletion(projectPath: string): Promise<{
  gate: unknown
  leaseReleased: boolean
}> {
  for (const delayMs of READ_GATE_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs)
    }
    const session = (await window.api.architecture
      .readEditSession({ projectPath })
      .catch(() => null)) as {
      activeLease?: unknown
      completionGate?: unknown
    } | null
    if (!session) {
      continue
    }
    // Main auto-completes on agent done; the lease is released once folded/nothing to
    // fold, so a null active lease OR a recorded gate means completion has settled.
    if (session.activeLease === null || session.completionGate) {
      return { gate: session.completionGate ?? null, leaseReleased: session.activeLease === null }
    }
  }
  return { gate: null, leaseReleased: false }
}

async function containerHasChildren(
  projectPath: string,
  modelName: string,
  containerId: string
): Promise<boolean> {
  const model = (await window.api.architecture
    .readModel({ projectPath, modelName })
    .catch(() => null)) as { nodes?: { parentId?: string }[] } | null
  return !!model?.nodes?.some((node) => node.parentId === containerId)
}

export function useArchitectureContainerFillRun(deps: ContainerFillRunDeps) {
  const {
    projectPath,
    worktreeId,
    agentName,
    activeModelName,
    beginFillRun,
    markFillRun,
    flushPendingWork,
    reloadModel,
    setMessage,
    setError
  } = deps

  const reflectCompletion = useCallback(
    (containerId: string, modelName: string) =>
      async ({ interrupted }: { interrupted: boolean }): Promise<void> => {
        if (interrupted) {
          markFillRun('cancelled', 'Container generation cancelled')
          await reloadModel()
          setMessage('Container generation cancelled')
          return
        }
        const { gate } = await readGateAfterCompletion(projectPath)
        await reloadModel()
        const generatedSubtreePresent = await containerHasChildren(
          projectPath,
          modelName,
          containerId
        )
        const terminal = resolveContainerFillTerminal({
          gate: gate as Parameters<typeof resolveContainerFillTerminal>[0]['gate'],
          generatedSubtreePresent
        })
        markFillRun(terminal.phase, terminal.message)
        setMessage(terminal.message)
      },
    [markFillRun, projectPath, reloadModel, setMessage]
  )

  const trackContainerFill = useCallback(
    (agentRunId: string, containerId: string, modelName: string): void => {
      const state = useAppStore.getState()
      activeContainerFills.set(agentRunId, {
        projectPath,
        agentRunId,
        containerId,
        modelName,
        startedAt: Date.now(),
        ptyIds: new Set(state.ptyIdsByTabId[agentRunId] ?? []),
        settling: false,
        reflect: reflectCompletion(containerId, modelName)
      })
      ensureWatchers()
    },
    [projectPath, reflectCompletion]
  )

  const fillNodeWithAi = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!projectPath) {
        return
      }
      if (!beginFillRun('Preparing Fill with AI prompt')) {
        return
      }
      try {
        await flushPendingWork()
        const modelName = activeModelName
        const result = (await window.api.architecture.prepareNodeFillPrompt({
          projectPath,
          modelName,
          nodeId
        })) as { prompt: string }
        const launched = launchAgentInNewTab({
          agent: agentName,
          worktreeId,
          prompt: result.prompt,
          launchSource: 'unknown',
          // Why: acquire the edit-session lease for this tab BEFORE the agent's
          // `orca scryer container fill` can run, so the write is authorized under the
          // session instead of racing it. The lease token stays server-side (resolved
          // from the trusted runtime identity); it never enters args/prompt/log.
          onBeforeStartup: async (tabId) => {
            try {
              await window.api.architecture.beginEditSession({ projectPath, agentRunId: tabId })
            } catch (sessionError) {
              const text =
                sessionError instanceof Error ? sessionError.message : String(sessionError)
              markFillRun('failed', text)
              setError(text)
              toast.error(text)
              useAppStore.getState().closeTab(tabId)
              throw sessionError
            }
            markFillRun('running', 'Generating container with AI')
            setMessage('Generating container with AI')
            trackContainerFill(tabId, nodeId, modelName)
          }
        })
        if (!launched) {
          throw new Error('Could not launch an Orca agent terminal for container generation.')
        }
      } catch (fillError) {
        const text = fillError instanceof Error ? fillError.message : String(fillError)
        markFillRun('failed', text)
        setError(text)
        toast.error(text)
      }
    },
    [
      activeModelName,
      agentName,
      beginFillRun,
      flushPendingWork,
      markFillRun,
      projectPath,
      setError,
      setMessage,
      trackContainerFill,
      worktreeId
    ]
  )

  return { fillNodeWithAi }
}
