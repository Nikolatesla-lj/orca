import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CompletionGateResult } from './edit-session-gate'
import { hasPreSyncSnapshot } from './model-store'
import { beginSync, cancelSync, finishSync, recordSyncCompletionGate } from './sync'

type ScryModel = {
  version: '0.3'
  nodes: Record<string, unknown>[]
  links: Record<string, unknown>[]
  groups: Record<string, unknown>[]
  sourceMap: Record<string, unknown>
  boundaries: Record<string, unknown>
}

function scryModel(overrides: Partial<ScryModel> = {}): ScryModel {
  return {
    version: '0.3',
    nodes: [],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {},
    ...overrides
  }
}

// Seed the strict committed model on disk so sync reads it through the Engine.
async function seedCommitted(projectPath: string, model: ScryModel): Promise<void> {
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(model, null, 2),
    'utf8'
  )
}

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
  it('creates a real pre-sync snapshot and builds a drift prompt from the Engine model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-'))
    await mkdir(join(projectPath, 'src'), { recursive: true })
    await writeFile(join(projectPath, 'src', 'index.ts'), 'export const v = 1\n')
    await seedCommitted(
      projectPath,
      scryModel({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop', description: 'Commerce' },
          {
            id: 'api',
            kind: 'container',
            name: 'API',
            parentId: 'system',
            description: 'HTTP API',
            appearance: { status: 'implemented' }
          }
        ],
        sourceMap: { api: [{ pattern: 'src/**/*.ts' }] }
      })
    )

    const { prompt } = await beginSync(projectPath, { modelName: 'Architecture' })
    expect(hasPreSyncSnapshot(projectPath)).toBe(true)
    expect(prompt).toContain('architecture model "Architecture"')
    expect(prompt).toContain('"api"')
    expect(prompt).toContain('src/**/*.ts')
    expect(prompt).not.toContain('"position"')
    expect(prompt).not.toContain('"refPositions"')

    // Cancel tears down the sync sentinel; it does not restore through a legacy writer.
    await cancelSync(projectPath)
    expect(hasPreSyncSnapshot(projectPath)).toBe(false)
  })

  it('surfaces an Engine read failure on begin without falling back to a legacy reader', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-no-fallback-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    // A legacy C4-shaped document the strict Engine cannot parse. A legacy reader would
    // happily parse it; the Engine seam rejects it, and sync surfaces the failure.
    await writeFile(
      join(projectPath, '.scryer', 'model.scry'),
      JSON.stringify({
        nodes: [{ id: 'system', type: 'c4', data: { name: 'Shop', kind: 'system' } }],
        edges: []
      }),
      'utf8'
    )

    await expect(beginSync(projectPath, { modelName: 'Architecture' })).rejects.toThrow()
    // No sync sentinel is left behind by the failed begin.
    expect(hasPreSyncSnapshot(projectPath)).toBe(false)
  })

  it('clears implementing state and updates sync marker when sync finishes', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-finish-'))
    await seedCommitted(projectPath, scryModel())

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
    await seedCommitted(projectPath, scryModel())
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
    await seedCommitted(projectPath, scryModel())
    await beginSync(projectPath, { modelName: 'Architecture' })
    recordSyncCompletionGate(projectPath, completionGate())

    await cancelSync(projectPath)

    expect(hasPreSyncSnapshot(projectPath)).toBe(false)
    await expect(finishSync(projectPath)).rejects.toThrow('No Scryer completion gate')
    await expect(readFile(join(projectPath, '.scryer', '.sync'), 'utf8')).rejects.toThrow()
  })

  it('does not let a duplicate blocked completion downgrade a successful gate', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-sync-duplicate-gate-'))
    await seedCommitted(projectPath, scryModel())
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
