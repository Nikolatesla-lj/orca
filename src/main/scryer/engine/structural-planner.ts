import { diffModels, summarizePending } from './diff'
import type { ScryGroup, ScryKind, ScryModel, ScryNode, ScryResponsibility } from './model'
import { semanticPath } from './semantic-paths'
import type {
  PendingSummary,
  ScryerExecutorFailure,
  ScryerExecutorResult,
  ScryerNodeDescopeInput,
  ScryerNodeDescopeResult,
  ScryerNodeMoveInput,
  ScryerNodeMoveResult,
  ScryerNodeSetSubtreeInput,
  ScryerNodeSetSubtreeResult,
  ScryerOperationServices,
  ScryerRecommendedRead,
  ScryerResponsibilityMoveInput,
  ScryerResponsibilityMoveResult,
  ScryerStructuralGroupCleanupSummary,
  ScryerValidationFinding
} from './types'

type StructuralPlannerArgs = {
  committed?: ScryModel
  planned: ScryModel
  services: ScryerOperationServices
}

type GroupCleanupResult = {
  model: ScryModel
  summary: ScryerStructuralGroupCleanupSummary
}

const EMPTY_GROUP_CLEANUP: ScryerStructuralGroupCleanupSummary = {
  removedGroupCount: 0,
  updatedGroupCount: 0,
  removedMembershipCount: 0
}

const STRUCTURAL_BLOCKING_CODES = new Set<ScryerValidationFinding['code']>([
  'duplicate_id',
  'missing_reference',
  'invalid_hierarchy',
  'invalid_external',
  'illegal_link',
  'invalid_group',
  'unknown_source_map_target',
  'unknown_boundary_target',
  'invalid_drift_marker_transition'
])

function cloneModel(model: ScryModel): ScryModel {
  return JSON.parse(JSON.stringify(model)) as ScryModel
}

function sameModel(left: ScryModel, right: ScryModel): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function ok<TResult>(result: TResult, planned?: ScryModel): ScryerExecutorResult<TResult> {
  return {
    ok: true,
    outcome: {
      result,
      ...(planned ? { changes: { planned } } : {})
    }
  }
}

function fail(failure: ScryerExecutorFailure): ScryerExecutorResult<never> {
  return { ok: false, failure }
}

function validationFailure(message: string, findings: ScryerValidationFinding[]) {
  return fail({
    code: 'validation_failed',
    message,
    details: { findings }
  })
}

function notFound(entity: 'node' | 'responsibility', id: string, field: string) {
  return fail({
    code: 'not_found',
    message: `${entity === 'node' ? 'Node' : 'Responsibility'} '${id}' not found`,
    details: { entity, id, field }
  })
}

function finding(args: ScryerValidationFinding): ScryerValidationFinding {
  return args
}

function noOpFinding(operation: string, message: string): ScryerValidationFinding {
  return finding({
    code: 'no_op',
    severity: 'info',
    message,
    path: semanticPath.model(),
    details: { operation }
  })
}

function structuralFinding(args: {
  code: ScryerValidationFinding['code']
  message: string
  path: string
  details?: Record<string, unknown>
}): ScryerValidationFinding {
  return finding({
    code: args.code,
    severity: 'error',
    message: args.message,
    path: args.path,
    ...(args.details ? { details: args.details } : {})
  })
}

function validParentKind(parent: ScryKind, child: ScryKind): boolean {
  return (
    (parent === 'system' && child === 'container') ||
    (parent === 'container' && child === 'component') ||
    (parent === 'component' && child === 'symbol')
  )
}

