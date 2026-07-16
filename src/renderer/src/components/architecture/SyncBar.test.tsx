// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncBar, type SyncBarProps } from './SyncBar'
import type { ScryerCompletionGateResult } from '../../../../shared/scryer/edit-session'

let root: Root | null = null
let container: HTMLDivElement | null = null

function gate(overrides: Partial<ScryerCompletionGateResult> = {}): ScryerCompletionGateResult {
  return {
    ok: true,
    foldAllowed: true,
    nextAction: 'fold_allowed',
    pending: {
      total: 1,
      foldable: true,
      byKind: { node: 1 },
      byChange: { added: 1 },
      changes: [],
      blockers: [],
      risks: []
    },
    validation: {
      blockingCount: 0,
      warningCount: 0,
      findings: []
    },
    lease: {
      active: false,
      blocked: false
    },
    ...overrides
  }
}

function renderBar(overrides: Partial<SyncBarProps> = {}): { text: string; props: SyncBarProps } {
  const props: SyncBarProps = {
    activeAgent: { name: 'Codex', available: true },
    driftedNodes: [],
    structureChanged: false,
    implementing: false,
    syncStatus: 'idle',
    syncMessage: null,
    syncLog: [],
    completionGate: null,
    projectPath: '/repo',
    onSync: vi.fn(),
    onCancelSync: vi.fn(),
    onDismissMessage: vi.fn(),
    onDismissDrift: vi.fn(),
    onToggleLock: vi.fn(),
    ...overrides
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<SyncBar {...props} />)
  })
  return { text: container.textContent ?? '', props }
}

function render(completionGate: ScryerCompletionGateResult | null): string {
  return renderBar({ completionGate }).text
}

afterEach(() => {
  vi.useRealTimers()
  root?.unmount()
  root = null
  container?.remove()
  container = null
})

describe('SyncBar completion gate rendering', () => {
  it('renders a foldable completion gate result', () => {
    expect(render(gate())).toContain('1 pending change ready to fold')
  })

  it('renders blocking completion gate actions', () => {
    expect(
      render(
        gate({
          ok: false,
          foldAllowed: false,
          nextAction: 'fix_validation',
          validation: { blockingCount: 2, warningCount: 0, findings: [] }
        })
      )
    ).toContain('Fix 2 validation errors before folding')
  })
})

describe('SyncBar attention terminal', () => {
  it('keeps an attention gate visible and actionable without auto-dismissing', () => {
    vi.useFakeTimers()
    const { props } = renderBar({
      syncStatus: 'attention',
      syncMessage: 'Manual review required before folding',
      completionGate: gate({
        ok: false,
        foldAllowed: false,
        nextAction: 'manual_review'
      })
    })

    const attention = container?.querySelector('[data-testid="architecture-sync-attention"]')
    expect(attention?.textContent).toContain('Manual review required before folding')
    // Attention exposes a Cancel action so the user can reconcile.
    expect(container?.querySelector('[data-testid="architecture-sync-cancel"]')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    // Attention must not auto-dismiss like a success terminal.
    expect(props.onDismissMessage).not.toHaveBeenCalled()
    expect(
      container?.querySelector('[data-testid="architecture-sync-attention"]')?.textContent
    ).toContain('Manual review required before folding')
  })

  it('does not treat idle + no drift as success when the gate needs attention', () => {
    vi.useFakeTimers()
    const { props } = renderBar({
      syncStatus: 'idle',
      syncMessage: 'Edit session blocked by another lease',
      completionGate: gate({
        ok: false,
        foldAllowed: false,
        nextAction: 'blocked_by_lease',
        lease: { active: true, blocked: true, owner: 'human' }
      })
    })

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(props.onDismissMessage).not.toHaveBeenCalled()
  })

  it('auto-dismisses a genuine success terminal', () => {
    vi.useFakeTimers()
    const { props } = renderBar({
      syncStatus: 'idle',
      syncMessage: 'Architecture sync finished',
      completionGate: gate({ ok: true, nextAction: 'nothing_to_fold' })
    })

    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(props.onDismissMessage).toHaveBeenCalled()
  })
})
