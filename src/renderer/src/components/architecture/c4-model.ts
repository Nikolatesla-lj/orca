/* eslint-disable max-lines -- Why: C4 view, hierarchy, deletion, and layout-write helpers stay together until the remaining Scryer layout modules are migrated. */
import type {
  C4Edge,
  C4Kind,
  C4ModelData,
  C4Node,
  C4NodeData,
  Group
} from '../../../../shared/scryer/model-types'

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

export type ExternalArchitectureEdge = C4Edge & {
  externalNodeName: string
  externalNodeKind: C4Kind
  direction: 'out' | 'in'
}

export type ArchitectureNodeContext = {
  descendants: C4Node[]
  internalEdges: C4Edge[]
  externalEdges: ExternalArchitectureEdge[]
  groups: NonNullable<C4ModelData['groups']>
  sourceMap: NonNullable<C4ModelData['sourceMap']>
}

export type ExternalModelUpdateSummary = {
  model: C4ModelData
  changedNodeIds: Set<string>
  nodeDiffs: Map<string, C4NodeData>
  expandedPath: string[]
}

export type VisibleGroupBubble = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  memberCount: number
  depth: number
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

export function createNodeForParent(
  model: C4ModelData,
  parent: C4Node | null,
  kindOverride?: C4Kind
): C4Node {
  const kind = kindOverride ?? nextKindForParent(parent)
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

export function deleteEdgesFromModel(model: C4ModelData, edgeIds: string[]): C4ModelData {
  const ids = new Set(edgeIds)
  if (ids.size === 0) {
    return model
  }
  return {
    ...model,
    edges: model.edges.filter((edge) => !ids.has(edge.id))
  }
}

export function deleteReferenceEdgesFromModel(
  model: C4ModelData,
  currentParentId: string | undefined,
  referenceNodeIds: string[]
): C4ModelData {
  const ids = new Set(referenceNodeIds)
  if (!currentParentId || ids.size === 0) {
    return model
  }
  return {
    ...model,
    edges: model.edges.filter(
      (edge) =>
        !(
          (edge.source === currentParentId && ids.has(edge.target)) ||
          (edge.target === currentParentId && ids.has(edge.source))
        )
    )
  }
}

export function updateEdgeDataInModel(
  model: C4ModelData,
  edgeId: string,
  patch: { label?: string; method?: string }
): C4ModelData {
  let changed = false
  const edges = model.edges.map((edge) => {
    if (edge.id !== edgeId) {
      return edge
    }
    const currentData = edge.data ?? { label: '' }
    const data = { ...currentData }
    if (patch.label !== undefined) {
      data.label = patch.label
    }
    if (patch.method !== undefined) {
      if (patch.method.trim()) {
        data.method = patch.method.trim()
      } else {
        delete data.method
      }
    }
    changed = true
    return { ...edge, data }
  })
  return changed ? { ...model, edges } : model
}

function removeMembersFromOtherGroups(groups: Group[], memberIds: Set<string>): Group[] {
  return groups
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((memberId) => !memberIds.has(memberId))
    }))
    .filter((group) => group.memberIds.length > 0)
}

export function createGroupFromSelectedNodes(
  model: C4ModelData,
  group: Pick<Group, 'id' | 'name' | 'memberIds'>
): C4ModelData {
  const memberIds = [...new Set(group.memberIds)].filter((memberId) =>
    model.nodes.some((node) => node.id === memberId)
  )
  if (memberIds.length === 0) {
    return model
  }
  const memberSet = new Set(memberIds)
  return {
    ...model,
    groups: [
      ...removeMembersFromOtherGroups(model.groups ?? [], memberSet),
      {
        id: group.id,
        name: group.name.trim() || 'New group',
        memberIds
      }
    ]
  }
}

export function addMembersToGroupInModel(
  model: C4ModelData,
  groupId: string,
  memberIds: string[]
): C4ModelData {
  const existingGroup = (model.groups ?? []).find((group) => group.id === groupId)
  if (!existingGroup) {
    return model
  }
  const validMemberIds = memberIds.filter((memberId) =>
    model.nodes.some((node) => node.id === memberId)
  )
  if (validMemberIds.length === 0) {
    return model
  }
  const memberSet = new Set(validMemberIds)
  const cleanedGroups = removeMembersFromOtherGroups(
    (model.groups ?? []).filter((group) => group.id !== groupId),
    memberSet
  )
  return {
    ...model,
    groups: [
      ...cleanedGroups,
      {
        ...existingGroup,
        memberIds: [...new Set([...existingGroup.memberIds, ...validMemberIds])]
      }
    ]
  }
}

