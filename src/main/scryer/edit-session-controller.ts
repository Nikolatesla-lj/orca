import type { ScryerEditLeaseStore } from './edit-lease-store'
import type {
  ModelEditLease,
  ScryerEngine,
  ScryerModelValidateResult,
  ScryerOperationContext,
  ScryerOperationResult,
  ScryerPlanPendingResult
} from './engine'
import {
  evaluateCompletionGate,
  foldInputFor,
  type CompletionGateLeaseDisposition,
  type CompletionGateResult
} from './edit-session-gate'
import { reportEditSessionCompletion } from './edit-session-completion-observer'

export type BeginAgentEditSessionInput = {
  projectPath: string
  agentRunId: string
}

export type EditSessionStarted = {
  projectPath: string
  agentRunId: string
}

export type CompleteAgentEditSessionInput = {
  projectPath: string
  agentRunId: string
  foldPolicy?: 'never' | 'when_gate_passes'
}

export type CancelAgentEditSessionInput = {
  projectPath: string
  agentRunId: string
}

export type ReadEditSessionInput = {
  projectPath: string
}

export type EditSessionLeaseStatus = {
  owner?: ModelEditLease['owner']
  agentRunId?: string
  createdAt?: string
  expiresAt?: string
}

export type EditSessionStatus = {
  projectPath: string
  activeLease: EditSessionLeaseStatus | null
}

export type ScryerEditSessionController = {
  beginAgentEditSession(input: BeginAgentEditSessionInput): Promise<EditSessionStarted>
  completeAgentEditSession(input: CompleteAgentEditSessionInput): Promise<CompletionGateResult>
  cancelAgentEditSession(input: CancelAgentEditSessionInput): Promise<void>
  readEditSession(input: ReadEditSessionInput): Promise<EditSessionStatus>
}

export type ScryerAgentRunStatus = 'running' | 'done' | 'cancelled' | 'crashed'

export type ScryerAgentRunFinishedEvent = {
  agentRunId: string
  status: Exclude<ScryerAgentRunStatus, 'running'>
}

export type ScryerAgentRunRuntime = {
  getRunStatus(agentRunId: string): Promise<ScryerAgentRunStatus>
  onRunFinished(
    agentRunId: string,
    callback: (event: ScryerAgentRunFinishedEvent) => void | Promise<void>
  ): Promise<() => void>
}

export type CreateScryerEditSessionControllerOptions = {
  engine: ScryerEngine
  leaseStore: ScryerEditLeaseStore
  agentRuntime: ScryerAgentRunRuntime
  onCompletionGate?: (input: CompleteAgentEditSessionInput, result: CompletionGateResult) => void
}

function unwrapOperationResult<T>(result: ScryerOperationResult<T>): T {
  if (result.ok) {
    return result.result
  }
  throw new Error(`${result.operationId} failed: ${result.error.code} ${result.error.message}`)
}

function operationContext(
  projectPath: string,
  agentRunId: string,
  leaseToken?: string
): ScryerOperationContext {
  return {
    transport: 'agent',
    caller: 'agent',
    cwd: projectPath,
    projectRoot: projectPath,
    agentRunId,
    ...(leaseToken ? { leaseToken } : {})
  }
}

function toLeaseStatus(lease: ModelEditLease | null): EditSessionLeaseStatus | null {
  if (!lease) {
    return null
  }
  return {
    ...(lease.owner ? { owner: lease.owner } : {}),
    ...(lease.agentRunId ? { agentRunId: lease.agentRunId } : {}),
    ...(lease.createdAt ? { createdAt: lease.createdAt } : {}),
    ...(lease.expiresAt ? { expiresAt: lease.expiresAt } : {})
  }
}

function ownAgentLease(
  activeLease: ModelEditLease | null,
  agentRunId: string
): ModelEditLease | null {
  return activeLease?.owner === 'agent' && activeLease.agentRunId === agentRunId
    ? activeLease
    : null
}

async function readCompletionGate(input: {
  engine: ScryerEngine
  projectPath: string
  agentRunId: string
  activeLease: ModelEditLease | null
}): Promise<CompletionGateResult> {
  const context = operationContext(
    input.projectPath,
    input.agentRunId,
    ownAgentLease(input.activeLease, input.agentRunId)?.token
  )
  const pending = unwrapOperationResult(
    await input.engine.executeOperation<ScryerPlanPendingResult>('scryer.plan.pending', {}, context)
  )
  const validation = unwrapOperationResult(
    await input.engine.executeOperation<ScryerModelValidateResult>(
      'scryer.model.validate',
      { layer: 'plan' },
      context
    )
  )
  return evaluateCompletionGate({
    pending,
    validation,
    activeLease: input.activeLease,
    agentRunId: input.agentRunId,
    requireActiveLease: true
  })
}

