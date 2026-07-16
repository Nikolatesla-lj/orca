import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createScryerEditLeaseStore } from './edit-lease-store'
import {
  createScryerEditSessionController,
  type CompleteAgentEditSessionInput
} from './edit-session-controller'
import type { CompletionGateResult } from './edit-session-gate'
import { createScryerMutableAgentRunRuntime } from './edit-session-runtime'
import { createScryerEngine, type ScryerEngine, type ScryerOperationResult } from './engine'

async function writeScryerFile(projectPath: string, name: string, model: unknown): Promise<void> {
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(join(projectPath, '.scryer', name), JSON.stringify(model, null, 2), 'utf8')
}

function model(name = 'API') {
  return {
    version: '0.3',
    nodes: [{ id: 'api', kind: 'system', name }],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {}
  }
}

function controllerHarness(
  engine: ScryerEngine = createScryerEngine(),
  onCompletionGate?: (input: CompleteAgentEditSessionInput, result: CompletionGateResult) => void
) {
  const leaseStore = createScryerEditLeaseStore({
    tokens: { next: () => 'scryer-edit-controller-secret' }
  })
  const runtime = createScryerMutableAgentRunRuntime()
  const operationCalls: [string, unknown][] = []
  const instrumentedEngine: ScryerEngine = {
    ...engine,
    executeOperation<T = unknown>(operationId, input, context) {
      operationCalls.push([operationId, input])
      return engine.executeOperation<T>(operationId, input, context)
    }
  }
  const controller = createScryerEditSessionController({
    engine: instrumentedEngine,
    leaseStore,
    agentRuntime: runtime,
    onCompletionGate
  })
  return { controller, operationCalls, leaseStore, runtime }
}

async function beginSession(input: {
  projectPath: string
  agentRunId: string
  controller: ReturnType<typeof controllerHarness>['controller']
  runtime: ReturnType<typeof controllerHarness>['runtime']
}): Promise<void> {
  await input.runtime.setRunStatus(input.agentRunId, 'running', { emit: false })
  await input.controller.beginAgentEditSession({
    projectPath: input.projectPath,
    agentRunId: input.agentRunId
  })
}

async function markDone(
  runtime: ReturnType<typeof controllerHarness>['runtime'],
  agentRunId: string
): Promise<void> {
  await runtime.setRunStatus(agentRunId, 'done', { emit: false })
}