export function getNodeContextForModel(
  model: C4ModelData,
  nodeId: string | null
): ArchitectureNodeContext {
  if (!nodeId) {
    return {
      descendants: [],
      internalEdges: [],
      externalEdges: [],
      groups: [],
      sourceMap: {}
    }
  }

  const subtreeIds = collectDescendantIds(model.nodes, [nodeId])
  const descendants = model.nodes.filter((node) => subtreeIds.has(node.id) && node.id !== nodeId)
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
  const internalEdges: C4Edge[] = []
  const externalEdges: ExternalArchitectureEdge[] = []

  for (const edge of model.edges) {
    const sourceIn = subtreeIds.has(edge.source)
    const targetIn = subtreeIds.has(edge.target)
    if (sourceIn && targetIn) {
      internalEdges.push(edge)
      continue
    }
    if (!sourceIn && !targetIn) {
      continue
    }
    const externalNode = nodeById.get(sourceIn ? edge.target : edge.source)
    if (!externalNode) {
      continue
    }
    externalEdges.push({
      ...edge,
      externalNodeName: externalNode.data.name,
      externalNodeKind: externalNode.data.kind,
      direction: sourceIn ? 'out' : 'in'
    })
  }

  const sourceMap: NonNullable<C4ModelData['sourceMap']> = {}
  for (const [id, locations] of Object.entries(model.sourceMap ?? {})) {
    if (subtreeIds.has(id)) {
      sourceMap[id] = locations
    }
  }

  const groups = (model.groups ?? []).filter((group) =>
    group.memberIds.some((memberId) => subtreeIds.has(memberId))
  )

  return {
    descendants,
    internalEdges,
    externalEdges,
    groups,
    sourceMap
  }
}

function stripTransientNodeData(data: C4NodeData): C4NodeData {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.startsWith('_'))
  ) as C4NodeData
}

function nodeChanged(previous: C4Node, incoming: C4Node): boolean {
  return (
    previous.parentId !== incoming.parentId ||
    previous.type !== incoming.type ||
    JSON.stringify(stripTransientNodeData(previous.data)) !==
      JSON.stringify(stripTransientNodeData(incoming.data))
  )
}

function preserveUsefulRuntimeNodeState(previous: C4Node | undefined, incoming: C4Node): C4Node {
  if (!previous) {
    return incoming
  }
  if (incoming.data._needsLayout && !previous.data._needsLayout && previous.position) {
    const { _needsLayout: _unused, ...cleanData } = incoming.data
    void _unused
    return {
      ...incoming,
      position: previous.position,
      selected: previous.selected,
      measured: previous.measured,
      data: cleanData as C4NodeData
    }
  }
  return {
    ...incoming,
    selected: previous.selected,
    measured: previous.measured
  }
}

function pathToNodeParent(model: C4ModelData, parentId: string): string[] {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
  const path: string[] = []
  let current: string | undefined = parentId
  while (current) {
    path.unshift(current)
    current = nodeById.get(current)?.parentId
  }
  return path
}

function followPathForChangedParents(
  model: C4ModelData,
  changedParents: Map<string, number>,
  currentPath: string[],
  followExternalChanges: boolean
): string[] {
  if (!followExternalChanges || changedParents.size === 0) {
    return reconcileExpandedPath(model, currentPath)
  }

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
  let bestParentId = ''
  let bestDepth = Number.POSITIVE_INFINITY
  let bestCount = 0

  for (const [parentId, count] of changedParents) {
    if (!parentId) {
      continue
    }
    let depth = 0
    let current: string | undefined = parentId
    while (current) {
      depth++
      current = nodeById.get(current)?.parentId
    }
    if (depth < bestDepth || (depth === bestDepth && count > bestCount)) {
      bestParentId = parentId
      bestDepth = depth
      bestCount = count
    }
  }

  if (!bestParentId) {
    return reconcileExpandedPath(model, currentPath)
  }

  const bestParent = nodeById.get(bestParentId)
  if (bestParent?.data.kind === 'component' && bestParent.parentId) {
    bestParentId = bestParent.parentId
  }
  return reconcileExpandedPath(model, pathToNodeParent(model, bestParentId))
}

