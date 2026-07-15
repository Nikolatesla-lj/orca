import { diffModels } from './diff'
import { createScryerFoldService } from './fold'
import { createScryerIdMinter } from './id-minter'
import { operationWarningSchema } from './operation-error-schemas'
import { buildCommitPlan } from './pipeline-commit-plan'
import type { PipelineOptions } from './pipeline-contracts'
import { internalError, validateErrorDetails } from './pipeline-results'
import { createScryerSourceRouter } from './source-router'
import { createScryerValidatorSet } from './validators'
import type {
  ResolvedScryerProject,
  ScryerFlatOperationPolicy,
  ScryerOperationContext,
  ScryerOperationContract,
  ScryerOperationId,
  ScryerOperationResult,
  ScryerOperationServices
} from './types'

function createServices(
  state: { committed?: unknown; planned?: unknown },
  clock: PipelineOptions['clock']
): ScryerOperationServices {
  return {
    ids: createScryerIdMinter({
      committed: state.committed as never,
      planned: state.planned as never
    }),
    validators: createScryerValidatorSet(),
    diff: { diffModels },
    fold: createScryerFoldService(),
    sourceRouter: createScryerSourceRouter(),
    clock
  }
}

async function runResolvedOperation(args: {
  operationId: ScryerOperationId
  contract: ScryerOperationContract<unknown, unknown>
  input: Record<string, unknown>
  context: ScryerOperationContext
  requestId: string
  policy: ScryerFlatOperationPolicy
  project: ResolvedScryerProject
  options: PipelineOptions
}): Promise<ScryerOperationResult> {
  const { contract, input, context, requestId, policy, project, options, operationId } = args
  const state = await options.store.loadDeclaredState(project, policy)
  let executorResult
  try {
    executorResult = await contract.execute({
      input,
      context,
      project,
      state,
      services: createServices(state, options.clock)
    })
  } catch (error) {
    return options.errorMapper.toOperationResult({
      ok: false,
      operationId,
      requestId,
      error: options.errorMapper.mapUnexpectedException({
        error,
        contractOperationId: operationId
      }),
      meta: { projectRoot: project.projectRoot }
    })
  }
  if (!executorResult.ok) {
    const validation = validateErrorDetails(contract, executorResult.failure)
    if (validation !== 'ok') {
      return internalError(
        operationId,
        requestId,
        options.errorMapper,
        validation,
        `Executor failure for ${operationId} violated its error contract`
      )
    }
    return options.errorMapper.toOperationResult({
      ok: false,
      operationId,
      requestId,
      error: options.errorMapper.mapExecutorFailure({ contract, failure: executorResult.failure }),
      meta: { projectRoot: project.projectRoot }
    })
  }
  const successCheck = contract.successSchema.safeParse(executorResult.outcome.result)
  if (!successCheck.success) {
    return internalError(
      operationId,
      requestId,
      options.errorMapper,
      'success_schema_failed',
      `Executor success result for ${operationId} violated its schema`
    )
  }
  const plan = buildCommitPlan({
    operationId,
    requestId,
    project,
    policy,
    changes: executorResult.outcome.changes
  })
  if ('code' in plan) {
    return internalError(
      operationId,
      requestId,
      options.errorMapper,
      'policy_violation',
      plan.message
    )
  }
  const commitResult =
    plan.primary.length > 0 || plan.bestEffort.length > 0
      ? await options.store.commit(plan)
      : { warnings: [] }
  for (const warning of commitResult.warnings) {
    const warningCheck = operationWarningSchema.safeParse(warning)
    if (!warningCheck.success) {
      return internalError(
        operationId,
        requestId,
        options.errorMapper,
        'malformed_warning',
        `State-store warning for ${operationId} violated warning schema`
      )
    }
  }
  return options.errorMapper.toOperationResult({
    ok: true,
    operationId,
    requestId,
    result: successCheck.data,
    meta: {
      projectRoot: project.projectRoot,
      ...(commitResult.warnings.length > 0 ? { warnings: commitResult.warnings } : {}),
      ...executorResult.outcome.meta
    }
  })
}

export async function executeWithPolicyLock(args: Parameters<typeof runResolvedOperation>[0]) {
  if (args.policy.lock === 'exclusive') {
    return args.options.store.withWriteLock(args.project.projectRoot, () =>
      runResolvedOperation(args)
    )
  }
  if (args.policy.lock === 'commit_if_writing') {
    return runResolvedOperation({
      ...args,
      options: {
        ...args.options,
        store: {
          ...args.options.store,
          commit: (plan) =>
            plan.primary.length > 0 || plan.bestEffort.length > 0
              ? args.options.store.withWriteLock(args.project.projectRoot, () =>
                  args.options.store.commit(plan)
                )
              : args.options.store.commit(plan)
        }
      }
    })
  }
  return runResolvedOperation(args)
}
