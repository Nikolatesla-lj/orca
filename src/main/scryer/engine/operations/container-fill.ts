import { readBuildEdgeGraph } from '../build-edge-cache'
import { createScryerContainerGenerationPlanner } from '../container-generation-planner'
import type {
  ScryerContainerFillInput,
  ScryerContainerFillResult,
  ScryerOperationExecutor
} from '../types'
import { failure } from './operation-result'

// Thin executor: reads the build-edge cache, then defers all generation
// semantics to the deep ScryerContainerGenerationPlanner.
export const containerFillOperation: ScryerOperationExecutor<
  ScryerContainerFillInput,
  ScryerContainerFillResult
> = async ({ input, state, services, project }) => {
  if (!state.committed) {
    return failure('internal_error', 'Committed state was not loaded for scryer.container.fill', {
      reason: 'policy_violation',
      contractOperationId: 'scryer.container.fill'
    })
  }
  if (!state.planned) {
    return failure('internal_error', 'Planned state was not loaded for scryer.container.fill', {
      reason: 'policy_violation',
      contractOperationId: 'scryer.container.fill'
    })
  }
  const buildEdges = await readBuildEdgeGraph(project.projectRoot)
  return createScryerContainerGenerationPlanner({
    committed: state.committed,
    planned: state.planned,
    services,
    buildEdges
  }).plan(input)
}
