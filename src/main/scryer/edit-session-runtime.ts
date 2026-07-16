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
    const outcomes = await Promise.allSettled(
      [...(listeners.get(agentRunId) ?? [])].map((listener) =>
        Promise.resolve().then(() => listener(event))
      )
    )
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected')
    if (failures.length === 1) {
      throw failures[0].reason
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        'Scryer agent run listeners failed'
      )
    }
  }

  return {
    async getRunStatus(agentRunId) {
      return statuses.get(agentRunId) ?? 'crashed'
    },
    async onRunFinished(agentRunId, callback) {
      const set = listeners.get(agentRunId) ?? new Set()
      set.add(callback)
      listeners.set(agentRunId, set)
      const unsubscribe = () => {
        set.delete(callback)
        if (set.size === 0) {
          listeners.delete(agentRunId)
        }
      }
      const current = statuses.get(agentRunId)
      if (current && current !== 'running') {
        try {
          await callback({ agentRunId, status: current })
        } catch (error) {
          unsubscribe()
          throw error
        }
      }
      return unsubscribe
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
