import { ScryerHealthReporter } from '../health-reporter'
import type {
  ScryerModelHealthInput,
  ScryerModelHealthResult,
  ScryerOperationExecutor
} from '../types'
import { failure, success } from './operation-result'

export const modelHealthOperation: ScryerOperationExecutor<
  ScryerModelHealthInput,
  ScryerModelHealthResult
> = async ({ input, project, state, services }) => {
  if (!state.committed) {
    return failure('internal_error', 'Committed state was not loaded for scryer.model.health', {
      reason: 'policy_violation',
      contractOperationId: 'scryer.model.health'
    })
  }
  if (input.node_id && !state.committed.nodes.some((node) => node.id === input.node_id)) {
    return failure('not_found', `Node '${input.node_id}' not found`, {
      entity: 'node',
      id: input.node_id
    })
  }
  const report = await new ScryerHealthReporter().report({
    model: state.committed,
    projectRoot: project.projectRoot,
    nodeId: input.node_id,
    nowIso: services.clock.nowIso()
  })
  return success({
    result: report.result,
    ...(report.changes ? { changes: report.changes } : {})
  })
}
