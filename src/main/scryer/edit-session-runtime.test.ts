import { describe, expect, it } from 'vitest'
import { createScryerMutableAgentRunRuntime } from './edit-session-runtime'

describe('Scryer mutable agent run runtime', () => {
  it('replays and awaits a terminal status for a late subscriber', async () => {
    const runtime = createScryerMutableAgentRunRuntime()
    await runtime.setRunStatus('run-late', 'done', { emit: false })
    let callbackCompleted = false

    const unsubscribe = await runtime.onRunFinished('run-late', async () => {
      await Promise.resolve()
      callbackCompleted = true
    })

    expect(callbackCompleted).toBe(true)
    unsubscribe()
  })

  it('awaits every terminal listener before reporting a listener failure', async () => {
    const runtime = createScryerMutableAgentRunRuntime()
    await runtime.setRunStatus('run-listeners', 'running', { emit: false })
    const calls: string[] = []
    await runtime.onRunFinished('run-listeners', () => {
      calls.push('first')
      throw new Error('first listener failed')
    })
    await runtime.onRunFinished('run-listeners', async () => {
      await Promise.resolve()
      calls.push('second')
    })

    await expect(runtime.setRunStatus('run-listeners', 'done')).rejects.toThrow(
      'first listener failed'
    )
    expect(calls).toEqual(['first', 'second'])
  })

  it('removes a late terminal listener when its replay fails', async () => {
    const runtime = createScryerMutableAgentRunRuntime()
    await runtime.setRunStatus('run-replay-failure', 'done', { emit: false })
    let attempts = 0

    await expect(
      runtime.onRunFinished('run-replay-failure', () => {
        attempts += 1
        throw new Error('replay failed')
      })
    ).rejects.toThrow('replay failed')
    await expect(runtime.setRunStatus('run-replay-failure', 'done')).resolves.toBeUndefined()
    expect(attempts).toBe(1)
  })
})
