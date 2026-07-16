import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CompletionGateResult } from './edit-session-gate'
import { hasPreSyncSnapshot, readModel, writeModel } from './model-store'
import { beginSync, cancelSync, finishSync, recordSyncCompletionGate } from './sync'

function completionGate(
  overrides: Partial<
    Pick<CompletionGateResult, 'ok' | 'outcome' | 'leaseDisposition' | 'nextAction'>
  > = {}
): CompletionGateResult {
  return {
    ok: true,
    foldAllowed: false,
    autoFoldAllowed: false,
    outcome: 'folded',
    leaseDisposition: 'released_after_completion',
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
    lease: { active: true, blocked: false, owner: 'agent', agentRunId: 'run-sync' },
    ...overrides
  }
}

describe('architecture sync lifecycle', () => {
  it('creates a real pre-sync snapshot, builds a drift prompt, and restores the model on cancel', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-'))
    await mkdir(join(projectPath, 'src'), { recursive: true })
    await writeFile(join(projectPath, 'src', 'index.ts'), 'export const v = 1\n')
    await writeModel(projectPath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Shop', description: 'Commerce', kind: 'system' }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container', status: 'implemented' }
        }
      ],
      edges: [],
      sourceMap: { api: [{ pattern: 'src/**/*.ts' }] },
      projectPath
    })

    await beginSync(projectPath, { modelName: 'Architecture' })
    const model = await readModel(projectPath)
    model.nodes[1]!.data.name = 'Broken During Sync'
    await writeModel(projectPath, model)

    const restored = await cancelSync(projectPath)
    expect(restored.nodes.find((node) => node.id === 'api')?.data.name).toBe('API')

    const prompt = (await beginSync(projectPath, { modelName: 'Architecture' })).prompt
    expect(prompt).toContain('architecture model "Architecture"')
    expect(prompt).toContain('"api"')
    expect(prompt).toContain('src/**/*.ts')
    expect(prompt).not.toContain('"position"')
    expect(prompt).not.toContain('"refPositions"')
  })

  it('clears implementing state and updates sync marker when sync finishes', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-finish-'))
    await writeModel(projectPath, {
      nodes: [],
      edges: [],
      sourceMap: {},
      projectPath
    })

    await beginSync(projectPath, { modelName: 'Architecture' })
    recordSyncCompletionGate(projectPath, completionGate())
    await finishSync(projectPath)

    await expect(readFile(join(projectPath, '.scryer', '.implementing'), 'utf8')).rejects.toThrow()
    expect(hasPreSyncSnapshot(projectPath)).toBe(false)
    await expect(readFile(join(projectPath, '.scryer', '.sync'), 'utf8')).resolves.toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    )
  })

  it.each([
    {
      label: 'fix_validation',
      gate: completionGate({
        ok: false,
        outcome: 'needs_attention',
        nextAction: 'fix_validation',
        leaseDisposition: 'retained_for_review'
      })
    },
    {
      label: 'manual_review',
      gate: completionGate({
        outcome: 'needs_attention',
        nextAction: 'manual_review',
        leaseDisposition: 'retained_for_review'
      })
    },
    {
      label: 'blocked_by_lease',
      gate: completionGate({
        ok: false,
        outcome: 'needs_attention',
        nextAction: 'blocked_by_lease',
        leaseDisposition: 'retained_by_other_owner'
      })
    },
    {
      label: 'needs_attention',
      gate: completionGate({
        outcome: 'needs_attention',
        nextAction: 'fold_allowed',
        leaseDisposition: 'retained_for_review'
      })
    },
    {
      label: 'active lease',
      gate: completionGate({ leaseDisposition: 'retained_for_review' })
    }
  ])('preserves sync recovery state when completion is $label', async ({ gate }) => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-gate-'))
    await writeModel(projectPath, { nodes: [], edges: [], sourceMap: {}, projectPath })
    await beginSync(projectPath, { modelName: 'Architecture' })
    const baselinePath = join(projectPath, '.scryer', 'model.baseline.scry')
    await writeFile(baselinePath, 'baseline-before', 'utf8')
    recordSyncCompletionGate(projectPath, gate)

    await expect(finishSync(projectPath)).rejects.toThrow('completion gate')

    await expect(readFile(join(projectPath, '.scryer', '.sync'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(projectPath, '.scryer', '.implementing'), 'utf8')).resolves.toBe('')
    await expect(readFile(baselinePath, 'utf8')).resolves.toBe('baseline-before')
    expect(hasPreSyncSnapshot(projectPath)).toBe(true)
  })

  it('clears stale completion state when a sync is cancelled', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-cancel-gate-'))
    await writeModel(projectPath, { nodes: [], edges: [], sourceMap: {}, projectPath })
    await beginSync(projectPath, { modelName: 'Architecture' })
    recordSyncCompletionGate(projectPath, completionGate())

    await cancelSync(projectPath)

    expect(hasPreSyncSnapshot(projectPath)).toBe(false)
    await expect(finishSync(projectPath)).rejects.toThrow('No Scryer completion gate')
    await expect(readFile(join(projectPath, '.scryer', '.sync'), 'utf8')).rejects.toThrow()
  })

  it('does not let a duplicate blocked completion downgrade a successful gate', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-duplicate-gate-'))
    await writeModel(projectPath, { nodes: [], edges: [], sourceMap: {}, projectPath })
    await beginSync(projectPath, { modelName: 'Architecture' })
    recordSyncCompletionGate(projectPath, completionGate())
    recordSyncCompletionGate(
      projectPath,
      completionGate({
        ok: false,
        outcome: 'needs_attention',
        nextAction: 'blocked_by_lease',
        leaseDisposition: 'retained'
      })
    )

    await finishSync(projectPath)

    await expect(readFile(join(projectPath, '.scryer', '.sync'), 'utf8')).resolves.toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    )
  })
})
