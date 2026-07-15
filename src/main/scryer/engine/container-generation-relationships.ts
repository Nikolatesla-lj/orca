import { splitSymbolKey } from './build-edge-cache'
import type {
  ScryerBuildEdgeGraph,
  ScryerContainerFillCreatedGroup,
  ScryerDroppedLink,
  ScryerEdgeGraphStatus,
  ScryerProposedGroup,
  ScryerProposedLink
} from './container-generation-contracts'
import {
  containerGenerationSourceKey,
  mintGeneratedResponsibilities
} from './container-generation-identity'
import {
  containerGenerationError,
  invalidContainerGenerationProposal
} from './container-generation-proposal'
import type { ScryGroup, ScryLink, ScryModel } from './model'
import type { ScryerIdMinter, ScryerValidatorSet } from './operation-services'
import type { ScryerExecutorResult, ScryerValidationFinding } from './operation-results'
import { semanticPath } from './semantic-paths'

export type GeneratedGroups = {
  groups: ScryGroup[]
  created: ScryerContainerFillCreatedGroup[]
}

export type GeneratedRelationships = {
  links: ScryLink[]
  derivedCount: number
  keptAgentCount: number
  dropped: ScryerDroppedLink[]
  edgeGraphStatus: ScryerEdgeGraphStatus
}

function relationshipKey(src: string, dst: string): string {
  return JSON.stringify([src, dst])
}

function violationReason(reason: string, src: string, dst: string): string {
  switch (reason) {
    case 'self_link':
      return `self-link ${src}`
    case 'ancestor_descendant':
      return `containment ${src} -> ${dst}`
    case 'same_level_reference':
      return `same-level reference ${src} -> ${dst}`
    case 'duplicate_link':
      return `duplicate ${src} -> ${dst}`
    default:
      return `illegal ${src} -> ${dst}`
  }
}

export function planGeneratedGroups(args: {
  proposals: ScryerProposedGroup[]
  componentIdByKey: Map<string, string>
  ids: ScryerIdMinter
}): { ok: true; value: GeneratedGroups } | { ok: false; failure: ScryerExecutorResult<never> } {
  const groups: ScryGroup[] = []
  const created: ScryerContainerFillCreatedGroup[] = []
  const findings: ScryerValidationFinding[] = []

  for (const proposal of args.proposals) {
    const memberIds: string[] = []
    for (const memberKey of proposal.member_keys) {
      const componentId = args.componentIdByKey.get(memberKey)
      if (!componentId) {
        findings.push(
          containerGenerationError(
            'missing_reference',
            `Group '${proposal.name}' member '${memberKey}' is not a proposed component`,
            semanticPath.model(),
            { memberKey, reason: 'unresolved_group_member' }
          )
        )
        continue
      }
      memberIds.push(componentId)
    }
    const responsibilities = mintGeneratedResponsibilities(
      proposal.responsibilities ?? [],
      args.ids
    )
    const group: ScryGroup = {
      id: args.ids.group(),
      name: proposal.name,
      memberIds,
      ...(proposal.description !== undefined ? { description: proposal.description } : {}),
      ...(responsibilities.length > 0 ? { responsibilities } : {})
    }
    groups.push(group)
    created.push({
      id: group.id,
      name: group.name,
      memberIds,
      responsibilityIds: responsibilities.map((item) => item.id)
    })
  }

  return findings.length > 0
    ? {
        ok: false,
        failure: invalidContainerGenerationProposal(
          'container.fill group proposal is invalid',
          findings
        )
      }
    : { ok: true, value: { groups, created } }
}

function edgeGraphStatus(buildEdges: ScryerBuildEdgeGraph | null): ScryerEdgeGraphStatus {
  if (!buildEdges) {
    return 'missing'
  }
  if (buildEdges.symbolEdges.length === 0) {
    return 'empty'
  }
  return 'available'
}

