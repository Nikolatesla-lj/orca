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
    await runtime.onRunFinished('run-listeners', async () => {
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
})