export function createScryerEditSessionController(
  options: CreateScryerEditSessionControllerOptions
): ScryerEditSessionController {
  const subscriptions = new Map<string, () => void>()

  function sessionKey(projectPath: string, agentRunId: string): string {
    return `${projectPath}\u0000${agentRunId}`
  }

  function unsubscribeSession(projectPath: string, agentRunId: string): void {
    const key = sessionKey(projectPath, agentRunId)
    subscriptions.get(key)?.()
    subscriptions.delete(key)
  }

  async function releaseCompletedSession(
    projectPath: string,
    agentRunId: string,
    activeLease: ModelEditLease | null
  ): Promise<CompletionGateLeaseDisposition> {
    const ownLease = ownAgentLease(activeLease, agentRunId)
    const released = await options.leaseStore.release({
      projectPath,
      agentRunId,
      ...(ownLease ? { token: ownLease.token } : {})
    })
    unsubscribeSession(projectPath, agentRunId)
    return released.ok ? 'released_after_completion' : 'retained_by_other_owner'
  }

  function retainedDisposition(
    activeLease: ModelEditLease | null,
    agentRunId: string
  ): CompletionGateLeaseDisposition {
    if (ownAgentLease(activeLease, agentRunId)) {
      return 'retained_for_review'
    }
    return activeLease ? 'retained_by_other_owner' : 'retained'
  }

  async function cancelSession(projectPath: string, agentRunId: string): Promise<void> {
    await options.leaseStore.release({ projectPath, agentRunId })
    unsubscribeSession(projectPath, agentRunId)
  }

  const controller: ScryerEditSessionController = {
    async beginAgentEditSession(input) {
      const status = await options.agentRuntime.getRunStatus(input.agentRunId)
      if (status !== 'running') {
        throw new Error(`Cannot begin Scryer edit session for agent run in '${status}' state`)
      }
      const acquired = await options.leaseStore.acquire({
        projectPath: input.projectPath,
        owner: 'agent',
        agentRunId: input.agentRunId
      })
      if (!acquired.ok) {
        throw new Error(
          `Cannot begin Scryer edit session; active lease belongs to ${
            acquired.activeLease.agentRunId ?? acquired.activeLease.owner ?? 'another owner'
          }`
        )
      }
      const key = sessionKey(input.projectPath, input.agentRunId)
      unsubscribeSession(input.projectPath, input.agentRunId)
      const unsubscribe = await options.agentRuntime.onRunFinished(
        input.agentRunId,
        async (event) => {
          if (event.status === 'done') {
            await controller.completeAgentEditSession({
              projectPath: input.projectPath,
              agentRunId: input.agentRunId,
              foldPolicy: 'when_gate_passes'
            })
            return
          }
          await controller.cancelAgentEditSession({
            projectPath: input.projectPath,
            agentRunId: input.agentRunId
          })
        }
      )
      if ((await options.agentRuntime.getRunStatus(input.agentRunId)) === 'running') {
        subscriptions.set(key, unsubscribe)
      } else {
        unsubscribe()
      }
      return {
        projectPath: input.projectPath,
        agentRunId: input.agentRunId
      }
    },
    async completeAgentEditSession(input) {
      const status = await options.agentRuntime.getRunStatus(input.agentRunId)
      if (status !== 'done') {
        throw new Error(`Cannot complete Scryer edit session for agent run in '${status}' state`)
      }
      const activeLease = await options.leaseStore.read({ projectPath: input.projectPath })
      try {
        let gate = await readCompletionGate({ ...input, engine: options.engine, activeLease })
        let currentLease = activeLease
        if (input.foldPolicy === 'when_gate_passes' && gate.autoFoldAllowed) {
          const foldInput = foldInputFor(gate.pending.changes)
          if (foldInput) {
            unwrapOperationResult(
              await options.engine.executeOperation(
                'scryer.plan.fold',
                foldInput,
                operationContext(
                  input.projectPath,
                  input.agentRunId,
                  ownAgentLease(currentLease, input.agentRunId)?.token
                )
              )
            )
          }
          currentLease = await options.leaseStore.read({ projectPath: input.projectPath })
          const refreshedGate = await readCompletionGate({
            ...input,
            engine: options.engine,
            activeLease: currentLease
          })
          gate = {
            ...refreshedGate,
            outcome:
              refreshedGate.pending.total === 0 && refreshedGate.validation.blockingCount === 0
                ? 'folded'
                : 'needs_attention'
          }
        }
        if (gate.outcome === 'folded' || gate.outcome === 'nothing_to_fold') {
          return reportEditSessionCompletion(options.onCompletionGate, input, {
            ...gate,
            leaseDisposition: await releaseCompletedSession(
              input.projectPath,
              input.agentRunId,
              currentLease
            )
          })
        }
        unsubscribeSession(input.projectPath, input.agentRunId)
        return reportEditSessionCompletion(options.onCompletionGate, input, {
          ...gate,
          leaseDisposition: retainedDisposition(currentLease, input.agentRunId)
        })
      } catch (error) {
        // Completion failures keep the candidate and lease available for explicit recovery.
        unsubscribeSession(input.projectPath, input.agentRunId)
        throw error
      }
    },
    async cancelAgentEditSession(input) {
      await cancelSession(input.projectPath, input.agentRunId)
    },
    async readEditSession(input) {
      return {
        projectPath: input.projectPath,
        activeLease: toLeaseStatus(
          await options.leaseStore.read({ projectPath: input.projectPath })
        )
      }
    }
  }

  return controller
}
