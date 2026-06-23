import type { ScryerStateStore } from '../state-store'
import type {
  ScryerModelValidateInput,
  ScryerModelValidateResult,
  ScryerProjectRef
} from '../types'
import { ScryerEngineError } from '../pipeline'
import { validateModelStructure } from '../validators'

export async function modelValidateOperation(
  input: ScryerModelValidateInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerModelValidateResult> {
  const layer = input.layer ?? 'plan'
  if (layer !== 'plan' && layer !== 'committed') {
    throw new ScryerEngineError('invalid_input', "layer must be 'plan' or 'committed'", {
      field: 'layer'
    })
  }
  const model =
    layer === 'committed'
      ? await store.readCommitted(project.projectRoot)
      : await store.readPlanned(project.projectRoot)
  return { layer, warnings: validateModelStructure(model) }
}
