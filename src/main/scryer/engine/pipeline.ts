import { ScryerEngineError } from './engine-error'
import type { PipelineOptions } from './pipeline-contracts'
import {
  fieldErrorsFromZod,
  leaseFailure,
  resolvePolicy,
  resolveProject,
  transportFailure,
  validateContext
} from './pipeline-input-resolution'
import { executeWithPolicyLock } from './pipeline-operation-runner'
import { failureResult } from './pipeline-results'
import { sanitizeScryerOperationResult } from './operation-error-redaction'
import type { ScryerOperationContext, ScryerOperationResult } from './types'

export type { PipelineOptions } from './pipeline-contracts'

export async function executeCatalogOperation(
  operationId: string,
  rawInput: unknown,
  context: ScryerOperationContext,
  options: PipelineOptions
): Promise<ScryerOperationResult> {
  const requestId = context.requestId ?? options.requestIds.next()
  const publicResult = (result: ScryerOperationResult): ScryerOperationResult =>
    sanitizeScryerOperationResult(result, context.leaseToken ? [context.leaseToken] : [])
  const contract = options.catalog.getOperationContract(operationId)
  if (!contract) {
    return publicResult(
      failureResult(operationId, requestId, options.errorMapper, {
        code: 'operation_not_found',
        message: `Unknown Scryer operation '${operationId}'`,
        details: { operationId }
      })
    )
  }
  const contextFailure = validateContext(context, requestId)
  if (contextFailure) {
    return publicResult(failureResult(operationId, requestId, options.errorMapper, contextFailure))
  }
  const parsedInput = contract.inputSchema.safeParse(rawInput)
  if (!parsedInput.success) {
    return publicResult(
      failureResult(operationId, requestId, options.errorMapper, {
        code: 'invalid_input',
        message: 'Scryer operation input failed schema validation',
        fieldErrors: fieldErrorsFromZod(parsedInput.error)
      })
    )
  }
  const input =
    typeof parsedInput.data === 'object' && parsedInput.data !== null
      ? (parsedInput.data as Record<string, unknown>)
      : {}
  const resolvedPolicy = resolvePolicy(contract.policy, input)
  if ('code' in resolvedPolicy) {
    return publicResult(failureResult(operationId, requestId, options.errorMapper, resolvedPolicy))
  }
  const transport = transportFailure(context, resolvedPolicy)
  if (transport) {
    return publicResult(failureResult(operationId, requestId, options.errorMapper, transport))
  }
  const project = resolveProject(input, context, resolvedPolicy)
  if ('code' in project) {
    return publicResult(failureResult(operationId, requestId, options.errorMapper, project))
  }
  try {
    return publicResult(
      await executeWithPolicyLock({
        operationId: contract.id,
        contract,
        input,
        context: { ...context, requestId },
        requestId,
        policy: resolvedPolicy,
        project,
        options,
        authorize: () =>
          leaseFailure(options.store, project, resolvedPolicy, context, input, options)
      })
    )
  } catch (error) {
    if (error instanceof ScryerEngineError) {
      return publicResult(
        failureResult(operationId, requestId, options.errorMapper, {
          code: error.code,
          message: error.message,
          details: error.details,
          fieldErrors: error.fieldErrors,
          retryable: error.retryable
        })
      )
    }
    return publicResult(
      options.errorMapper.toOperationResult({
        ok: false,
        operationId,
        requestId,
        error: options.errorMapper.mapUnexpectedException({
          error,
          contractOperationId: contract.id
        })
      })
    )
  }
}

export const executeScryerOperation = executeCatalogOperation
