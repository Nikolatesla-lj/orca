import { createScryerStateStore } from './state-store'
import { executeScryerOperation } from './pipeline'
import type {
  ScryerModelReadResult,
  ScryerOperationContext,
  ScryerOperationId,
  ScryerOperationResult,
  ScryerProjectRef,
  ScryerViewOptions
} from './types'

export type ScryerEngine = {
  executeOperation<T = unknown>(
    id: ScryerOperationId,
    input: unknown,
    context: ScryerOperationContext
  ): Promise<ScryerOperationResult<T>>
  readView(project: ScryerProjectRef, options?: ScryerViewOptions): Promise<ScryerModelReadResult>
}

export function createScryerEngine(): ScryerEngine {
  const store = createScryerStateStore()
  return {
    executeOperation<T = unknown>(
      id: ScryerOperationId,
      input: unknown,
      context: ScryerOperationContext
    ): Promise<ScryerOperationResult<T>> {
      return executeScryerOperation(id, input, context, { store }) as Promise<
        ScryerOperationResult<T>
      >
    },
    async readView(project, options = {}) {
      const layer = options.layer ?? 'plan'
      const model =
        layer === 'committed'
          ? await store.readCommitted(project.projectRoot)
          : await store.readPlanned(project.projectRoot)
      return { layer, model }
    }
  }
}

export async function executeOperation<T = unknown>(
  id: ScryerOperationId,
  input: unknown,
  context: ScryerOperationContext
): Promise<ScryerOperationResult<T>> {
  return createScryerEngine().executeOperation<T>(id, input, context)
}

export async function readView(
  project: ScryerProjectRef,
  options?: ScryerViewOptions
): Promise<ScryerModelReadResult> {
  return createScryerEngine().readView(project, options)
}

export type {
  ScryerLayer,
  ScryerModelReadResult,
  ScryerOperationContext,
  ScryerOperationError,
  ScryerOperationErrorCode,
  ScryerOperationId,
  ScryerOperationResult,
  ScryerProjectRef,
  ScryerViewOptions,
  ValidationWarning
} from './types'
