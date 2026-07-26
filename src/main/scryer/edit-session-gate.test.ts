import { describe, expect, it } from 'vitest'
import type {
  ScryerModelValidateResult,
  ScryerPlanPendingResult,
  ScryerValidationFinding
} from './engine'
import { evaluateCompletionGate, foldInputFor } from './edit-session-gate'

function pending(changeType?: 'deleted' | 'reworded'): ScryerPlanPendingResult {
  const change =
    changeType === 'deleted'
      ? { type: 'deleted' as const }
      : changeType === 'reworded'
        ? { type: 'reworded' as const, field: 'name', from: 'API', to: 'Public API' }
        : null
  const changes: ScryerPlanPendingResult['changes'] = change
    ? [{ kind: 'node', id: 'api', label: 'API', changes: [change] }]
    : []
  return {
    clean: changes.length === 0,
    changes,
    summary: {
      total: changes.length,
      byKind: changes.length > 0 ? { node: 1 } : {},
      byChange: changeType ? { [changeType]: 1 } : {},
      toImplement: 0,
      toReimplement: changeType === 'reworded' ? 1 : 0,
      toMove: 0,
      toDelete: changeType === 'deleted' ? 1 : 0,
      toRepoint: 0
    }
  }
}

function validation(findings: ScryerValidationFinding[] = []): ScryerModelValidateResult {
  return {
    findings,
    validationWarningCount: findings.filter((finding) => finding.severity === 'warning').length,
    validationErrorCount: findings.filter((finding) => finding.severity === 'error').length
  }
}

describe('Scryer edit session completion gate', () => {
  it('returns an explicit nothing-to-fold terminal outcome', () => {
    expect(evaluateCompletionGate({ pending: pending(), validation: validation() })).toMatchObject({
      ok: true,
      foldAllowed: false,
      autoFoldAllowed: false,
      outcome: 'nothing_to_fold',
      leaseDisposition: 'retained',
      nextAction: 'nothing_to_fold'
    })
  })

  it('allows warnings-only candidate state to auto fold', () => {
    const result = evaluateCompletionGate({
      pending: pending('reworded'),
      validation: validation([
        {
          code: 'description_too_long',
          severity: 'warning',
          message: 'Description is long'
        }
      ])
    })

    expect(result).toMatchObject({
      foldAllowed: true,
      autoFoldAllowed: true,
      outcome: 'needs_attention',
      nextAction: 'fold_allowed',
      validation: { blockingCount: 0, warningCount: 1 }
    })
  })

  it('keeps destructive valid work foldable but blocks automatic fold', () => {
    const result = evaluateCompletionGate({
      pending: pending('deleted'),
      validation: validation()
    })

    expect(result).toMatchObject({
      ok: true,
      foldAllowed: true,
      autoFoldAllowed: false,
      outcome: 'needs_attention',
      nextAction: 'manual_review',
      pending: { foldable: true }
    })
    expect(result.pending.risks).toEqual([
      expect.objectContaining({ code: 'destructive_change', changeId: 'api' })
    ])
  })

  it('returns needs_attention for a candidate validation blocker', () => {
    const result = evaluateCompletionGate({
      pending: pending('reworded'),
      validation: validation([
        {
          code: 'missing_reference',
          severity: 'error',
          message: 'Planned state references a missing node'
        }
      ])
    })

    expect(result).toMatchObject({
      ok: false,
      foldAllowed: false,
      autoFoldAllowed: false,
      outcome: 'needs_attention',
      nextAction: 'fix_validation',
      validation: { blockingCount: 1 }
    })
  })

  it('blocks controller completion when its required lease is missing', () => {
    const result = evaluateCompletionGate({
      pending: pending('reworded'),
      validation: validation(),
      requireActiveLease: true
    })

    expect(result).toMatchObject({
      ok: false,
      foldAllowed: false,
      autoFoldAllowed: false,
      outcome: 'needs_attention',
      nextAction: 'blocked_by_lease',
      lease: { active: false, blocked: true }
    })
  })

  it('builds one all-target fold input for automatic completion', () => {
    expect(foldInputFor(pending('reworded').changes)).toEqual({
      mode: 'agent_completion',
      all: true
    })
    expect(foldInputFor([])).toBeNull()
  })
})
