import type { ScryerStateStore } from '../state-store'
import type { ScryerPlanPendingInput, ScryerPlanPendingResult, ScryerProjectRef } from '../types'
import { diffModels, summarizePending } from '../diff'

export async function planPendingOperation(
  _input: ScryerPlanPendingInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerPlanPendingResult> {
  const committed = await store.readCommitted(project.projectRoot)
  const planned = await store.readPlanned(project.projectRoot)
  const changes = diffModels(committed, planned)
  return { changes, summary: summarizePending(changes) }
}