export function analyzeExternalModelUpdate({
  previous,
  incoming,
  expandedPath,
  followExternalChanges
}: {
  previous: C4ModelData
  incoming: C4ModelData
  expandedPath: string[]
  followExternalChanges: boolean
}): ExternalModelUpdateSummary {
  const previousById = new Map(previous.nodes.map((node) => [node.id, node]))
  const incomingById = new Map(incoming.nodes.map((node) => [node.id, node]))
  const changedNodeIds = new Set<string>()
  const nodeDiffs = new Map<string, C4NodeData>()
  const changedParents = new Map<string, number>()
  const bumpParent = (parentId: string | undefined) => {
    const key = parentId ?? ''
    changedParents.set(key, (changedParents.get(key) ?? 0) + 1)
  }

  for (const node of incoming.nodes) {
    const previousNode = previousById.get(node.id)
    if (!previousNode) {
      changedNodeIds.add(node.id)
      if (node.parentId) {
        changedNodeIds.add(node.parentId)
      }
      bumpParent(node.parentId)
      continue
    }
    if (nodeChanged(previousNode, node)) {
      changedNodeIds.add(node.id)
      if (node.parentId) {
        changedNodeIds.add(node.parentId)
      }
      nodeDiffs.set(node.id, stripTransientNodeData(previousNode.data))
      bumpParent(node.parentId)
    }
  }

  for (const previousNode of previous.nodes) {
    if (incomingById.has(previousNode.id)) {
      continue
    }
    if (previousNode.parentId) {
      changedNodeIds.add(previousNode.parentId)
    }
    bumpParent(previousNode.parentId)
  }

  const previousEdgeById = new Map(previous.edges.map((edge) => [edge.id, edge]))
  for (const edge of incoming.edges) {
    const previousEdge = previousEdgeById.get(edge.id)
    if (
      !previousEdge ||
      previousEdge.source !== edge.source ||
      previousEdge.target !== edge.target ||
      JSON.stringify(previousEdge.data ?? {}) !== JSON.stringify(edge.data ?? {})
    ) {
      changedNodeIds.add(edge.source)
      changedNodeIds.add(edge.target)
      bumpParent(incomingById.get(edge.source)?.parentId)
      bumpParent(incomingById.get(edge.target)?.parentId)
    }
  }
  const incomingEdgeIds = new Set(incoming.edges.map((edge) => edge.id))
  for (const previousEdge of previous.edges) {
    if (incomingEdgeIds.has(previousEdge.id)) {
      continue
    }
    changedNodeIds.add(previousEdge.source)
    changedNodeIds.add(previousEdge.target)
    bumpParent(previousById.get(previousEdge.source)?.parentId)
    bumpParent(previousById.get(previousEdge.target)?.parentId)
  }

  const model: C4ModelData = {
    ...incoming,
    nodes: incoming.nodes.map((node) =>
      preserveUsefulRuntimeNodeState(previousById.get(node.id), node)
    )
  }

  return {
    model,
    changedNodeIds,
    nodeDiffs,
    expandedPath: followPathForChangedParents(
      model,
      changedParents,
      expandedPath,
      followExternalChanges
    )
  }
}

export function getVisibleGroupBubbles(
  model: C4ModelData,
  visibleNodes: C4Node[]
): VisibleGroupBubble[] {
  const visibleById = new Map(visibleNodes.map((node) => [node.id, node]))
  const groups = model.groups ?? []
  const groupById = new Map(groups.map((group) => [group.id, group]))

  const depthForGroup = (groupId: string): number => {
    let depth = 0
    let current = groupById.get(groupId)?.parentGroupId
    while (current) {
      depth++
      current = groupById.get(current)?.parentGroupId
    }
    return depth
  }

  return groups.flatMap((group) => {
    const members = group.memberIds
      .map((memberId) => visibleById.get(memberId))
      .filter((node): node is C4Node => !!node)
    if (members.length === 0) {
      return []
    }
    const minX = Math.min(...members.map((node) => node.position?.x ?? 0))
    const minY = Math.min(...members.map((node) => node.position?.y ?? 0))
    const maxX = Math.max(...members.map((node) => (node.position?.x ?? 0) + NODE_W))
    const maxY = Math.max(...members.map((node) => (node.position?.y ?? 0) + NODE_H))
    const padding = 30 + depthForGroup(group.id) * 10
    return [
      {
        id: group.id,
        name: group.name,
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
        memberCount: members.length,
        depth: depthForGroup(group.id)
      }
    ]
  })
}

export function applyNodePositionChangesToModel(
  model: C4ModelData,
  changes: readonly NodePositionChangeLike[],
  refNodeIds: ReadonlySet<string>,
  currentParentId?: string
): C4ModelData | null {
  const positions = new Map<string, { x: number; y: number }>()
  const refPositions = new Map<string, { x: number; y: number }>()
  for (const change of changes) {
    if (change.type !== 'position' || !change.id) {
      continue
    }
    if (!change.position) {
      continue
    }
    const { x, y } = change.position
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }
    if (refNodeIds.has(change.id)) {
      if (currentParentId) {
        refPositions.set(`${currentParentId}/${change.id}`, { x, y })
      }
      continue
    }
    positions.set(change.id, { x, y })
  }

  if (positions.size === 0 && refPositions.size === 0) {
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

  let nextRefPositions = model.refPositions ?? {}
  if (refPositions.size > 0) {
    nextRefPositions = { ...nextRefPositions }
    for (const [key, position] of refPositions) {
      const current = nextRefPositions[key]
      if (!current || current.x !== position.x || current.y !== position.y) {
        nextRefPositions[key] = position
        changed = true
      }
    }
  }

  return changed ? { ...model, nodes, refPositions: nextRefPositions } : null
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
