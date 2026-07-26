import { describe, expect, it } from 'vitest'
import type { ScryerCompletionGateResult } from '../../../../shared/scryer/edit-session'
import { resolveContainerFillTerminal } from './architecture-container-fill-terminal'

function gate(overrides: Partial<ScryerCompletionGateResult> = {}): ScryerCompletionGateResult {
  return {
    ok: true,
    foldAllowed: false,
    nextAction: 'nothing_to_fold',
    pending: {
      total: 0,
      foldable: true,
      byKind: {},
      byChange: {},
      changes: [],
      blockers: [],
      risks: []
    },
    validation: { blockingCount: 0, warningCount: 0, findings: [] },
    lease: { active: false, blocked: false },
    ...overrides
  }
}

describe('resolveContainerFillTerminal', () => {
  it('reports success only when the gate passed AND the subtree is present', () => {
    expect(resolveContainerFillTerminal({ gate: gate(), generatedSubtreePresent: true })).toEqual({
      phase: 'done',
      message: 'Container generated with AI'
    })
  })

  it('does not let a zero-pending gate turn a failed/no-op fill into success', () => {
    // container.fill errored or wrote nothing: gate still reads nothing_to_fold, but
    // the container stays empty — this must be attention, never success.
    const terminal = resolveContainerFillTerminal({ gate: gate(), generatedSubtreePresent: false })
    expect(terminal.phase).toBe('needs_attention')
  })

  it('keeps a blocked-by-lease gate as attention and never clears it to success', () => {
    const terminal = resolveContainerFillTerminal({
      gate: gate({
        ok: false,
        nextAction: 'blocked_by_lease',
        lease: { active: true, blocked: true }
      }),
      generatedSubtreePresent: true
    })
    expect(terminal.phase).toBe('needs_attention')
    expect(terminal.message).toBe('Edit session blocked by another lease')
  })

  it('keeps validation / manual-review gates as attention', () => {
    for (const nextAction of ['fix_validation', 'manual_review', 'fold_allowed'] as const) {
      expect(
        resolveContainerFillTerminal({
          gate: gate({ ok: false, nextAction }),
          generatedSubtreePresent: true
        }).phase
      ).toBe('needs_attention')
    }
  })

  it('treats a missing gate (session not evaluable) as attention, not success', () => {
    expect(resolveContainerFillTerminal({ gate: null, generatedSubtreePresent: true })).toEqual({
      phase: 'needs_attention',
      message: 'Container generation needs attention'
    })
  })
})
