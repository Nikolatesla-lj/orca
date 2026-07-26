import type { ScryModel } from './model'
import type { ScryerValidationFinding } from './operation-results'
import type { ScryerValidatorSet } from './operation-services'
import { linkViolation } from './validator-model-graph'
import { validateNodeStructure } from './validator-node-structure'
import { validateRelationshipStructure } from './validator-relationship-structure'
import { validateSourceStructure } from './validator-source-structure'

export {
  anchorRangeWarningFinding,
  coverageGapFinding,
  coverageOverlapFinding,
  invalidDriftMarkerTransitionFinding
} from './validation-findings'
export { describeLinkViolation, linkViolation } from './validator-model-graph'
export type { LinkViolation } from './validator-model-graph'

export function validateModelStructure(model: ScryModel): ScryerValidationFinding[] {
  return [
    ...validateNodeStructure(model),
    ...validateRelationshipStructure(model),
    ...validateSourceStructure(model)
  ]
}

export function createScryerValidatorSet(): ScryerValidatorSet {
  return {
    validateModel: validateModelStructure,
    linkViolation(model, src, dst) {
      const violation = linkViolation(model, src, dst)
      return violation ? { reason: violation.reason } : null
    }
  }
}