export function planGeneratedRelationships(args: {
  proposals: ScryerProposedLink[]
  committed: ScryModel
  existingLinks: ScryLink[]
  localIds: Map<string, string>
  symbolNodeByLoc: Map<string, string>
  symbolComponent: Map<string, string>
  buildEdges: ScryerBuildEdgeGraph | null
  ids: ScryerIdMinter
  validators: ScryerValidatorSet
}): GeneratedRelationships {
  const dropped: ScryerDroppedLink[] = []
  const links: ScryLink[] = []
  const seenPairs = new Set(args.existingLinks.map((link) => relationshipKey(link.src, link.dst)))
  const existingIds = new Set(args.committed.nodes.map((node) => node.id))

  const agentKept: ScryLink[] = []
  for (const proposal of args.proposals) {
    const src =
      args.localIds.get(proposal.src) ?? (existingIds.has(proposal.src) ? proposal.src : undefined)
    const dst =
      args.localIds.get(proposal.dst) ?? (existingIds.has(proposal.dst) ? proposal.dst : undefined)
    if (!src) {
      dropped.push({ ...proposal, reason: `unknown src '${proposal.src}'` })
      continue
    }
    if (!dst) {
      dropped.push({ ...proposal, reason: `unknown dst '${proposal.dst}'` })
      continue
    }
    if (src === dst) {
      dropped.push({ ...proposal, reason: `self-link ${src}` })
      continue
    }
    if (seenPairs.has(relationshipKey(src, dst))) {
      dropped.push({ ...proposal, reason: `duplicate ${src} -> ${dst}` })
      continue
    }
    const violation = args.validators.linkViolation(args.committed, src, dst)
    if (violation) {
      dropped.push({ ...proposal, reason: violationReason(violation.reason, src, dst) })
      continue
    }
    seenPairs.add(relationshipKey(src, dst))
    agentKept.push({
      id: args.ids.link(src, dst),
      src,
      dst,
      label: proposal.label,
      ...(proposal.method !== undefined ? { method: proposal.method } : {})
    })
  }
  links.push(...agentKept)

  let derivedCount = 0
  for (const edge of args.buildEdges?.symbolEdges ?? []) {
    const from = splitSymbolKey(edge.src)
    const to = splitSymbolKey(edge.dst)
    if (!from || !to) {
      continue
    }
    const srcSymbol = args.symbolNodeByLoc.get(containerGenerationSourceKey(from.path, from.name))
    const dstSymbol = args.symbolNodeByLoc.get(containerGenerationSourceKey(to.path, to.name))
    if (!srcSymbol || !dstSymbol || srcSymbol === dstSymbol) {
      continue
    }
    const srcComponent = args.symbolComponent.get(srcSymbol)
    const dstComponent = args.symbolComponent.get(dstSymbol)
    if (!srcComponent || !dstComponent) {
      continue
    }
    const src = srcComponent === dstComponent ? srcSymbol : srcComponent
    const dst = srcComponent === dstComponent ? dstSymbol : dstComponent
    if (src === dst || seenPairs.has(relationshipKey(src, dst))) {
      continue
    }
    seenPairs.add(relationshipKey(src, dst))
    links.push({ id: args.ids.link(src, dst), src, dst, label: '' })
    derivedCount += 1
  }

  return {
    links,
    derivedCount,
    keptAgentCount: agentKept.length,
    dropped,
    edgeGraphStatus: edgeGraphStatus(args.buildEdges)
  }
}

export function addGeneratedLinksToPlanned(args: {
  planned: ScryModel
  links: ScryLink[]
  existingLinks: ScryLink[]
}): void {
  const plannedPairs = new Set(
    args.existingLinks.map((link) => relationshipKey(link.src, link.dst))
  )
  for (const link of args.links) {
    if (!plannedPairs.has(relationshipKey(link.src, link.dst))) {
      args.planned.links.push(JSON.parse(JSON.stringify(link)) as ScryLink)
    }
  }
}
