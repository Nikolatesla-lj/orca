import { describe, expect, it, vi } from 'vitest'
import {
  createNativeScryerAgentRunRuntime,
  type NativeAgentRunEventSource,
  type NativeAgentStatusEvent,
  type NativeAgentRunIdentity,
  type NativeTerminalTerminationEvent
} from './native-agent-run-runtime'

const FIRST_LEAF_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_LEAF_ID = '22222222-2222-4222-8222-222222222222'

function paneKey(tabId: string, leafId = FIRST_LEAF_ID): string {
  return `${tabId}:${leafId}`
}

function createEventSource(identities: Record<string, NativeAgentRunIdentity | null>): {
  source: NativeAgentRunEventSource
  emitStatus: (event: NativeAgentStatusEvent) => void
  emitTermination: (event: NativeTerminalTerminationEvent) => void
} {
  const statuses: NativeAgentStatusEvent[] = []
  const statusListeners = new Set<(event: NativeAgentStatusEvent) => void>()
  const terminationListeners = new Set<(event: NativeTerminalTerminationEvent) => void>()
  return {
    source: {
      resolveAgentRunIdentity: vi.fn(async (agentRunId) => identities[agentRunId] ?? null),
      getAgentStatusSnapshot: () => statuses,
      subscribeAgentStatus: (listener) => {
        statusListeners.add(listener)
        return () => statusListeners.delete(listener)
      },
      subscribeTerminalTermination: (listener) => {
        terminationListeners.add(listener)
        return () => terminationListeners.delete(listener)
      }
    },
    emitStatus: (event) => {
      const currentIndex = statuses.findIndex(
        (status) => status.paneKey === event.paneKey && status.connectionId === event.connectionId
      )
      if (currentIndex === -1) {
        statuses.push(event)
      } else {
        statuses[currentIndex] = event
      }
      for (const listener of statusListeners) {
        listener(event)
      }
    },
    emitTermination: (event) => {
      for (const listener of terminationListeners) {
        listener(event)
      }
    }
  }
}

function identity(agentRunId: string, connectionId: string | null = null): NativeAgentRunIdentity {
  return { agentRunId, paneKey: paneKey(agentRunId), connectionId }
}

describe('native Scryer agent run runtime', () => {
  it('maps native done events to the Scryer done terminal status', async () => {
    const events = createEventSource({ 'run-1': identity('run-1') })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 100,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await expect(runtime.getRunStatus('run-1')).resolves.toBe('running')
    await runtime.onRunFinished('run-1', finished)
    events.emitStatus({
      paneKey: paneKey('run-1'),
      connectionId: null,
      state: 'done',
      receivedAt: 101
    })

    expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-1', status: 'done' })
    await expect(runtime.getRunStatus('run-1')).resolves.toBe('done')
  })

  it('maps interrupted native done events to cancelled', async () => {
    const events = createEventSource({ 'run-cancelled': identity('run-cancelled') })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 200,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await runtime.onRunFinished('run-cancelled', finished)
    events.emitStatus({
      paneKey: paneKey('run-cancelled'),
      connectionId: null,
      state: 'done',
      interrupted: true,
      receivedAt: 201
    })

    expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-cancelled', status: 'cancelled' })
  })

  it('keeps SSH agent identity scoped by connection id and pane key', async () => {
    const events = createEventSource({ 'run-remote': identity('run-remote', 'ssh-1') })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 300,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await runtime.onRunFinished('run-remote', finished)
    events.emitStatus({
      paneKey: paneKey('run-remote'),
      connectionId: 'ssh-2',
      state: 'done',
      receivedAt: 301
    })
    events.emitStatus({
      paneKey: paneKey('run-remote', SECOND_LEAF_ID),
      connectionId: 'ssh-1',
      state: 'done',
      receivedAt: 302
    })

    expect(finished).not.toHaveBeenCalled()
    await expect(runtime.getRunStatus('run-remote')).resolves.toBe('running')

    events.emitStatus({
      paneKey: paneKey('run-remote'),
      connectionId: 'ssh-1',
      state: 'done',
      receivedAt: 303
    })
    expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-remote', status: 'done' })
  })

  it('ignores replayed terminal events older than the edit session', async () => {
    const events = createEventSource({ 'run-replay': identity('run-replay') })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 400,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await runtime.onRunFinished('run-replay', finished)
    events.emitStatus({
      paneKey: paneKey('run-replay'),
      connectionId: null,
      state: 'done',
      receivedAt: 399,
      isReplay: true
    })

    expect(finished).not.toHaveBeenCalled()
    await expect(runtime.getRunStatus('run-replay')).resolves.toBe('running')
  })

  it('counts terminal events that arrive while native identity is resolving', async () => {
    const runIdentity = identity('run-resolving')
    const statuses: NativeAgentStatusEvent[] = []
    let statusListener: (event: NativeAgentStatusEvent) => void = () => undefined
    let clock = 100
    const source: NativeAgentRunEventSource = {
      resolveAgentRunIdentity: vi.fn(async () => {
        const event: NativeAgentStatusEvent = {
          paneKey: runIdentity.paneKey,
          connectionId: runIdentity.connectionId,
          state: 'done',
          receivedAt: 150
        }
        statuses.push(event)
        statusListener(event)
        clock = 200
        return runIdentity
      }),
      getAgentStatusSnapshot: () => statuses,
      subscribeAgentStatus: (listener) => {
        statusListener = listener
        return () => undefined
      },
      subscribeTerminalTermination: () => () => undefined
    }
    const runtime = createNativeScryerAgentRunRuntime(source, {
      now: () => clock,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await runtime.onRunFinished('run-resolving', finished)

    expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-resolving', status: 'done' })
  })

  it.each([0, 9, null])(
    'treats terminal termination with exit code %s as crash evidence, never success',
    async (exitCode) => {
      const events = createEventSource({ 'run-exit': identity('run-exit', 'ssh-1') })
      const runtime = createNativeScryerAgentRunRuntime(events.source, {
        now: () => 500,
        identityResolveDelaysMs: [0]
      })
      const finished = vi.fn()

      await runtime.onRunFinished('run-exit', finished)
      events.emitTermination({
        paneKey: paneKey('run-exit'),
        connectionId: 'ssh-1',
        exitCode,
        occurredAt: 501,
        reason: exitCode === null ? 'disappeared' : 'exit'
      })

      expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-exit', status: 'crashed' })
      await expect(runtime.getRunStatus('run-exit')).resolves.toBe('crashed')
    }
  )

  it('does not let a later PTY exit overwrite an explicit done event', async () => {
    const events = createEventSource({ 'run-done-exit': identity('run-done-exit') })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 600,
      identityResolveDelaysMs: [0]
    })
    const finished = vi.fn()

    await runtime.onRunFinished('run-done-exit', finished)
    events.emitStatus({
      paneKey: paneKey('run-done-exit'),
      connectionId: null,
      state: 'done',
      receivedAt: 601
    })
    events.emitTermination({
      paneKey: paneKey('run-done-exit'),
      connectionId: null,
      exitCode: 0,
      occurredAt: 602,
      reason: 'exit'
    })

    expect(finished).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledWith({ agentRunId: 'run-done-exit', status: 'done' })
    await expect(runtime.getRunStatus('run-done-exit')).resolves.toBe('done')
  })

  it('fails closed when no live native terminal identity exists', async () => {
    const events = createEventSource({ missing: null })
    const runtime = createNativeScryerAgentRunRuntime(events.source, {
      now: () => 700,
      identityResolveDelaysMs: [0]
    })

    await expect(runtime.getRunStatus('missing')).resolves.toBe('crashed')
  })
})
