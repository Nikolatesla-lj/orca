import type { C4ModelData, C4Node, Group } from '../../shared/scryer/model-types'

export function stripPositions(model: C4ModelData): C4ModelData {
  return {
    ...model,
    nodes: model.nodes.map(
      ({ position: _position, selected: _selected, measured: _measured, ...node }) => node
    )
  }
}

export function stripNodeForAgent(
  node: C4Node
): Omit<C4Node, 'position' | 'selected' | 'measured'> {
  const { position: _position, selected: _selected, measured: _measured, ...rest } = node
  return rest
}

export function nextNodeId(model: C4ModelData): string {
  let max = 0
  for (const node of model.nodes) {
    const match = /^node-(\d+)$/.exec(node.id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `node-${max + 1}`
}

export function groupMemberIds(group: Group): string[] {
  const legacy = group as Group & { member_ids?: string[] }
  return Array.isArray(group.memberIds) ? group.memberIds : (legacy.member_ids ?? [])
}

export function collectDescendantIds(model: C4ModelData, nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of model.nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

export function cleanupReferences(model: C4ModelData, deletedIds: Set<string>): void {
  for (const id of deletedIds) {
    delete model.sourceMap?.[id]
  }
  model.groups = (model.groups ?? [])
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => !deletedIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0)
}
