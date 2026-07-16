import type {
  ScryerAgentRunFinishedEvent,
  ScryerAgentRunRuntime,
  ScryerAgentRunStatus
} from './edit-session-controller'

export type ScryerMutableAgentRunRuntime = ScryerAgentRunRuntime & {
  setRunStatus(
    agentRunId: string,
    status: ScryerAgentRunStatus,
    options?: { emit?: boolean }
  ): Promise<void>
  clearRun(agentRunId: string): void
}

export function createScryerMutableAgentRunRuntime(): ScryerMutableAgentRunRuntime {
  const statuses = new Map<string, ScryerAgentRunStatus>()
  const listeners = new Map<
    string,
    Set<(event: ScryerAgentRunFinishedEvent) => void | Promise<void>>
  >()

  async function emit(agentRunId: string, status: ScryerAgentRunStatus): Promise<void> {
    if (status === 'running') {
      return
    }
    const event: ScryerAgentRunFinishedEvent = { agentRunId, status }
    for (const listener of listeners.get(agentRunId) ?? []) {
      await listener(event)
    }
  }

  return {
    async getRunStatus(agentRunId) {
      return statuses.get(agentRunId) ?? 'crashed'
    },
    onRunFinished(agentRunId, callback) {
      const set = listeners.get(agentRunId) ?? new Set()
      set.add(callback)
      listeners.set(agentRunId, set)
      return () => {
        set.delete(callback)
        if (set.size === 0) {
          listeners.delete(agentRunId)
        }
      }
    },
    async setRunStatus(agentRunId, status, options = {}) {
      statuses.set(agentRunId, status)
      if (options.emit !== false) {
        await emit(agentRunId, status)
      }
    },
    clearRun(agentRunId) {
      statuses.delete(agentRunId)
      listeners.delete(agentRunId)
    }
  }
}
