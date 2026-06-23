import { resolve } from 'path'
import type {
  ScryerModelReadInput,
  ScryerModelValidateInput,
  ScryerNodeUpdateInput,
  ScryerLinkAddInput,
  ScryerLinkDeleteInput,
  ScryerPlanPendingInput,
  ScryerPlanFoldInput,
  ScryerOperationContext,
  ScryerOperationErrorCode,
  ScryerOperationId,
  ScryerOperationResult
} from './types'
import type { ScryerStateStore } from './state-store'
import { modelReadOperation } from './operations/model-read'
import { modelValidateOperation } from './operations/model-validate'
import { nodeUpdateOperation } from './operations/node-update'
import { linkAddOperation } from './operations/link-add'
import { linkDeleteOperation } from './operations/link-delete'
import { planPendingOperation } from './operations/plan-pending'
import { planFoldOperation } from './operations/plan-fold'
import { diffModels } from './diff'
import { validateModelStructure } from './validators'

export class ScryerEngineError extends Error {
  constructor(
    readonly code: ScryerOperationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly retryable = false
  ) {
    super(message)
  }
}

type PipelineOptions = {
  store: ScryerStateStore
}

async function withWriteLock<T>(
  projectRoot: string,
  context: ScryerOperationContext,
  options: PipelineOptions,
  action: () => Promise<T>
): Promise<T> {
  const lease = await options.store.readActiveLease(projectRoot)
  if (lease && context.leaseToken !== lease.token) {
    throw new ScryerEngineError(
      'lease_required',
      'A Scryer model edit lease is active; write operations require the matching lease token.',
      {
        owner: lease.owner,
        agentRunId: lease.agentRunId
      },
      true
    )
  }
  return options.store.withWriteLock(projectRoot, action)
}

async function completionGateMeta(
  projectRoot: string,
  options: PipelineOptions
): Promise<NonNullable<ScryerOperationResult['meta']>['completionGate']> {
  const committed = await options.store.readCommitted(projectRoot)
  const planned = await options.store.readPlanned(projectRoot)
  const pending = diffModels(committed, planned)
  const validationWarnings = validateModelStructure(committed)
  return {
    complete: pending.length === 0 && validationWarnings.length === 0,
    pendingCount: pending.length,
    validationWarningCount: validationWarnings.length
  }
}

function validateContext(context: ScryerOperationContext): void {
  if (!context.requestId) {
    throw new ScryerEngineError('invalid_context', 'Scryer operation context requires requestId')
  }
  if (!context.cwd) {
    throw new ScryerEngineError('invalid_context', 'Scryer operation context requires cwd')
  }
}

function resolveProject(input: unknown, context: ScryerOperationContext): string {
  const project =
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { project?: unknown }).project === 'string'
      ? (input as { project: string }).project
      : (context.projectRoot ?? context.cwd)
  return resolve(project)
}

export async function executeScryerOperation(
  operationId: ScryerOperationId,
  input: unknown,
  context: ScryerOperationContext,
  options: PipelineOptions
): Promise<ScryerOperationResult> {
  try {
    validateContext(context)
    const projectRoot = resolveProject(input, context)
    switch (operationId) {
      case 'scryer.model.read':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await modelReadOperation(
            input as ScryerModelReadInput,
            { projectRoot },
            options.store
          ),
          meta: { projectRoot }
        }
      case 'scryer.model.validate':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await modelValidateOperation(
            input as ScryerModelValidateInput,
            { projectRoot },
            options.store
          ),
          meta: { projectRoot }
        }
      case 'scryer.node.update':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await withWriteLock(projectRoot, context, options, () =>
            nodeUpdateOperation(input as ScryerNodeUpdateInput, { projectRoot }, options.store)
          ),
          meta: { projectRoot }
        }
      case 'scryer.link.add':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await withWriteLock(projectRoot, context, options, () =>
            linkAddOperation(input as ScryerLinkAddInput, { projectRoot }, options.store)
          ),
          meta: { projectRoot }
        }
      case 'scryer.link.delete':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await withWriteLock(projectRoot, context, options, () =>
            linkDeleteOperation(input as ScryerLinkDeleteInput, { projectRoot }, options.store)
          ),
          meta: { projectRoot }
        }
      case 'scryer.plan.pending':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await planPendingOperation(
            input as ScryerPlanPendingInput,
            { projectRoot },
            options.store
          ),
          meta: { projectRoot }
        }
      case 'scryer.plan.fold':
        return {
          ok: true,
          operationId,
          requestId: context.requestId,
          result: await withWriteLock(projectRoot, context, options, () =>
            planFoldOperation(input as ScryerPlanFoldInput, { projectRoot }, options.store)
          ),
          meta: { projectRoot, completionGate: await completionGateMeta(projectRoot, options) }
        }
      default:
        throw new ScryerEngineError(
          'operation_not_found',
          `Unknown Scryer operation '${operationId}'`
        )
    }
  } catch (error) {
    const engineError =
      error instanceof ScryerEngineError
        ? error
        : new ScryerEngineError(
            'internal_error',
            error instanceof Error ? error.message : String(error)
          )
    return {
      ok: false,
      operationId,
      requestId: context.requestId,
      error: {
        code: engineError.code,
        message: engineError.message,
        details: engineError.details,
        retryable: engineError.retryable
      }
    }
  }
}
