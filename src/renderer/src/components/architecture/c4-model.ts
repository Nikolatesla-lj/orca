/* eslint-disable max-lines -- Why: C4 view, hierarchy, deletion, and layout-write helpers stay together until the remaining Scryer layout modules are migrated. */
import type { C4Edge, C4Kind, C4ModelData, C4Node } from '../../../../shared/scryer/model-types'

const NODE_W = 180
const NODE_H = 160

export type VisibleArchitectureView = {
  currentParentId: string | undefined
  currentParentKind: C4Kind | undefined
  levelPrefix: string
  visibleNodes: C4Node[]
  visibleEdges: C4Edge[]
  refNodeIds: Set<string>
}

export type VisibleArchitectureViewInput = {
  model: C4ModelData
  expandedPath: string[]
  changedNodeIds?: Set<string>
  driftedNodeIds?: Set<string>
}

export type NodePositionChangeLike = {
  id?: string
  type: string
  position?: { x: number; y: number }
  [key: string]: unknown
}

export function currentParentIdFromPath(expandedPath: string[]): string | undefined {
  return expandedPath.at(-1)
}

export function isExpandableKind(kind: C4Kind): boolean {
  return kind === 'system' || kind === 'container' || kind === 'component'
}

export function nextKindForParent(parent?: C4Node | null): C4Kind {
  if (!parent) {
    return 'system'
  }
  if (parent.data.kind === 'system') {
    return 'container'
  }
  if (parent.data.kind === 'container') {
    return 'component'
  }
  return 'operation'
}

export function nodeTypeForKind(kind: C4Kind): C4Node['type'] {
  if (kind === 'operation' || kind === 'process' || kind === 'model') {
    return kind
  }
  return 'c4'
}

export function defaultNodePosition(kind: C4Kind, index: number): { x: number; y: number } {
  const y = kind === 'system' ? 80 : kind === 'container' ? 230 : kind === 'component' ? 380 : 520
  return { x: 80 + (index % 4) * 250, y }
}

export function createNodeForParent(model: C4ModelData, parent: C4Node | null): C4Node {
  const kind = nextKindForParent(parent)
  const sameKindCount = model.nodes.filter((node) => node.data.kind === kind).length
  const id = `node-${Date.now().toString(36)}-${sameKindCount + 1}`
  return {
    id,
    type: nodeTypeForKind(kind),
    parentId: parent?.id,
    position: defaultNodePosition(kind, sameKindCount),
    data: {
      name: `${kind[0].toUpperCase()}${kind.slice(1)} ${sameKindCount + 1}`,
      description: '',
      kind,
      status:
        kind === 'person' || (kind === 'system' && parent?.data.external) ? undefined : 'proposed',
      contract: { expect: [], ask: [], never: [] },
      notes: []
    }
  }
}

export function collectDescendantIds(nodes: C4Node[], seedIds: Iterable<string>): Set<string> {
  const ids = new Set(seedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

export function deleteNodesFromModel(model: C4ModelData, nodeIds: string[]): C4ModelData {
  const toDelete = collectDescendantIds(model.nodes, nodeIds)
  const sourceMap = { ...model.sourceMap }
  for (const id of toDelete) {
    delete sourceMap[id]
  }

  const groups = (model.groups ?? [])
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((memberId) => !toDelete.has(memberId))
    }))
    .filter((group) => group.memberIds.length > 0)

  const remainingGroupIds = new Set(groups.map((group) => group.id))
  const normalizedGroups = groups.map((group) =>
    group.parentGroupId && !remainingGroupIds.has(group.parentGroupId)
      ? { ...group, parentGroupId: undefined }
      : group
  )

  return {
    ...model,
    nodes: model.nodes.filter((node) => !toDelete.has(node.id)),
    edges: model.edges.filter((edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)),
    sourceMap,
    groups: normalizedGroups
  }
}

