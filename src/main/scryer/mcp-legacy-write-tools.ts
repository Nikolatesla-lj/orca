import type { C4Edge, C4Node, ScryerToolResult } from '../../shared/scryer/model-types'
import {
  asString,
  asStringArray,
  fail,
  isRecord,
  isStrictScryerModel,
  ok
} from './mcp-tool-execution'
import {
  isKind,
  isStatus,
  makeEdgeId,
  nodeTypeForKind,
  normalizeContract,
  normalizeProperties,
  normalizeSources
} from './mcp-model-values'
import { validateModelShape, validateParent } from './mcp-model-validation'
import { readModel } from './model-store'
import { cleanupReferences, collectDescendantIds, nextNodeId } from './mcp-model-support'
import { writeModelAndBaseline } from './mcp-model-persistence'
import { strictAddEdges, strictUpdateEdges } from './mcp-strict-operation-adapters'

export async function addNodes(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.nodes)) {
    return fail('add_nodes requires arguments.nodes')
  }
  if (await isStrictScryerModel(projectPath)) {
    return fail('add_nodes is not supported for Scryer 0.3 models; use intent add operations')
  }
  const model = await readModel(projectPath)
  const added: string[] = []
  for (const item of args.nodes) {
    if (!isRecord(item) || typeof item.name !== 'string' || !isKind(item.kind)) {
      return fail('Each add_nodes item requires name and valid kind')
    }
    const kind = item.kind
    const status = isStatus(item.status) && kind !== 'person' ? item.status : undefined
    const node: C4Node = {
      id: nextNodeId(model),
      type: nodeTypeForKind(kind),
      parentId: asString(item.parent_id ?? item.parentId),
      data: {
        name: item.name,
        description: asString(item.description) ?? '',
        kind,
        technology: asString(item.technology),
        external: typeof item.external === 'boolean' ? item.external : undefined,
        shape: asString(item.shape) as C4Node['data']['shape'],
        sources: normalizeSources(item.sources),
        status,
        contract: normalizeContract(item.contract),
        notes: asStringArray(item.notes),
        properties: normalizeProperties(item.properties)
      }
    }
    const parentError = validateParent({ ...model, nodes: [...model.nodes, node] }, node)
    if (parentError) {
      return fail(parentError)
    }
    model.nodes.push(node)
    added.push(node.id)
  }
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Added ${added.length} node(s): ${added.join(', ')}`, model)
}

export async function setNode(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  const nodeId = asString(args.node_id ?? args.nodeId)
  if (!nodeId || typeof args.data !== 'string') {
    return fail('set_node requires node_id and JSON string data')
  }
  if (await isStrictScryerModel(projectPath)) {
    return fail('set_node is not supported for Scryer 0.3 models through the compatibility bridge')
  }
  const model = await readModel(projectPath)
  if (!model.nodes.some((node) => node.id === nodeId)) {
    return fail(`Node '${nodeId}' not found`)
  }
  let subtree: { nodes: C4Node[]; edges: C4Edge[] }
  try {
    const parsed = JSON.parse(args.data) as Partial<{ nodes: C4Node[]; edges: C4Edge[] }>
    subtree = { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch (error) {
    return fail(`Invalid subtree JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const oldDescendants = collectDescendantIds(model, nodeId)
  oldDescendants.delete(nodeId)
  model.nodes = model.nodes.filter((node) => !oldDescendants.has(node.id))
  model.edges = model.edges.filter(
    (edge) => !oldDescendants.has(edge.source) && !oldDescendants.has(edge.target)
  )
  cleanupReferences(model, oldDescendants)

  const incomingIds = new Set(subtree.nodes.map((node) => node.id))
  for (const node of subtree.nodes) {
    if (!node.parentId || (node.parentId !== nodeId && !incomingIds.has(node.parentId))) {
      return fail(`Node '${node.id}' must be a descendant of '${nodeId}'`)
    }
    node.type = nodeTypeForKind(node.data.kind)
    delete node.position
  }
  model.nodes.push(...subtree.nodes)
  model.edges.push(...subtree.edges)
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(
    `Set ${subtree.nodes.length} descendant node(s) and ${subtree.edges.length} edge(s) under '${nodeId}'`,
    model
  )
}

export async function addEdges(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.edges)) {
    return fail('add_edges requires arguments.edges')
  }
  if (await isStrictScryerModel(projectPath)) {
    return strictAddEdges(projectPath, args.edges)
  }
  const model = await readModel(projectPath)
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  const added: string[] = []
  for (const item of args.edges) {
    if (
      !isRecord(item) ||
      typeof item.source !== 'string' ||
      typeof item.target !== 'string' ||
      typeof item.label !== 'string'
    ) {
      return fail('Each add_edges item requires source, target, and label')
    }
    if (!nodeIds.has(item.source)) {
      return fail(`Source node '${item.source}' not found`)
    }
    if (!nodeIds.has(item.target)) {
      return fail(`Target node '${item.target}' not found`)
    }
    if (item.label.length > 30) {
      return fail(`Edge label '${item.label}' exceeds 30 character limit`)
    }
    const id = makeEdgeId(item.source, item.target)
    if (model.edges.some((edge) => edge.id === id)) {
      return fail(`Edge from '${item.source}' to '${item.target}' already exists`)
    }
    model.edges.push({
      id,
      source: item.source,
      target: item.target,
      data: {
        label: item.label,
        ...(typeof item.method === 'string' ? { method: item.method } : {})
      }
    })
    added.push(id)
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Added ${added.length} edge(s)`, model)
}

export async function updateEdges(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.edges)) {
    return fail('update_edges requires arguments.edges')
  }
  if (await isStrictScryerModel(projectPath)) {
    return strictUpdateEdges(projectPath, args.edges)
  }
  const model = await readModel(projectPath)
  const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]))
  for (const input of args.edges) {
    if (!isRecord(input)) {
      return fail('Each update_edges item must be an object')
    }
    const edgeId = asString(input.edge_id ?? input.id)
    if (!edgeId) {
      return fail('Each update_edges item requires edge_id')
    }
    const existing = edgeById.get(edgeId)
    if (input.edge_id && !existing) {
      return fail(`Edge '${edgeId}' not found`)
    }
    const edge: C4Edge = existing
      ? { ...existing, data: { ...(existing.data ?? { label: '' }) } }
      : {
          id: edgeId,
          source: asString(input.source) ?? '',
          target: asString(input.target) ?? '',
          data: { label: '' }
        }
    if (typeof input.label === 'string') {
      edge.data = { ...(edge.data ?? { label: '' }), label: input.label }
    }
    if (typeof input.method === 'string') {
      edge.data = { ...(edge.data ?? { label: '' }), method: input.method }
    }
    if (isRecord(input.data)) {
      edge.data = input.data as C4Edge['data']
    }
    if (typeof input.source === 'string') {
      edge.source = input.source
    }
    if (typeof input.target === 'string') {
      edge.target = input.target
    }
    edgeById.set(edge.id, edge)
  }
  model.edges = [...edgeById.values()]
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Updated ${args.edges.length} edge(s)`, model)
}