describe('Scryer edit session controller', () => {
  it('awaits runtime completion and releases a nothing-to-fold session', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-empty-'))
    await writeScryerFile(projectPath, 'model.scry', model())
    const onCompletionGate = vi.fn()
    const { controller, leaseStore, operationCalls, runtime } = controllerHarness(
      createScryerEngine(),
      onCompletionGate
    )
    const agentRunId = 'run-empty'
    await beginSession({ projectPath, agentRunId, controller, runtime })

    await runtime.setRunStatus(agentRunId, 'done')

    await expect(leaseStore.read({ projectPath })).resolves.toBeNull()
    expect(operationCalls.map(([operationId]) => operationId)).toEqual([
      'scryer.plan.pending',
      'scryer.model.validate'
    ])
    expect(onCompletionGate).toHaveBeenCalledWith(
      { projectPath, agentRunId, foldPolicy: 'when_gate_passes' },
      expect.objectContaining({
        outcome: 'nothing_to_fold',
        leaseDisposition: 'released_after_completion'
      })
    )
  })

  it('auto folds warnings-only candidate work in one operation and rereads terminal state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-warning-'))
    await writeScryerFile(projectPath, 'model.scry', {
      ...model(),
      nodes: []
    })
    await writeScryerFile(projectPath, 'planned.scry', {
      ...model(),
      nodes: [{ id: 'component', kind: 'component', name: 'Orphan component' }]
    })
    const { controller, leaseStore, operationCalls, runtime } = controllerHarness()
    const agentRunId = 'run-warning'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    const result = await controller.completeAgentEditSession({
      projectPath,
      agentRunId,
      foldPolicy: 'when_gate_passes'
    })

    expect(result).toMatchObject({
      outcome: 'folded',
      nextAction: 'nothing_to_fold',
      pending: { total: 0 },
      validation: { blockingCount: 0, warningCount: 1 },
      leaseDisposition: 'released_after_completion'
    })
    expect(operationCalls.filter(([id]) => id === 'scryer.plan.fold')).toEqual([
      ['scryer.plan.fold', { mode: 'agent_completion', all: true }]
    ])
    expect(operationCalls.filter(([id]) => id === 'scryer.model.validate')).toEqual([
      ['scryer.model.validate', { layer: 'plan' }],
      ['scryer.model.validate', { layer: 'plan' }]
    ])
    await expect(leaseStore.read({ projectPath })).resolves.toBeNull()
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes).toEqual([
      expect.objectContaining({ id: 'component', name: 'Orphan component' })
    ])
  })

  it('keeps destructive valid work visible for manual review without auto folding', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-review-'))
    await writeScryerFile(projectPath, 'model.scry', model())
    await writeScryerFile(projectPath, 'planned.scry', {
      ...model(),
      nodes: []
    })
    const { controller, leaseStore, operationCalls, runtime } = controllerHarness()
    const agentRunId = 'run-review'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    const result = await controller.completeAgentEditSession({
      projectPath,
      agentRunId,
      foldPolicy: 'when_gate_passes'
    })

    expect(result).toMatchObject({
      outcome: 'needs_attention',
      foldAllowed: true,
      autoFoldAllowed: false,
      nextAction: 'manual_review',
      leaseDisposition: 'retained_for_review'
    })
    expect(operationCalls.some(([id]) => id === 'scryer.plan.fold')).toBe(false)
    await expect(leaseStore.read({ projectPath })).resolves.toMatchObject({ agentRunId })
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes).toHaveLength(1)
  })

  it('returns needs_attention and retains the lease for a validation blocker', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-blocked-'))
    await writeScryerFile(projectPath, 'model.scry', model())
    await writeScryerFile(projectPath, 'planned.scry', model('Public API'))
    const baseEngine = createScryerEngine()
    const engine: ScryerEngine = {
      ...baseEngine,
      executeOperation<T = unknown>(operationId, input, context) {
        if (operationId === 'scryer.model.validate') {
          return Promise.resolve({
            ok: true,
            operationId,
            requestId: 'req-validation-blocker',
            result: {
              findings: [
                {
                  code: 'missing_reference',
                  severity: 'error',
                  message: 'Candidate references a missing node'
                }
              ],
              validationWarningCount: 0,
              validationErrorCount: 1
            }
          } as ScryerOperationResult<T>)
        }
        return baseEngine.executeOperation<T>(operationId, input, context)
      }
    }
    const { controller, leaseStore, operationCalls, runtime } = controllerHarness(engine)
    const agentRunId = 'run-blocked'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    const result = await controller.completeAgentEditSession({
      projectPath,
      agentRunId,
      foldPolicy: 'when_gate_passes'
    })

    expect(result).toMatchObject({
      outcome: 'needs_attention',
      nextAction: 'fix_validation',
      validation: { blockingCount: 1 },
      leaseDisposition: 'retained_for_review'
    })
    expect(operationCalls.some(([id]) => id === 'scryer.plan.fold')).toBe(false)
    await expect(leaseStore.read({ projectPath })).resolves.toMatchObject({ agentRunId })
  })

  it('rereads the gate after folding and reports remaining work as needs_attention', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-remaining-'))
    await writeScryerFile(projectPath, 'model.scry', model())
    await writeScryerFile(projectPath, 'planned.scry', model('Public API'))
    const baseEngine = createScryerEngine()
    const engine: ScryerEngine = {
      ...baseEngine,
      executeOperation<T = unknown>(operationId, input, context) {
        if (operationId === 'scryer.plan.fold') {
          return Promise.resolve({
            ok: true,
            operationId,
            requestId: 'req-noop-fold',
            result: { folded: [], remaining: [] }
          } as ScryerOperationResult<T>)
        }
        return baseEngine.executeOperation<T>(operationId, input, context)
      }
    }
    const { controller, leaseStore, operationCalls, runtime } = controllerHarness(engine)
    const agentRunId = 'run-remaining'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    const result = await controller.completeAgentEditSession({
      projectPath,
      agentRunId,
      foldPolicy: 'when_gate_passes'
    })

    expect(result).toMatchObject({
      outcome: 'needs_attention',
      pending: { total: 1 },
      leaseDisposition: 'retained_for_review'
    })
    expect(operationCalls.filter(([id]) => id === 'scryer.plan.pending')).toHaveLength(2)
    await expect(leaseStore.read({ projectPath })).resolves.toMatchObject({ agentRunId })
  })

  it('rejects a destructive candidate introduced after the pre-fold gate', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-race-'))
    await writeScryerFile(projectPath, 'model.scry', model())
    await writeScryerFile(projectPath, 'planned.scry', model('Public API'))
    const baseEngine = createScryerEngine()
    let changedBeforeFold = false
    const engine: ScryerEngine = {
      ...baseEngine,
      async executeOperation<T = unknown>(operationId, input, context) {
        if (operationId === 'scryer.plan.fold' && !changedBeforeFold) {
          changedBeforeFold = true
          await writeScryerFile(projectPath, 'planned.scry', { ...model(), nodes: [] })
        }
        return baseEngine.executeOperation<T>(operationId, input, context)
      }
    }
    const { controller, leaseStore, runtime } = controllerHarness(engine)
    const agentRunId = 'run-race'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    await expect(
      controller.completeAgentEditSession({
        projectPath,
        agentRunId,
        foldPolicy: 'when_gate_passes'
      })
    ).rejects.toThrow('Automatic completion requires manual review')
    await expect(leaseStore.read({ projectPath })).resolves.toMatchObject({ agentRunId })
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes).toHaveLength(1)
  })

  it('retains the lease when completion evaluation fails unexpectedly', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-controller-error-'))
    const engine: ScryerEngine = {
      async executeOperation(operationId) {
        return {
          ok: false as const,
          operationId,
          requestId: 'req-failed',
          error: {
            code: 'internal_error' as const,
            message: 'Evaluation failed',
            retryable: false
          }
        }
      },
      readView: vi.fn()
    }
    const { controller, leaseStore, runtime } = controllerHarness(engine)
    const agentRunId = 'run-error'
    await beginSession({ projectPath, agentRunId, controller, runtime })
    await markDone(runtime, agentRunId)

    await expect(controller.completeAgentEditSession({ projectPath, agentRunId })).rejects.toThrow(
      'Evaluation failed'
    )
    await expect(leaseStore.read({ projectPath })).resolves.toMatchObject({ agentRunId })
  })
})
