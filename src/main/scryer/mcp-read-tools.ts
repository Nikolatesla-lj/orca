import type { C4Edge, C4ModelData, Group } from '../../shared/scryer/model-types'
import { isRecord } from './mcp-tool-execution'
import { kindLabel } from './mcp-model-values'
import { collectDescendantIds, stripNodeForAgent } from './mcp-task-model'

export function getScopedNode(model: C4ModelData, nodeId: string): unknown {
  const target = model.nodes.find((node) => node.id === nodeId)
  if (!target) {
    return null
  }
  const subtreeIds = collectDescendantIds(model, nodeId)
  const descendants = model.nodes.filter((node) => subtreeIds.has(node.id) && node.id !== nodeId)
  const internalEdges: C4Edge[] = []
  const externalEdges: unknown[] = []
  for (const edge of model.edges) {
    const sourceIn = subtreeIds.has(edge.source)
    const targetIn = subtreeIds.has(edge.target)
    if (sourceIn && targetIn) {
      internalEdges.push(edge)
    } else if (sourceIn || targetIn) {
      const externalNodeId = sourceIn ? edge.target : edge.source
      const externalNode = model.nodes.find((node) => node.id === externalNodeId)
      externalEdges.push({
        ...edge,
        external_node_name: externalNode?.data.name ?? '',
        external_node_kind: externalNode ? kindLabel(externalNode.data.kind) : ''
      })
    }
  }
  const sourceMap = Object.fromEntries(
    Object.entries(model.sourceMap ?? {}).filter(([id]) => subtreeIds.has(id))
  )
  const groups: Group[] = []
  let group = (model.groups ?? []).find((candidate) => candidate.memberIds.includes(nodeId))
  const seen = new Set<string>()
  while (group && !seen.has(group.id)) {
    groups.push(group)
    seen.add(group.id)
    group = group.parentGroupId
      ? (model.groups ?? []).find((candidate) => candidate.id === group!.parentGroupId)
      : undefined
  }
  return {
    node: stripNodeForAgent(target),
    descendants: descendants.map(stripNodeForAgent),
    internal_edges: internalEdges,
    external_edges: externalEdges,
    source_map: sourceMap,
    groups
  }
}

function sortForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCompare)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortForCompare(item)])
  )
}

function stringifyComparable(value: unknown): string {
  return JSON.stringify(sortForCompare(value))
}

export function computeDiff(baseline: C4ModelData, current: C4ModelData): string {
  const lines: string[] = []
  const baselineNodes = new Map(baseline.nodes.map((node) => [node.id, stripNodeForAgent(node)]))
  const currentNodes = new Map(current.nodes.map((node) => [node.id, stripNodeForAgent(node)]))
  const addedNodes = [...currentNodes.entries()].filter(([id]) => !baselineNodes.has(id))
  const removedNodes = [...baselineNodes.entries()].filter(([id]) => !currentNodes.has(id))
  const modifiedNodes = [...currentNodes.entries()].filter(
    ([id, node]) =>
      baselineNodes.has(id) &&
      stringifyComparable(baselineNodes.get(id)) !== stringifyComparable(node)
  )

  if (addedNodes.length > 0) {
    lines.push('Nodes added:', ...addedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`))
  }
  if (removedNodes.length > 0) {
    lines.push(
      'Nodes removed:',
      ...removedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`)
    )
  }
  if (modifiedNodes.length > 0) {
    lines.push(
      'Nodes modified:',
      ...modifiedNodes.map(([, node]) => `- ${node.data.name} (${node.id})`)
    )
  }

  const baselineEdges = new Map(baseline.edges.map((edge) => [edge.id, edge]))
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]))
  const addedEdges = [...currentEdges.keys()].filter((id) => !baselineEdges.has(id))
  const removedEdges = [...baselineEdges.keys()].filter((id) => !currentEdges.has(id))
  const modifiedEdges = [...currentEdges.entries()].filter(
    ([id, edge]) =>
      baselineEdges.has(id) &&
      stringifyComparable(baselineEdges.get(id)) !== stringifyComparable(edge)
  )
  if (addedEdges.length > 0) {
    lines.push('Edges added:', ...addedEdges.map((id) => `- ${id}`))
  }
  if (removedEdges.length > 0) {
    lines.push('Edges removed:', ...removedEdges.map((id) => `- ${id}`))
  }
  if (modifiedEdges.length > 0) {
    lines.push('Edges modified:', ...modifiedEdges.map(([id]) => `- ${id}`))
  }

  if (
    stringifyComparable(baseline.sourceMap ?? {}) !== stringifyComparable(current.sourceMap ?? {})
  ) {
    lines.push('Source map modified')
  }
  if (stringifyComparable(baseline.flows ?? []) !== stringifyComparable(current.flows ?? [])) {
    lines.push('Flows modified')
  }
  if (stringifyComparable(baseline.groups ?? []) !== stringifyComparable(current.groups ?? [])) {
    lines.push('Groups modified')
  }
  return lines.length > 0 ? lines.join('\n') : 'No model changes since baseline.'
}
