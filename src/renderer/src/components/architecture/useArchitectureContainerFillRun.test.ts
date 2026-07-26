// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { launchMock, toastErrorMock, closeTabMock, subscribeMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
  toastErrorMock: vi.fn(),
  closeTabMock: vi.fn(),
  subscribeMock: vi.fn(() => () => undefined)
}))

vi.mock('../../lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: launchMock
}))

vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({ closeTab: closeTabMock, ptyIdsByTabId: {} as Record<string, string[]> }),
    subscribe: subscribeMock
  }
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, message: vi.fn() }
}))

import { useArchitectureContainerFillRun } from './useArchitectureContainerFillRun'

const PROMPT = 'Fill out the internals of "API" ... run `orca scryer container fill --json-input -`'

const beginEditSession = vi.fn(async () => ({ projectPath: '/repo', agentRunId: 'tab-fill' }))
const prepareNodeFillPrompt = vi.fn(async () => ({ prompt: PROMPT }))

const markFillRun = vi.fn()
const roots: Root[] = []

function renderFill(): { current: (nodeId: string) => Promise<void> } {
  const ref: { current: (nodeId: string) => Promise<void> } = {
    current: async () => undefined
  }
  function Probe(): null {
    const { fillNodeWithAi } = useArchitectureContainerFillRun({
      projectPath: '/repo',
      worktreeId: 'wt-1',
      agentName: 'codex',
      activeModelName: 'model',
      beginFillRun: () => true,
      markFillRun,
      flushPendingWork: async () => undefined,
      reloadModel: async () => undefined,
      setMessage: vi.fn(),
      setError: vi.fn()
    })
    ref.current = fillNodeWithAi
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(createElement(Probe))
  })
  return ref
}

beforeEach(() => {
  vi.clearAllMocks()
  launchMock.mockReturnValue({ tabId: 'tab-fill', startupPlan: {}, pasteDraftAfterLaunch: false })
  beginEditSession.mockResolvedValue({ projectPath: '/repo', agentRunId: 'tab-fill' })
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = {
    architecture: {
      prepareNodeFillPrompt,
      beginEditSession,
      readEditSession: vi.fn(async () => ({ activeLease: null, completionGate: null })),
      readModel: vi.fn(async () => ({ nodes: [] }))
    },
    pty: { onExit: vi.fn(() => () => undefined) }
  }
})

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) {
      root.unmount()
    }
  })
})

describe('useArchitectureContainerFillRun', () => {
  it('launches with a token-free prompt and no Scryer proposal in the renderer intent', async () => {
    const fill = renderFill()
    await act(async () => {
      await fill.current('container-api')
    })

    expect(prepareNodeFillPrompt).toHaveBeenCalledWith({
      projectPath: '/repo',
      modelName: 'model',
      nodeId: 'container-api'
    })
    const launchArgs = launchMock.mock.calls[0]![0] as {
      prompt: string
      onBeforeStartup?: (tabId: string) => Promise<void>
      agent: string
    }
    // The renderer only forwards the prepared prompt; it never builds a proposal or
    // carries a lease token/authorization.
    expect(launchArgs.prompt).toBe(PROMPT)
    expect(launchArgs.prompt).not.toMatch(/token|leaseToken|authorization/i)
    expect(typeof launchArgs.onBeforeStartup).toBe('function')
  })

  it('acquires the edit session in onBeforeStartup, before the startup command is delivered', async () => {
    const fill = renderFill()
    await act(async () => {
      await fill.current('container-api')
    })
    const onBeforeStartup = (
      launchMock.mock.calls[0]![0] as { onBeforeStartup: (tabId: string) => Promise<void> }
    ).onBeforeStartup

    // beginEditSession runs only when the launcher invokes the pre-startup hook — i.e.
    // strictly before the agent's startup command (and its `orca scryer container fill`)
    // can run. The agentRunId is the tab id; no token is passed by the renderer.
    expect(beginEditSession).not.toHaveBeenCalled()
    await onBeforeStartup('tab-fill')
    // Exact-object match proves the renderer passes only { projectPath, agentRunId } —
    // no token / leaseToken / authorization crosses the IPC boundary.
    expect(beginEditSession).toHaveBeenCalledWith({ projectPath: '/repo', agentRunId: 'tab-fill' })
    expect(markFillRun).toHaveBeenCalledWith('running', expect.any(String))
  })

  it('fails the run and closes the tab when a conflicting lease blocks the session', async () => {
    beginEditSession.mockRejectedValueOnce(new Error('active lease belongs to another owner'))
    const fill = renderFill()
    await act(async () => {
      await fill.current('container-api')
    })
    const onBeforeStartup = (
      launchMock.mock.calls[0]![0] as { onBeforeStartup: (tabId: string) => Promise<void> }
    ).onBeforeStartup

    await expect(onBeforeStartup('tab-fill')).rejects.toThrow(/active lease/)
    // On conflict the run fails, the stray tab is closed, and 'running' is never set —
    // so the startup command (and the agent's write) never runs.
    expect(markFillRun).toHaveBeenCalledWith('failed', expect.any(String))
    expect(markFillRun).not.toHaveBeenCalledWith('running', expect.anything())
    expect(closeTabMock).toHaveBeenCalledWith('tab-fill')
    // The surfaced error is the lease message; it must not carry a lease token.
    expect(toastErrorMock.mock.calls[0]![0]).not.toMatch(/token/i)
  })
})
