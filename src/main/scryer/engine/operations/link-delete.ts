import type { ScryerStateStore } from '../state-store'
import type { ScryerLinkDeleteInput, ScryerLinkDeleteResult, ScryerProjectRef } from '../types'
import { diffModels, summarizePending } from '../diff'
import { ScryerEngineError } from '../pipeline'

export async function linkDeleteOperation(
  input: ScryerLinkDeleteInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerLinkDeleteResult> {
  if (!Array.isArray(input.link_ids) || input.link_ids.length === 0) {
    throw new ScryerEngineError('invalid_input', 'link.delete requires at least one link id', {
      field: 'link_ids'
    })
  }
  const committed = await store.readCommitted(project.projectRoot)
  const planned = await store.readPlannedForEdit(project.projectRoot)
  const targets = new Set(input.link_ids)
  const existing = new Set(planned.links.map((link) => link.id))
  const missing = input.link_ids.filter((id) => !existing.has(id))
  const before = planned.links.length
  planned.links = planned.links.filter((link) => !targets.has(link.id))
  await store.writePlanned(project.projectRoot, planned)
  return {
    deleted: before - planned.links.length,
    missing,
    pendingSummary: summarizePending(diffModels(committed, planned))
  }
}