export function applyNodePositionChangesToModel(
  model: C4ModelData,
  changes: readonly NodePositionChangeLike[],
  refNodeIds: ReadonlySet<string>
): C4ModelData | null {
  const positions = new Map<string, { x: number; y: number }>()
  for (const change of changes) {
    if (change.type !== 'position' || !change.id || refNodeIds.has(change.id)) {
      continue
    }
    if (!change.position) {
      continue
    }
    const { x, y } = change.position
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }
    positions.set(change.id, { x, y })
  }

  if (positions.size === 0) {
    return null
  }

  let changed = false
  const nodes = model.nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) {
      return node
    }
    if (node.position?.x === position.x && node.position.y === position.y) {
      return node
    }
    changed = true
    return { ...node, position }
  })

  return changed ? { ...model, nodes } : null
}

export function reconcileExpandedPath(model: C4ModelData, expandedPath: string[]): string[] {
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  if (expandedPath.length > 0) {
    return expandedPath.every((nodeId) => nodeIds.has(nodeId)) ? expandedPath : []
  }

  const rootNodes = model.nodes.filter((node) => !node.parentId)
  if (rootNodes.length !== 1) {
    return []
  }

  const [rootNode] = rootNodes
  if (!isExpandableKind(rootNode.data.kind)) {
    return []
  }

  return model.nodes.some((node) => node.parentId === rootNode.id) ? [rootNode.id] : []
}

export function getVisibleArchitectureView({
  model,
  expandedPath,
  changedNodeIds = new Set(),
  driftedNodeIds = new Set()
}: VisibleArchitectureViewInput): VisibleArchitectureView {
  const currentParentId = currentParentIdFromPath(expandedPath)
  const currentParent = currentParentId
    ? model.nodes.find((node) => node.id === currentParentId)
    : undefined
  const currentParentKind = currentParent?.data.kind
  const levelPrefix = currentParentId ?? 'root'

  const childNodes = model.nodes
    .filter((node) => (node.parentId ?? undefined) === currentParentId)
    .map((node) => ({ ...node, parentId: undefined }))

  const childIds = new Set(childNodes.map((node) => node.id))
  const referenceNodes = currentParentId
    ? createReferenceNodes(model, currentParentId, childNodes, childIds)
    : []
  const visibleNodes = addTransientNodeData([...childNodes, ...referenceNodes], {
    allNodes: model.nodes,
    groups: model.groups ?? [],
    changedNodeIds,
    driftedNodeIds
  })

  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const isCodeLevel = currentParentKind === 'component'
  const visibleEdges = isCodeLevel
    ? []
    : model.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  const refNodeIds = new Set(referenceNodes.map((node) => node.id))

  return {
    currentParentId,
    currentParentKind,
    levelPrefix,
    visibleNodes,
    visibleEdges,
    refNodeIds
  }
}

