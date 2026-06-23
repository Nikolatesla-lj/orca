import type { ScryerStateStore } from '../state-store'
import type { ScryerModelReadInput, ScryerModelReadResult, ScryerProjectRef } from '../types'
import { ScryerEngineError } from '../pipeline'

export async function modelReadOperation(
  input: ScryerModelReadInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerModelReadResult> {
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
  if (layer === 'committed') {
    await store.writeBaseline(project.projectRoot, model)
  }
  return { layer, model }
}
