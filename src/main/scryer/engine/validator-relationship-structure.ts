import type { ScryKind, ScryModel, ScryNode } from './model'
import type { ScryerValidationFinding } from './operation-results'
import { semanticPath } from './semantic-paths'
import { describeLinkViolation, linkViolation } from './validator-model-graph'

function nodeById(model: ScryModel): Map<string, ScryNode> {
  return new Map(model.nodes.map((node) => [node.id, node]))
}

function pushFinding(findings: ScryerValidationFinding[], item: ScryerValidationFinding): void {
  findings.push(item)
}

function validateLinks(model: ScryModel, findings: ScryerValidationFinding[]): void {
  const nodes = nodeById(model)
  const seenIds = new Set<string>()
  const seenPairs = new Set<string>()
  for (const link of model.links) {
    if (seenIds.has(link.id)) {
      pushFinding(findings, {
        code: 'duplicate_id',
        severity: 'warning',
        message: `Duplicate link id '${link.id}'`,
        path: semanticPath.link(link.id),
        details: { entity: 'link', id: link.id }
      })
    }
    seenIds.add(link.id)
    if (!nodes.has(link.src)) {
      pushFinding(findings, {
        code: 'missing_reference',
        severity: 'warning',
        message: `Link ${link.id} references missing src '${link.src}'`,
        path: semanticPath.link(link.id, 'src'),
        details: { entity: 'link', id: link.id, field: 'src', targetEntity: 'node' }
      })
    }
    if (!nodes.has(link.dst)) {
      pushFinding(findings, {
        code: 'missing_reference',
        severity: 'warning',
        message: `Link ${link.id} references missing dst '${link.dst}'`,
        path: semanticPath.link(link.id, 'dst'),
        details: { entity: 'link', id: link.id, field: 'dst', targetEntity: 'node' }
      })
    }
    const pair = `${link.src}->${link.dst}`
    if (seenPairs.has(pair)) {
      pushFinding(findings, {
        code: 'illegal_link',
        severity: 'warning',
        message: `Duplicate link endpoints ${pair}`,
        path: semanticPath.link(link.id),
        details: { reason: 'duplicate_link', src: link.src, dst: link.dst, linkId: link.id }
      })
    }
    seenPairs.add(pair)
    if (nodes.has(link.src) && nodes.has(link.dst)) {
      const violation = linkViolation(
        { ...model, links: model.links.filter((candidate) => candidate.id !== link.id) },
        link.src,
        link.dst
      )
      if (violation) {
        pushFinding(findings, {
          code: 'illegal_link',
          severity: 'warning',
          message: describeLinkViolation(model, link.src, link.dst, violation),
          path: semanticPath.link(link.id),
          details: {
            reason: violation.reason,
            src: link.src,
            dst: link.dst,
            ...(violation.reason === 'duplicate_link' && violation.linkId
              ? { linkId: violation.linkId }
              : {})
          }
        })
      }
    }
  }
}

function validateGroups(model: ScryModel, findings: ScryerValidationFinding[]): void {
  const nodes = nodeById(model)
  const groups = new Map(model.groups.map((group) => [group.id, group]))
  const seenIds = new Set<string>()
  for (const group of model.groups) {
    if (seenIds.has(group.id)) {
      pushFinding(findings, {
        code: 'invalid_group',
        severity: 'warning',
        message: `Duplicate group id '${group.id}'`,
        path: semanticPath.group(group.id),
        details: { groupId: group.id, reason: 'duplicate_group_id' }
      })
    }
    seenIds.add(group.id)
    if (group.memberIds.length === 0) {
      pushFinding(findings, {
        code: 'invalid_group',
        severity: 'warning',
        message: `Group ${group.id} has no members`,
        path: semanticPath.group(group.id, 'memberIds'),
        details: { groupId: group.id, reason: 'empty_members' }
      })
    }
    if (group.parentGroupId && !groups.has(group.parentGroupId)) {
      pushFinding(findings, {
        code: 'invalid_group',
        severity: 'warning',
        message: `Group ${group.id} references missing parent group '${group.parentGroupId}'`,
        path: semanticPath.group(group.id, 'parentGroupId'),
        details: { groupId: group.id, reason: 'missing_parent' }
      })
    }
    const kinds = new Set<ScryKind>()
    for (const memberId of group.memberIds) {
      const member = nodes.get(memberId)
      if (!member) {
        pushFinding(findings, {
          code: 'invalid_group',
          severity: 'warning',
          message: `Group ${group.id} references missing member '${memberId}'`,
          path: semanticPath.group(group.id, 'memberIds'),
          details: { groupId: group.id, reason: 'missing_member', memberId }
        })
        continue
      }
      kinds.add(member.kind)
      if (group.parentNodeId && member.parentId !== group.parentNodeId) {
        pushFinding(findings, {
          code: 'invalid_group',
          severity: 'warning',
          message: `Group ${group.id} member '${memberId}' is outside parent node '${group.parentNodeId}'`,
          path: semanticPath.group(group.id, 'memberIds'),
          details: { groupId: group.id, reason: 'member_outside_parent', memberId }
        })
      }
    }
    if (kinds.size > 1) {
      pushFinding(findings, {
        code: 'invalid_group',
        severity: 'warning',
        message: `Group ${group.id} mixes member kinds`,
        path: semanticPath.group(group.id, 'memberIds'),
        details: { groupId: group.id, reason: 'mixed_member_kinds' }
      })
    }
  }
}

export function validateRelationshipStructure(model: ScryModel): ScryerValidationFinding[] {
  const findings: ScryerValidationFinding[] = []
  validateLinks(model, findings)
  validateGroups(model, findings)
  return findings
}
