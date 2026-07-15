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
import type { ScryerOperationContext, ScryerOperationResult } from './types'

export type { PipelineOptions } from './pipeline-contracts'

export async function executeCatalogOperation(
  operationId: string,
  rawInput: unknown,
  context: ScryerOperationContext,
  options: PipelineOptions
): Promise<ScryerOperationResult> {
  const requestId = context.requestId ?? options.requestIds.next()
  const contract = options.catalog.getOperationContract(operationId)
  if (!contract) {
    return failureResult(operationId, requestId, options.errorMapper, {
      code: 'operation_not_found',
      message: `Unknown Scryer operation '${operationId}'`,
      details: { operationId }
    })
  }
  const contextFailure = validateContext(context, requestId)
  if (contextFailure) {
    return failureResult(operationId, requestId, options.errorMapper, contextFailure)
  }
  const parsedInput = contract.inputSchema.safeParse(rawInput)
  if (!parsedInput.success) {
    return failureResult(operationId, requestId, options.errorMapper, {
      code: 'invalid_input',
      message: 'Scryer operation input failed schema validation',
      fieldErrors: fieldErrorsFromZod(parsedInput.error)
    })
  }
  const input =
    typeof parsedInput.data === 'object' && parsedInput.data !== null
      ? (parsedInput.data as Record<string, unknown>)
      : {}
  const resolvedPolicy = resolvePolicy(contract.policy, input)
  if ('code' in resolvedPolicy) {
    return failureResult(operationId, requestId, options.errorMapper, resolvedPolicy)
  }
  const transport = transportFailure(context, resolvedPolicy)
  if (transport) {
    return failureResult(operationId, requestId, options.errorMapper, transport)
  }
  const project = resolveProject(input, context, resolvedPolicy)
  if ('code' in project) {
    return failureResult(operationId, requestId, options.errorMapper, project)
  }
  try {
    const lease = await leaseFailure(options.store, project, resolvedPolicy, context, input)
    if (lease) {
      return failureResult(operationId, requestId, options.errorMapper, lease)
    }
    return await executeWithPolicyLock({
      operationId: contract.id,
      contract,
      input,
      context: { ...context, requestId },
      requestId,
      policy: resolvedPolicy,
      project,
      options
    })
  } catch (error) {
    if (error instanceof ScryerEngineError) {
      return failureResult(operationId, requestId, options.errorMapper, {
        code: error.code,
        message: error.message,
        details: error.details,
        fieldErrors: error.fieldErrors,
        retryable: error.retryable
      })
    }
    return options.errorMapper.toOperationResult({
      ok: false,
      operationId,
      requestId,
      error: options.errorMapper.mapUnexpectedException({
        error,
        contractOperationId: contract.id
      })
    })
  }
}

export const executeScryerOperation = executeCatalogOperation
