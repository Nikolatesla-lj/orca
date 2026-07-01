import { createStructuralMutationPlanner } from '../structural-planner'
import type {
  ScryerNodeDescopeInput,
  ScryerNodeDescopeResult,
  ScryerNodeMoveInput,
  ScryerNodeMoveResult,
  ScryerNodeSetSubtreeInput,
  ScryerNodeSetSubtreeResult,
  ScryerLoadedState,
  ScryerOperationExecutor,
  ScryerOperationId,
  ScryerResponsibilityMoveInput,
  ScryerResponsibilityMoveResult
} from '../types'
import { failure } from './operation-result'

function requirePlanned(state: ScryerLoadedState, operationId: ScryerOperationId) {
  if (!state.planned) {
    return failure('internal_error', 'Planned state was not loaded for structural mutation', {
      reason: 'policy_violation',
      contractOperationId: operationId
    })
  }
  return null
}

export const nodeSetSubtreeOperation: ScryerOperationExecutor<
  ScryerNodeSetSubtreeInput,
  ScryerNodeSetSubtreeResult
> = ({ input, state, services }) => {
  const missingState = requirePlanned(state, 'scryer.node.set-subtree')
  if (missingState) {
    return missingState
  }
  return createStructuralMutationPlanner({
    committed: state.committed,
    planned: state.planned!,
    services
  }).planSetSubtree(input)
}

export const nodeMoveOperation: ScryerOperationExecutor<
  ScryerNodeMoveInput,
  ScryerNodeMoveResult
> = ({ input, state, services }) => {
  const missingState = requirePlanned(state, 'scryer.node.move')
  if (missingState) {
    return missingState
  }
  return createStructuralMutationPlanner({
    committed: state.committed,
    planned: state.planned!,
    services
  }).planNodeMove(input)
}

export const responsibilityMoveOperation: ScryerOperationExecutor<
  ScryerResponsibilityMoveInput,
  ScryerResponsibilityMoveResult
> = ({ input, state, services }) => {
  const missingState = requirePlanned(state, 'scryer.responsibility.move')
  if (missingState) {
    return missingState
  }
  return createStructuralMutationPlanner({
    committed: state.committed,
    planned: state.planned!,
    services
  }).planResponsibilityMove(input)
}

export const nodeDescopeOperation: ScryerOperationExecutor<
  ScryerNodeDescopeInput,
  ScryerNodeDescopeResult
> = ({ input, state, services }) => {
  const missingState = requirePlanned(state, 'scryer.node.descope')
  if (missingState) {
    return missingState
  }
  return createStructuralMutationPlanner({
    committed: state.committed,
    planned: state.planned!,
    services
  }).planNodeDescope(input)
}
