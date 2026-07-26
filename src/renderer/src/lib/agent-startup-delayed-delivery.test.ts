import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConsumeTabStartupCommand = vi.fn()
const mockPtyWrite = vi.fn()

type MutableState = {
  pendingStartupByTabId: Record<string, { command: string } | undefined>
  tabsByWorktree: Record<string, { id: string }[]>
  ptyIdsByTabId: Record<string, string[]>
  consumeTabStartupCommand: (tabId: string) => void
}

const state: MutableState = {
  pendingStartupByTabId: {},
  tabsByWorktree: {},
  ptyIdsByTabId: {},
  consumeTabStartupCommand: mockConsumeTabStartupCommand
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    subscribe: vi.fn(() => vi.fn())
  }
}))

import { deliverStartupToAlreadyMountedPane } from './agent-startup-delayed-delivery'

describe('deliverStartupToAlreadyMountedPane', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockConsumeTabStartupCommand.mockReset()
    mockPtyWrite.mockReset()
    state.pendingStartupByTabId = {}
    state.tabsByWorktree = {}
    state.ptyIdsByTabId = {}
    // Why: this suite runs in the node test environment, so `window` must be
    // installed on globalThis for the module's `window.api.pty.write` call.
    ;(globalThis as unknown as { window: unknown }).window = {
      api: { pty: { write: mockPtyWrite } }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function settle(promise: Promise<void>, steps: number): Promise<void> {
    for (let i = 0; i < steps; i += 1) {
      await vi.advanceTimersByTimeAsync(250)
    }
    await promise
  }

  it('types the launch command into a live pane whose queued startup was never consumed', async () => {
    state.pendingStartupByTabId = { 'tab-1': { command: 'node stub.cjs' } }
    state.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    state.ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    const run = deliverStartupToAlreadyMountedPane('tab-1', 'node stub.cjs')
    await settle(run, 4)

    expect(mockConsumeTabStartupCommand).toHaveBeenCalledWith('tab-1')
    expect(mockPtyWrite).toHaveBeenCalledWith('pty-1', 'node stub.cjs\r')
  })

  it('does nothing when the pane consumed the queued startup itself', async () => {
    state.pendingStartupByTabId = {}
    state.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    state.ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    await deliverStartupToAlreadyMountedPane('tab-1', 'node stub.cjs')

    expect(mockConsumeTabStartupCommand).not.toHaveBeenCalled()
    expect(mockPtyWrite).not.toHaveBeenCalled()
  })

  it('stops without typing when the tab was closed while waiting', async () => {
    state.pendingStartupByTabId = { 'tab-1': { command: 'node stub.cjs' } }
    state.tabsByWorktree = { 'wt-1': [] }
    state.ptyIdsByTabId = {}

    const run = deliverStartupToAlreadyMountedPane('tab-1', 'node stub.cjs')
    await settle(run, 2)

    expect(mockPtyWrite).not.toHaveBeenCalled()
  })

  it('holds off while the settle window is still counting and the pane consumes late', async () => {
    state.pendingStartupByTabId = { 'tab-1': { command: 'node stub.cjs' } }
    state.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    state.ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    const run = deliverStartupToAlreadyMountedPane('tab-1', 'node stub.cjs')
    // One settle probe elapses, then the pane's own consume effect wins the race.
    await vi.advanceTimersByTimeAsync(250)
    state.pendingStartupByTabId = {}
    await settle(run, 3)

    expect(mockConsumeTabStartupCommand).not.toHaveBeenCalled()
    expect(mockPtyWrite).not.toHaveBeenCalled()
  })
})
