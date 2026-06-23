import type { ScryerStateStore } from '../state-store'
import type { ScryerLinkAddInput, ScryerLinkAddResult, ScryerProjectRef } from '../types'
import { diffModels, summarizePending } from '../diff'
import { ScryerEngineError } from '../pipeline'
import { describeLinkViolation, linkViolation, validateModelStructure } from '../validators'

function makeLinkId(src: string, dst: string): string {
  return `link-${src}-${dst}`
}

export async function linkAddOperation(
  input: ScryerLinkAddInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerLinkAddResult> {
  if (!Array.isArray(input.links) || input.links.length === 0) {
    throw new ScryerEngineError('invalid_input', 'link.add requires at least one link', {
      field: 'links'
    })
  }
  const committed = await store.readCommitted(project.projectRoot)
  const planned = await store.readPlannedForEdit(project.projectRoot)
  const nodeIds = new Set(planned.nodes.map((node) => node.id))
  const added: string[] = []
  for (const item of input.links) {
    if (!item || typeof item.src !== 'string' || typeof item.dst !== 'string') {
      throw new ScryerEngineError('invalid_input', 'each link requires src and dst', {
        field: 'links'
      })
    }
    if (!nodeIds.has(item.src)) {
      throw new ScryerEngineError('not_found', `Unknown src node '${item.src}'`, { src: item.src })
    }
    if (!nodeIds.has(item.dst)) {
      throw new ScryerEngineError('not_found', `Unknown dst node '${item.dst}'`, { dst: item.dst })
    }
    if (item.src === item.dst) {
      throw new ScryerEngineError(
        'illegal_link',
        `Self-link rejected: ${item.src} -> ${item.dst}`,
        {
          src: item.src,
          dst: item.dst
        }
      )
    }
    const id = makeLinkId(item.src, item.dst)
    if (
      !planned.links.some(
        (link) => link.id === id || (link.src === item.src && link.dst === item.dst)
      )
    ) {
      planned.links.push({
        id,
        src: item.src,
        dst: item.dst,
        label: item.label,
        method: item.method
      })
    }
    added.push(id)
  }

  const violations = input.links
    .map((item) => ({ item, violation: linkViolation(planned, item.src, item.dst) }))
    .filter(
      (
        entry
      ): entry is {
        item: (typeof input.links)[number]
        violation: NonNullable<ReturnType<typeof linkViolation>>
      } => Boolean(entry.violation)
    )
  if (violations.length > 0) {
    throw new ScryerEngineError(
      'illegal_link',
      `No links added; ${violations.length} link(s) rejected`,
      {
        violations: violations.map(({ item, violation }) => ({
          src: item.src,
          dst: item.dst,
          message: describeLinkViolation(planned, item.src, item.dst, violation)
        }))
      }
    )
  }

  const warnings = validateModelStructure(planned)
  await store.writePlanned(project.projectRoot, planned)
  return {
    added,
    warnings,
    pendingSummary: summarizePending(diffModels(committed, planned))
  }
}
