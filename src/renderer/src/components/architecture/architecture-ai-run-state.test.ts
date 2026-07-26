import { describe, expect, it } from 'vitest'
import {
  beginArchitectureAiRun,
  createInitialArchitectureAiRunState,
  transitionArchitectureAiRun
} from './architecture-ai-run-state'

describe('architecture AI run state machine', () => {
  it('guards duplicate starts and accepts one terminal transition per run', () => {
    const initial = createInitialArchitectureAiRunState()
    const started = beginArchitectureAiRun(initial, 'sync', 'Preparing sync')

    expect(started.accepted).toBe(true)
    expect(started.state.sync).toMatchObject({
      phase: 'launching',
      message: 'Preparing sync',
      runId: 1
    })

    const duplicateStart = beginArchitectureAiRun(started.state, 'sync', 'Duplicate sync')
    expect(duplicateStart.accepted).toBe(false)
    expect(duplicateStart.state).toBe(started.state)

    const running = transitionArchitectureAiRun(started.state, 'sync', 'running', 'Sync is running')
    expect(running.changed).toBe(true)
    expect(running.state.sync).toMatchObject({
      phase: 'running',
      message: 'Sync is running',
      runId: 1
    })

    const done = transitionArchitectureAiRun(running.state, 'sync', 'done', 'Sync finished')
    expect(done.changed).toBe(true)
    expect(done.state.sync).toMatchObject({
      phase: 'done',
      message: 'Sync finished',
      runId: 1
    })

    const duplicateTerminal = transitionArchitectureAiRun(
      done.state,
      'sync',
      'cancelled',
      'Late cancel'
    )
    expect(duplicateTerminal.changed).toBe(false)
    expect(duplicateTerminal.state).toBe(done.state)

    const restarted = beginArchitectureAiRun(done.state, 'sync', 'Preparing another sync')
    expect(restarted.accepted).toBe(true)
    expect(restarted.state.sync).toMatchObject({
      phase: 'launching',
      message: 'Preparing another sync',
      runId: 2
    })
  })

  it('treats needs_attention as a terminal, non-success outcome', () => {
    const started = beginArchitectureAiRun(createInitialArchitectureAiRunState(), 'sync')
    const running = transitionArchitectureAiRun(started.state, 'sync', 'running')
    const attention = transitionArchitectureAiRun(
      running.state,
      'sync',
      'needs_attention',
      'Fix 2 validation errors before folding'
    )

    expect(attention.changed).toBe(true)
    expect(attention.state.sync).toMatchObject({
      phase: 'needs_attention',
      message: 'Fix 2 validation errors before folding'
    })

    // Why: an attention terminal must never later read as a successful completion.
    const lateDone = transitionArchitectureAiRun(attention.state, 'sync', 'done', 'Sync finished')
    expect(lateDone.changed).toBe(false)
    expect(lateDone.state).toBe(attention.state)
    expect(lateDone.state.sync.phase).toBe('needs_attention')
  })
})