function collectDescendantIds(
  model: ScryModel,
  rootIds: Iterable<string>,
  includeRoots: boolean
): Set<string> {
  const roots = new Set(rootIds)
  const ids = new Set(includeRoots ? roots : [])
  let changed = true
  while (changed) {
    changed = false
    for (const node of model.nodes) {
      const parentId = node.parentId
      if (!parentId) {
        continue
      }
      if ((roots.has(parentId) || ids.has(parentId)) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

function nodesById(model: ScryModel): Map<string, ScryNode> {
  return new Map(model.nodes.map((node) => [node.id, node]))
}

function groupsById(model: ScryModel): Map<string, ScryGroup> {
  return new Map(model.groups.map((group) => [group.id, group]))
}

function responsibilityIdsForNodes(model: ScryModel, nodeIds: Set<string>): Set<string> {
  const ids = new Set<string>()
  for (const node of model.nodes) {
    if (!nodeIds.has(node.id)) {
      continue
    }
    for (const responsibility of node.responsibilities ?? []) {
      ids.add(responsibility.id)
    }
  }
  return ids
}

function everyModelId(model: ScryModel): Set<string> {
  const ids = new Set<string>()
  for (const node of model.nodes) {
    ids.add(node.id)
    for (const responsibility of node.responsibilities ?? []) {
      ids.add(responsibility.id)
    }
  }
  for (const link of model.links) {
    ids.add(link.id)
  }
  for (const group of model.groups) {
    ids.add(group.id)
    for (const responsibility of group.responsibilities ?? []) {
      ids.add(responsibility.id)
    }
  }
  return ids
}

function payloadIds(
  nodes: ScryModel['nodes'],
  links: ScryModel['links']
): {
  ids: string[]
  nodeIds: Set<string>
} {
  const ids: string[] = []
  const nodeIds = new Set<string>()
  for (const node of nodes) {
    ids.push(node.id)
    nodeIds.add(node.id)
    for (const responsibility of node.responsibilities ?? []) {
      ids.push(responsibility.id)
    }
  }
  for (const link of links) {
    ids.push(link.id)
  }
  return { ids, nodeIds }
}

function duplicatePayloadFindings(ids: string[]): ScryerValidationFinding[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id)
    }
    seen.add(id)
  }
  return [...duplicates].map((id) =>
    structuralFinding({
      code: 'duplicate_id',
      message: `Payload id '${id}' appears more than once`,
      path: semanticPath.model(),
      details: { id, reason: 'duplicate_payload_id' }
    })
  )
}

function clearSourceForDeleted(
  model: ScryModel,
  deletedNodeIds: Set<string>,
  deletedResponsibilityIds: Set<string>
): void {
  for (const id of deletedNodeIds) {
    delete model.sourceMap[id]
    delete model.boundaries[id]
  }
  for (const id of deletedResponsibilityIds) {
    delete model.sourceMap[id]
  }
}

function cleanupGroups(model: ScryModel): GroupCleanupResult {
  let groups: ScryGroup[] = model.groups.map((group) => {
    const next: ScryGroup = { ...group, memberIds: [...group.memberIds] }
    if (group.responsibilities) {
      next.responsibilities = [...group.responsibilities]
    }
    return next
  })
  const removedGroupIds = new Set<string>()
  const updatedGroupIds = new Set<string>()
  let removedMembershipCount = 0
  let changed = true

  while (changed) {
    changed = false
    const nodeIndex = nodesById({ ...model, groups })
    const groupIndex = groupsById({ ...model, groups })
    const nextGroups: ScryGroup[] = []

    for (const group of groups) {
      if (group.parentNodeId && !nodeIndex.has(group.parentNodeId)) {
        removedGroupIds.add(group.id)
        changed = true
        continue
      }
      if (group.parentGroupId && !groupIndex.has(group.parentGroupId)) {
        removedGroupIds.add(group.id)
        changed = true
        continue
      }

      const beforeMembers = group.memberIds
      const memberIds = beforeMembers.filter((memberId) => {
        const member = nodeIndex.get(memberId)
        if (!member) {
          return false
        }
        return !group.parentNodeId || member.parentId === group.parentNodeId
      })
      const removedMembers = beforeMembers.length - memberIds.length
      if (removedMembers > 0) {
        removedMembershipCount += removedMembers
        updatedGroupIds.add(group.id)
        changed = true
      }

      const memberKinds = new Set(
        memberIds.map((memberId) => nodeIndex.get(memberId)?.kind).filter(Boolean)
      )
      if (memberIds.length === 0 || memberKinds.size > 1) {
        removedGroupIds.add(group.id)
        changed = true
        continue
      }

      nextGroups.push({ ...group, memberIds })
    }
    groups = nextGroups
  }

  for (const id of removedGroupIds) {
    updatedGroupIds.delete(id)
  }

  return {
    model: { ...model, groups },
    summary: {
      removedGroupCount: removedGroupIds.size,
      updatedGroupCount: updatedGroupIds.size,
      removedMembershipCount
    }
  }
}

function pendingSummary(committed: ScryModel, planned: ScryModel): PendingSummary {
  return summarizePending(diffModels(committed, planned))
}

function recommendedReads(nodeId?: string): ScryerRecommendedRead[] {
  return [
    ...(nodeId
      ? [
          {
            operationId: 'scryer.model.read' as const,
            input: { view: 'subtree', node: nodeId, layer: 'plan' },
            reason: 'Inspect the planned structural result'
          }
        ]
      : []),
    {
      operationId: 'scryer.plan.pending',
      input: {},
      reason: 'Review pending model work before folding'
    }
  ]
}

function blockingFindings(findings: ScryerValidationFinding[]): ScryerValidationFinding[] {
  return findings.filter(
    (finding) => finding.severity === 'error' || STRUCTURAL_BLOCKING_CODES.has(finding.code)
  )
}

function firstDuplicate<T>(items: T[]): T | undefined {
  const seen = new Set<T>()
  for (const item of items) {
    if (seen.has(item)) {
      return item
    }
    seen.add(item)
  }
  return undefined
}

function parentId(value: string | null | undefined): string | undefined {
  return value ?? undefined
}

function applyParent(node: ScryNode, nextParentId: string | undefined): ScryNode {
  const next = { ...node }
  if (nextParentId) {
    next.parentId = nextParentId
  } else {
    delete next.parentId
  }
  return next
}

export class StructuralMutationPlanner {
  private readonly committed: ScryModel
  private readonly planned: ScryModel
  private readonly services: ScryerOperationServices

  constructor(args: StructuralPlannerArgs) {
    this.committed = args.committed ?? args.planned
    this.planned = args.planned
    this.services = args.services
  }

  planSetSubtree(
    input: ScryerNodeSetSubtreeInput
  ): ScryerExecutorResult<ScryerNodeSetSubtreeResult> {
    const root = this.planned.nodes.find((node) => node.id === input.node_id)
    if (!root) {
      return notFound('node', input.node_id, 'node_id')
    }

    const payloadLinks = input.data.links ?? []
    const { ids: rawPayloadIds, nodeIds: newNodeIds } = payloadIds(input.data.nodes, payloadLinks)
    const oldDescendantIds = collectDescendantIds(this.planned, [root.id], false)
    const oldResponsibilityIds = responsibilityIdsForNodes(this.planned, oldDescendantIds)
    const removedLinkIds = new Set(
      this.planned.links
        .filter((link) => oldDescendantIds.has(link.src) || oldDescendantIds.has(link.dst))
        .map((link) => link.id)
    )
    const preservedIds = everyModelId(this.planned)
    for (const id of oldDescendantIds) {
      preservedIds.delete(id)
    }
    for (const id of oldResponsibilityIds) {
      preservedIds.delete(id)
    }
    for (const id of removedLinkIds) {
      preservedIds.delete(id)
    }

    const hardFindings = duplicatePayloadFindings(rawPayloadIds)
    if (newNodeIds.has(root.id)) {
      hardFindings.push(
        structuralFinding({
          code: 'duplicate_id',
          message: `Payload cannot include existing root '${root.id}'`,
          path: semanticPath.node(root.id),
          details: { id: root.id, reason: 'payload_root_id' }
        })
      )
    }
    for (const id of rawPayloadIds) {
      if (preservedIds.has(id)) {
        hardFindings.push(
          structuralFinding({
            code: 'duplicate_id',
            message: `Payload id '${id}' collides with preserved model identity`,
            path: semanticPath.model(),
            details: { id, reason: 'preserved_identity_collision' }
          })
        )
      }
    }

    const finalNodeIds = new Set([
      ...this.planned.nodes.filter((node) => !oldDescendantIds.has(node.id)).map((node) => node.id),
      ...newNodeIds
    ])
    const seenPayloadPairs = new Set<string>()
    const preservedPairs = new Set(
      this.planned.links
        .filter((link) => !removedLinkIds.has(link.id))
        .map((link) => `${link.src}->${link.dst}`)
    )
    for (const link of payloadLinks) {
      const pair = `${link.src}->${link.dst}`
      if (!finalNodeIds.has(link.src)) {
        hardFindings.push(
          structuralFinding({
            code: 'missing_reference',
            message: `Payload link '${link.id}' references unknown src '${link.src}'`,
            path: semanticPath.link(link.id, 'src'),
            details: { entity: 'link', id: link.id, field: 'src', targetEntity: 'node' }
          })
        )
      }
      if (!finalNodeIds.has(link.dst)) {
        hardFindings.push(
          structuralFinding({
            code: 'missing_reference',
            message: `Payload link '${link.id}' references unknown dst '${link.dst}'`,
            path: semanticPath.link(link.id, 'dst'),
            details: { entity: 'link', id: link.id, field: 'dst', targetEntity: 'node' }
          })
        )
      }
      if (!newNodeIds.has(link.src) && !newNodeIds.has(link.dst)) {
        hardFindings.push(
          structuralFinding({
            code: 'illegal_link',
            message: `Payload link '${link.id}' must touch the replacement subtree`,
            path: semanticPath.link(link.id),
            details: { reason: 'external_only_payload_link', src: link.src, dst: link.dst }
          })
        )
      }
      if (seenPayloadPairs.has(pair) || preservedPairs.has(pair)) {
        hardFindings.push(
          structuralFinding({
            code: 'illegal_link',
            message: `Payload link '${link.id}' duplicates endpoint pair ${pair}`,
            path: semanticPath.link(link.id),
            details: { reason: 'duplicate_link', src: link.src, dst: link.dst, linkId: link.id }
          })
        )
      }
      seenPayloadPairs.add(pair)
    }

    if (hardFindings.length > 0) {
      return validationFailure(
        'node.set-subtree payload failed structural validation',
        hardFindings
      )
    }

    let candidate = cloneModel(this.planned)
    candidate.nodes = candidate.nodes
      .filter((node) => !oldDescendantIds.has(node.id))
      .concat(cloneModel({ ...candidate, nodes: input.data.nodes }).nodes)
    candidate.links = candidate.links
      .filter((link) => !removedLinkIds.has(link.id))
      .concat(cloneModel({ ...candidate, links: payloadLinks }).links)
    clearSourceForDeleted(candidate, oldDescendantIds, oldResponsibilityIds)

    const reachabilityFindings = this.validatePayloadReachability(candidate, root.id, newNodeIds)
    if (reachabilityFindings.length > 0) {
      return validationFailure(
        'node.set-subtree payload is not rooted under the target',
        reachabilityFindings
      )
    }

    const cleanup = cleanupGroups(candidate)
    candidate = cleanup.model
    const blockers = this.validateChangedCandidate(candidate)
    if (blockers.length > 0) {
      return validationFailure('node.set-subtree would create an invalid model', blockers)
    }

    const noWrite = sameModel(this.planned, candidate)
    const findings = noWrite
      ? [noOpFinding('scryer.node.set-subtree', 'Replacement leaves the planned model unchanged')]
      : this.services.validators.validateModel(candidate)
    const summary = pendingSummary(this.committed, candidate)
    const result: ScryerNodeSetSubtreeResult = {
      rootId: root.id,
      addedNodeCount: noWrite ? 0 : input.data.nodes.length,
      removedNodeCount: noWrite ? 0 : oldDescendantIds.size,
      addedLinkCount: noWrite ? 0 : payloadLinks.length,
      removedLinkCount: noWrite ? 0 : removedLinkIds.size,
      groupCleanup: noWrite ? EMPTY_GROUP_CLEANUP : cleanup.summary,
      findings,
      pendingSummary: summary,
      recommendedNextReads: recommendedReads(root.id)
    }
    return ok(result, noWrite ? undefined : candidate)
  }

  planNodeMove(input: ScryerNodeMoveInput): ScryerExecutorResult<ScryerNodeMoveResult> {
    const duplicateNodeId = firstDuplicate(input.moves.map((move) => move.node_id))
    if (duplicateNodeId) {
      return validationFailure('node.move contains duplicate move targets', [
        structuralFinding({
          code: 'duplicate_id',
          message: `Node '${duplicateNodeId}' is moved more than once`,
          path: semanticPath.node(duplicateNodeId),
          details: { id: duplicateNodeId, reason: 'duplicate_move_target' }
        })
      ])
    }

    const hardFindings: ScryerValidationFinding[] = []
    const nodes = nodesById(this.planned)
    for (const move of input.moves) {
      const node = nodes.get(move.node_id)
      if (!node) {
        return notFound('node', move.node_id, 'moves[].node_id')
      }
      const nextParentId = parentId(move.new_parent_id)
      if (!nextParentId) {
        if (node.kind !== 'person' && node.kind !== 'system') {
          hardFindings.push(
            structuralFinding({
              code: 'invalid_hierarchy',
              message: `Node '${node.id}' of kind '${node.kind}' cannot move to top level`,
              path: semanticPath.node(node.id, 'parentId'),
              details: { nodeId: node.id, reason: 'top_level_kind' }
            })
          )
        }
        continue
      }
      const parent = nodes.get(nextParentId)
      if (!parent) {
        return notFound('node', nextParentId, 'moves[].new_parent_id')
      }
      if (parent.external === true) {
        hardFindings.push(
          structuralFinding({
            code: 'invalid_hierarchy',
            message: `Node '${node.id}' cannot move under external parent '${parent.id}'`,
            path: semanticPath.node(node.id, 'parentId'),
            details: { nodeId: node.id, parentId: parent.id, reason: 'external_parent' }
          })
        )
      }
      if (!validParentKind(parent.kind, node.kind)) {
        hardFindings.push(
          structuralFinding({
            code: 'invalid_hierarchy',
            message: `Node '${node.id}' kind '${node.kind}' cannot move under '${parent.kind}'`,
            path: semanticPath.node(node.id, 'parentId'),
            details: { nodeId: node.id, parentId: parent.id, reason: 'invalid_parent_kind' }
          })
        )
      }
    }
    if (hardFindings.length > 0) {
      return validationFailure('node.move failed hierarchy validation', hardFindings)
    }

    const moveMap = new Map(input.moves.map((move) => [move.node_id, parentId(move.new_parent_id)]))
    let candidate = cloneModel(this.planned)
    candidate.nodes = candidate.nodes.map((node) =>
      moveMap.has(node.id) ? applyParent(node, moveMap.get(node.id)) : node
    )

    const cycleFindings = this.validateNoCycles(candidate)
    if (cycleFindings.length > 0) {
      return validationFailure('node.move would create a containment cycle', cycleFindings)
    }

    const cleanup = cleanupGroups(candidate)
    candidate = cleanup.model
    const blockers = this.validateChangedCandidate(candidate)
    if (blockers.length > 0) {
      return validationFailure('node.move would create an invalid model', blockers)
    }

    const noWrite = sameModel(this.planned, candidate)
    const moved = input.moves
      .map((move) => {
        const original = nodes.get(move.node_id)!
        const nextParentId = parentId(move.new_parent_id)
        return { nodeId: move.node_id, fromParentId: original.parentId, toParentId: nextParentId }
      })
      .filter((move) => move.fromParentId !== move.toParentId)
    const findings = noWrite
      ? [noOpFinding('scryer.node.move', 'All requested nodes are already at the requested parent')]
      : this.services.validators.validateModel(candidate)
    const result: ScryerNodeMoveResult = {
      moved: noWrite ? [] : moved,
      groupCleanup: noWrite ? EMPTY_GROUP_CLEANUP : cleanup.summary,
      findings,
      pendingSummary: pendingSummary(this.committed, candidate),
      recommendedNextReads: recommendedReads(moved[0]?.nodeId)
    }
    return ok(result, noWrite ? undefined : candidate)
  }

  planResponsibilityMove(
    input: ScryerResponsibilityMoveInput
  ): ScryerExecutorResult<ScryerResponsibilityMoveResult> {
    const duplicateResponsibilityId = firstDuplicate(
      input.moves.map((move) => move.responsibility_id)
    )
    if (duplicateResponsibilityId) {
      return validationFailure('responsibility.move contains duplicate move targets', [
        structuralFinding({
          code: 'duplicate_id',
          message: `Responsibility '${duplicateResponsibilityId}' is moved more than once`,
          path: semanticPath.model(),
          details: { id: duplicateResponsibilityId, reason: 'duplicate_move_target' }
        })
      ])
    }

    const nodes = nodesById(this.planned)
    const groupResponsibilityIds = new Set(
      this.planned.groups.flatMap((group) => (group.responsibilities ?? []).map((item) => item.id))
    )
    const hardFindings: ScryerValidationFinding[] = []
    for (const move of input.moves) {
      const fromNode = nodes.get(move.from_node_id)
      if (!fromNode) {
        return notFound('node', move.from_node_id, 'moves[].from_node_id')
      }
      if (!nodes.has(move.to_node_id)) {
        return notFound('node', move.to_node_id, 'moves[].to_node_id')
      }
      const responsibility = (fromNode.responsibilities ?? []).find(
        (candidate) => candidate.id === move.responsibility_id
      )
      if (!responsibility) {
        if (groupResponsibilityIds.has(move.responsibility_id)) {
          hardFindings.push(
            structuralFinding({
              code: 'invalid_hierarchy',
              message: `Responsibility '${move.responsibility_id}' is group-owned and cannot be moved by node responsibility.move`,
              path: semanticPath.model(),
              details: { responsibilityId: move.responsibility_id, reason: 'group_owned' }
            })
          )
          continue
        }
        return notFound('responsibility', move.responsibility_id, 'moves[].responsibility_id')
      }
      if (responsibility.vagrant === true) {
        hardFindings.push(
          structuralFinding({
            code: 'invalid_drift_marker_transition',
            message: `Vagrant responsibility '${responsibility.id}' cannot be moved`,
            path: semanticPath.nodeResponsibility(fromNode.id, responsibility.id),
            details: { entity: 'responsibility', id: responsibility.id, reason: 'vagrant_move' }
          })
        )
      }
    }
    if (hardFindings.length > 0) {
      return validationFailure('responsibility.move failed structural validation', hardFindings)
    }

    let candidate = cloneModel(this.planned)
    const moved: ScryerResponsibilityMoveResult['moved'] = []
    for (const move of input.moves) {
      if (move.from_node_id === move.to_node_id) {
        continue
      }
      const fromNode = candidate.nodes.find((node) => node.id === move.from_node_id)!
      const toNode = candidate.nodes.find((node) => node.id === move.to_node_id)!
      const responsibilities = fromNode.responsibilities ?? []
      const index = responsibilities.findIndex((item) => item.id === move.responsibility_id)
      const responsibility = responsibilities[index]!
      if ((toNode.responsibilities ?? []).some((item) => item.id === responsibility.id)) {
        return validationFailure('responsibility.move would duplicate responsibility ids', [
          structuralFinding({
            code: 'duplicate_id',
            message: `Destination node '${toNode.id}' already owns responsibility '${responsibility.id}'`,
            path: semanticPath.nodeResponsibility(toNode.id, responsibility.id),
            details: { id: responsibility.id, reason: 'destination_collision' }
          })
        ])
      }
      fromNode.responsibilities = responsibilities.filter((_, itemIndex) => itemIndex !== index)
      toNode.responsibilities = [...(toNode.responsibilities ?? []), responsibility]
      moved.push({
        responsibilityId: responsibility.id,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id
      })
    }

    const noWrite = sameModel(this.planned, candidate)
    const blockers = noWrite ? [] : this.validateChangedCandidate(candidate)
    if (blockers.length > 0) {
      return validationFailure('responsibility.move would create an invalid model', blockers)
    }
    const findings = noWrite
      ? [
          noOpFinding(
            'scryer.responsibility.move',
            'All requested responsibilities are already on the requested node'
          )
        ]
      : this.services.validators.validateModel(candidate)
    const result: ScryerResponsibilityMoveResult = {
      moved: noWrite ? [] : moved,
      findings,
      pendingSummary: pendingSummary(this.committed, candidate),
      recommendedNextReads: recommendedReads(moved[0]?.toNodeId)
    }
    return ok(result, noWrite ? undefined : candidate)
  }

  planNodeDescope(input: ScryerNodeDescopeInput): ScryerExecutorResult<ScryerNodeDescopeResult> {
    const duplicateNodeId = firstDuplicate(input.node_ids)
    if (duplicateNodeId) {
      return validationFailure('node.descope contains duplicate targets', [
        structuralFinding({
          code: 'duplicate_id',
          message: `Node '${duplicateNodeId}' is descoped more than once`,
          path: semanticPath.node(duplicateNodeId),
          details: { id: duplicateNodeId, reason: 'duplicate_descope_target' }
        })
      ])
    }

    const nodes = nodesById(this.planned)
    const hardFindings: ScryerValidationFinding[] = []
    const targetIds = new Set(input.node_ids)
    for (const nodeId of input.node_ids) {
      const node = nodes.get(nodeId)
      if (!node) {
        return notFound('node', nodeId, 'node_ids')
      }
      if (!node.parentId) {
        hardFindings.push(
          structuralFinding({
            code: 'invalid_hierarchy',
            message: `Top-level node '${node.id}' cannot be descoped`,
            path: semanticPath.node(node.id, 'parentId'),
            details: { nodeId: node.id, reason: 'top_level_descope' }
          })
        )
      }
      const descendantIds = collectDescendantIds(this.planned, [node.id], false)
      const overlapping = [...descendantIds].find((id) => targetIds.has(id))
      if (overlapping) {
        hardFindings.push(
          structuralFinding({
            code: 'invalid_hierarchy',
            message: `Descoped targets cannot overlap: '${overlapping}' is under '${node.id}'`,
            path: semanticPath.node(overlapping),
            details: { nodeId: overlapping, ancestorId: node.id, reason: 'overlapping_descope' }
          })
        )
      }
    }
    if (hardFindings.length > 0) {
      return validationFailure('node.descope failed target validation', hardFindings)
    }

    const removedNodeIds = collectDescendantIds(this.planned, targetIds, true)
    const droppedResponsibilityIds = new Set<string>()
    const relocatedResponsibilities: Array<{
      parentId: string
      responsibility: ScryResponsibility
    }> = []

    for (const nodeId of input.node_ids) {
      const node = nodes.get(nodeId)!
      for (const responsibility of node.responsibilities ?? []) {
        if (responsibility.vagrant === true) {
          droppedResponsibilityIds.add(responsibility.id)
        } else {
          relocatedResponsibilities.push({ parentId: node.parentId!, responsibility })
        }
      }
    }
    for (const node of this.planned.nodes) {
      if (!removedNodeIds.has(node.id) || targetIds.has(node.id)) {
        continue
      }
      for (const responsibility of node.responsibilities ?? []) {
        droppedResponsibilityIds.add(responsibility.id)
      }
    }

    let candidate = cloneModel(this.planned)
    const removedLinkIds = new Set(
      candidate.links
        .filter((link) => removedNodeIds.has(link.src) || removedNodeIds.has(link.dst))
        .map((link) => link.id)
    )
    candidate.links = candidate.links.filter((link) => !removedLinkIds.has(link.id))
    for (const relocation of relocatedResponsibilities) {
      const parent = candidate.nodes.find((node) => node.id === relocation.parentId)!
      parent.responsibilities = [...(parent.responsibilities ?? []), relocation.responsibility]
    }
    candidate.nodes = candidate.nodes.filter((node) => !removedNodeIds.has(node.id))
    clearSourceForDeleted(candidate, removedNodeIds, droppedResponsibilityIds)

    const cleanup = cleanupGroups(candidate)
    candidate = cleanup.model
    const blockers = this.validateChangedCandidate(candidate)
    if (blockers.length > 0) {
      return validationFailure('node.descope would create an invalid model', blockers)
    }

    const findings = this.services.validators.validateModel(candidate)
    const result: ScryerNodeDescopeResult = {
      descopedCount: input.node_ids.length,
      relocatedResponsibilityCount: relocatedResponsibilities.length,
      droppedResponsibilityCount: droppedResponsibilityIds.size,
      removedLinkCount: removedLinkIds.size,
      groupCleanup: cleanup.summary,
      modelCorrection: true,
      codeAction: 'code_unchanged',
      pendingReason: 'model_correction_code_unchanged',
      findings,
      pendingSummary: pendingSummary(this.committed, candidate),
      recommendedNextReads: recommendedReads(
        nodes.get(input.node_ids[0])?.parentId ?? candidate.nodes[0]?.id
      )
    }
    return ok(result, candidate)
  }

  private validateChangedCandidate(candidate: ScryModel): ScryerValidationFinding[] {
    return blockingFindings(this.services.validators.validateModel(candidate))
  }

  private validatePayloadReachability(
    candidate: ScryModel,
    rootId: string,
    payloadNodeIds: Set<string>
  ): ScryerValidationFinding[] {
    const nodes = nodesById(candidate)
    const findings: ScryerValidationFinding[] = []
    for (const nodeId of payloadNodeIds) {
      let current = nodes.get(nodeId)
      const seen = new Set<string>()
      let reachedRoot = false
      while (current?.parentId && !seen.has(current.id)) {
        if (current.parentId === rootId) {
          reachedRoot = true
          break
        }
        seen.add(current.id)
        current = nodes.get(current.parentId)
      }
      if (!reachedRoot) {
        findings.push(
          structuralFinding({
            code: 'invalid_hierarchy',
            message: `Payload node '${nodeId}' is not a descendant of root '${rootId}'`,
            path: semanticPath.node(nodeId, 'parentId'),
            details: { nodeId, rootId, reason: 'outside_replacement_root' }
          })
        )
      }
    }
    return findings
  }

  private validateNoCycles(candidate: ScryModel): ScryerValidationFinding[] {
    const nodes = nodesById(candidate)
    const findings: ScryerValidationFinding[] = []
    for (const node of candidate.nodes) {
      const seen = new Set<string>()
      let current: ScryNode | undefined = node
      while (current?.parentId) {
        if (seen.has(current.id)) {
          findings.push(
            structuralFinding({
              code: 'invalid_hierarchy',
              message: `Node '${node.id}' would participate in a containment cycle`,
              path: semanticPath.node(node.id, 'parentId'),
              details: { nodeId: node.id, reason: 'cycle' }
            })
          )
          break
        }
        seen.add(current.id)
        current = nodes.get(current.parentId)
      }
    }
    return findings
  }
}

export function createStructuralMutationPlanner(
  args: StructuralPlannerArgs
): StructuralMutationPlanner {
  return new StructuralMutationPlanner(args)
}
