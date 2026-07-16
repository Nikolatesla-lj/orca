import { describe, expect, it } from 'vitest'
import { nodeFillPrompt } from './prompts'

function fillPrompt(overrides: Partial<Parameters<typeof nodeFillPrompt>[0]> = {}): string {
  return nodeFillPrompt({
    modelName: 'model',
    cwd: '/repo',
    nodeId: 'container-api',
    nodeName: 'API',
    nodeKind: 'container',
    modelJson: '{}',
    ...overrides
  })
}

describe('nodeFillPrompt (Container Generation cutover)', () => {
  it('keeps the "Fill out the internals" opener the IPC prompt tests assert', () => {
    expect(fillPrompt({ nodeName: 'Handler' })).toContain('Fill out the internals of "Handler"')
  })

  it('directs the agent to a single atomic fill_container Container Generation call', () => {
    const prompt = fillPrompt()
    expect(prompt).toContain('Container Generation')
    expect(prompt).toContain('fill_container')
    expect(prompt).toContain('EXACTLY ONCE')
    expect(prompt).toContain('container_id "container-api"')
  })

  it('removes every legacy set_node / per-node mutation instruction', () => {
    const prompt = fillPrompt()
    expect(prompt).not.toContain('set_node')
    expect(prompt).not.toContain('add_nodes')
    expect(prompt).not.toContain('get_node')
  })

  it('forbids legacy fallback after an Engine failure', () => {
    const prompt = fillPrompt()
    expect(prompt).toMatch(/do NOT fall back to a legacy tool/i)
    expect(prompt).toMatch(/do NOT retry/i)
  })

  it('does not instruct the agent to fold or decide the terminal state itself', () => {
    const prompt = fillPrompt()
    expect(prompt).toMatch(/Do NOT fold/i)
    expect(prompt).toContain('completion gate owns')
    // The retired "Call get_changes" finish instruction must be gone.
    expect(prompt).not.toContain('get_changes')
  })
})
