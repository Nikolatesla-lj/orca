import type { AgentStatusState } from '../../shared/agent-status-types'
import type {
  ScryerAgentRunFinishedEvent,
  ScryerAgentRunRuntime,
  ScryerAgentRunStatus
} from './edit-session-controller'

export type NativeAgentRunIdentity = {
  agentRunId: string
  paneKey: string
  connectionId: string | null
}

export type NativeAgentStatusEvent = {
  paneKey: string
  connectionId: string | null
  state: AgentStatusState
  interrupted?: boolean
  receivedAt: number
  isReplay?: boolean
}

export type NativeTerminalTerminationEvent = {
  paneKey: string
  connectionId: string | null
  exitCode: number | null
  occurredAt: number
  reason: 'exit' | 'disappeared'
}

export type NativeAgentRunEventSource = {
  resolveAgentRunIdentity(agentRunId: string): Promise<NativeAgentRunIdentity | null>
  getAgentStatusSnapshot(): readonly NativeAgentStatusEvent[]
  subscribeAgentStatus(listener: (event: NativeAgentStatusEvent) => void): () => void
  subscribeTerminalTermination(
    listener: (event: NativeTerminalTerminationEvent) => void
  ): () => void
}

type NativeAgentRunRecord = NativeAgentRunIdentity & {
  startedAt: number
  status: ScryerAgentRunStatus
  listeners: Set<(event: ScryerAgentRunFinishedEvent) => void | Promise<void>>
}

export type NativeScryerAgentRunRuntime = ScryerAgentRunRuntime & {
  dispose(): void
}

type NativeAgentRunRuntimeOptions = {
  now?: () => number
  identityResolveDelaysMs?: readonly number[]
  onListenerError?: (error: unknown) => void
}

const DEFAULT_IDENTITY_RESOLVE_DELAYS_MS = [0, 25, 75, 150, 300] as const

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sameIdentity(
  record: Pick<NativeAgentRunRecord, 'paneKey' | 'connectionId'>,
  event: Pick<NativeAgentStatusEvent, 'paneKey' | 'connectionId'>
): boolean {
  return record.paneKey === event.paneKey && record.connectionId === event.connectionId
}

function statusForNativeEvent(event: NativeAgentStatusEvent): ScryerAgentRunStatus {
  if (event.state !== 'done') {
    return 'running'
  }
  return event.interrupted === true ? 'cancelled' : 'done'
}

export function createNativeScryerAgentRunRuntime(
  source: NativeAgentRunEventSource,
  options: NativeAgentRunRuntimeOptions = {}
): NativeScryerAgentRunRuntime {
  const now = options.now ?? Date.now
  const identityResolveDelaysMs =
    options.identityResolveDelaysMs ?? DEFAULT_IDENTITY_RESOLVE_DELAYS_MS
  const runs = new Map<string, NativeAgentRunRecord>()
  const resolvingRuns = new Map<string, Promise<NativeAgentRunRecord | null>>()
  const reportListenerError =
    options.onListenerError ??
    (() => {
      // Why: callback errors may contain operation details; keep the default log token-free.
      console.error('[scryer] native agent run listener failed')
    })

  function notifyFinished(record: NativeAgentRunRecord): void {
    if (record.status === 'running') {
      return
    }
    const event: ScryerAgentRunFinishedEvent = {
      agentRunId: record.agentRunId,
      status: record.status
    }
    for (const listener of record.listeners) {
      try {
        void Promise.resolve(listener(event)).catch(reportListenerError)
      } catch (error) {
        reportListenerError(error)
      }
    }
  }

  function applyStatusEvent(event: NativeAgentStatusEvent): void {
    for (const record of runs.values()) {
      if (
        record.status !== 'running' ||
        !sameIdentity(record, event) ||
        event.receivedAt < record.startedAt
      ) {
        continue
      }
      const nextStatus = statusForNativeEvent(event)
      if (nextStatus === 'running') {
        continue
      }
      record.status = nextStatus
      notifyFinished(record)
    }
  }

  function applyTerminalTermination(event: NativeTerminalTerminationEvent): void {
    for (const record of runs.values()) {
      if (
        record.status !== 'running' ||
        !sameIdentity(record, event) ||
        event.occurredAt < record.startedAt
      ) {
        continue
      }
      // Why: PTY shutdown proves the native run vanished, never that its work completed.
      record.status = 'crashed'
      notifyFinished(record)
    }
  }

  const unsubscribeStatus = source.subscribeAgentStatus(applyStatusEvent)
  const unsubscribeTermination = source.subscribeTerminalTermination(applyTerminalTermination)

  async function resolveRun(agentRunId: string): Promise<NativeAgentRunRecord | null> {
    const existing = runs.get(agentRunId)
    if (existing) {
      return existing
    }
    const inFlight = resolvingRuns.get(agentRunId)
    if (inFlight) {
      return inFlight
    }
    const startedAt = now()
    const resolution = (async () => {
      for (const delayMs of identityResolveDelaysMs) {
        if (delayMs > 0) {
          await wait(delayMs)
        }
        const identity = await source.resolveAgentRunIdentity(agentRunId)
        if (!identity || identity.agentRunId !== agentRunId) {
          continue
        }
        const record: NativeAgentRunRecord = {
          ...identity,
          startedAt,
          status: 'running',
          listeners: new Set()
        }
        runs.set(agentRunId, record)
        for (const event of source.getAgentStatusSnapshot()) {
          if (sameIdentity(record, event) && event.receivedAt >= record.startedAt) {
            const nextStatus = statusForNativeEvent(event)
            if (nextStatus !== 'running') {
              record.status = nextStatus
              break
            }
          }
        }
        return record
      }
      return null
    })().finally(() => {
      resolvingRuns.delete(agentRunId)
    })
    resolvingRuns.set(agentRunId, resolution)
    return resolution
  }

  return {
    async getRunStatus(agentRunId) {
      return (await resolveRun(agentRunId))?.status ?? 'crashed'
    },
    async onRunFinished(agentRunId, callback) {
      const record = await resolveRun(agentRunId)
      if (!record) {
        await callback({ agentRunId, status: 'crashed' })
        return () => undefined
      }
      record.listeners.add(callback)
      const unsubscribe = () => {
        record.listeners.delete(callback)
      }
      if (record.status !== 'running') {
        try {
          await callback({ agentRunId, status: record.status })
        } catch (error) {
          unsubscribe()
          throw error
        }
      }
      return unsubscribe
    },
    dispose() {
      unsubscribeStatus()
      unsubscribeTermination()
      runs.clear()
      resolvingRuns.clear()
    }
  }
}