function createReferenceNodes(
  model: C4ModelData,
  currentParentId: string,
  childNodes: C4Node[],
  childIds: Set<string>
): C4Node[] {
  const refMap = new Map<string, { direction: 'in' | 'out'; label: string; method?: string }[]>()
  for (const edge of model.edges) {
    const sourceIsParent = edge.source === currentParentId
    const targetIsParent = edge.target === currentParentId
    if (!sourceIsParent && !targetIsParent) {
      continue
    }
    const otherId = sourceIsParent ? edge.target : edge.source
    if (childIds.has(otherId)) {
      continue
    }
    const relationships = refMap.get(otherId) ?? []
    relationships.push({
      direction: sourceIsParent ? 'out' : 'in',
      label: edge.data?.label ?? '',
      method: edge.data?.method
    })
    refMap.set(otherId, relationships)
  }

  const bounds = boundsForNodes(childNodes)
  const inRefs: string[] = []
  const outRefs: string[] = []
  for (const [id, relationships] of refMap) {
    const original = model.nodes.find((node) => node.id === id)
    if (!original) {
      continue
    }
    const direction = relationships[0]?.direction ?? 'out'
    if (direction === 'in') {
      inRefs.push(id)
    } else {
      outRefs.push(id)
    }
  }

  const makeRef = (id: string, index: number, total: number, y: number): C4Node | null => {
    const original = model.nodes.find((node) => node.id === id)
    const relationships = refMap.get(id)
    if (!original || !relationships) {
      return null
    }
    const spacing = NODE_W + 70
    const totalWidth = (total - 1) * spacing
    const autoPosition = {
      x: (bounds.minX + bounds.maxX) / 2 - totalWidth / 2 + index * spacing,
      y
    }
    const position = model.refPositions?.[`${currentParentId}/${id}`] ?? autoPosition
    return {
      ...original,
      parentId: undefined,
      position,
      data: {
        ...original.data,
        _reference: true,
        _relationships: relationships
      }
    }
  }

  const refs: C4Node[] = []
  for (let index = 0; index < inRefs.length; index++) {
    const ref = makeRef(inRefs[index], index, inRefs.length, bounds.minY - NODE_H - 120)
    if (ref) {
      refs.push(ref)
    }
  }
  for (let index = 0; index < outRefs.length; index++) {
    const ref = makeRef(outRefs[index], index, outRefs.length, bounds.maxY + NODE_H + 120)
    if (ref) {
      refs.push(ref)
    }
  }
  return refs
}

function boundsForNodes(nodes: C4Node[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  if (nodes.length === 0) {
    return { minX: 100, maxX: 100, minY: 100, maxY: 100 }
  }
  const xs = nodes.map((node) => node.position?.x ?? 0)
  const ys = nodes.map((node) => node.position?.y ?? 0)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

function addTransientNodeData(
  nodes: C4Node[],
  {
    allNodes,
    groups,
    changedNodeIds,
    driftedNodeIds
  }: {
    allNodes: C4Node[]
    groups: C4ModelData['groups']
    changedNodeIds: Set<string>
    driftedNodeIds: Set<string>
  }
): C4Node[] {
  const groupNameByNodeId = new Map<string, string>()
  for (const group of groups ?? []) {
    for (const memberId of group.memberIds) {
      groupNameByNodeId.set(memberId, group.name)
    }
  }
  const childNodesByParentId = new Map<string, C4Node[]>()
  for (const node of allNodes) {
    if (!node.parentId) {
      continue
    }
    const children = childNodesByParentId.get(node.parentId) ?? []
    children.push(node)
    childNodesByParentId.set(node.parentId, children)
  }

  return nodes.map((node) => {
    const groupName = groupNameByNodeId.get(node.id)
    const changed = changedNodeIds.has(node.id)
    const drifted = driftedNodeIds.has(node.id)
    const children = childNodesByParentId.get(node.id) ?? []
    const operations = children
      .filter((child) => child.data.kind === 'operation')
      .map((child) => ({ id: child.id, name: child.data.name, status: child.data.status }))
    const processes = children
      .filter((child) => child.data.kind === 'process')
      .map((child) => ({ id: child.id, name: child.data.name, status: child.data.status }))
    const models = children
      .filter((child) => child.data.kind === 'model')
      .map((child) => ({ id: child.id, name: child.data.name, status: child.data.status }))
    if (
      !groupName &&
      !changed &&
      !drifted &&
      children.length === 0 &&
      operations.length === 0 &&
      processes.length === 0 &&
      models.length === 0
    ) {
      return node
    }
    return {
      ...node,
      data: {
        ...node.data,
        ...(groupName ? { _groupName: groupName } : {}),
        ...(changed ? { _changed: true } : {}),
        ...(drifted ? { _drifted: true } : {}),
        ...(children.length > 0 ? { _hasChildren: true } : {}),
        ...(operations.length > 0 ? { _operations: operations } : {}),
        ...(processes.length > 0 ? { _processes: processes } : {}),
        ...(models.length > 0 ? { _models: models } : {})
      }
    }
  })
}
