import {
  asString,
  asStringArray,
  defaultScryerEngine,
  fail,
  isRecord,
  ok,
  readMcpCompatibleModel,
  scryerOperationContext
} from './mcp-tool-execution'
import type { ScryerToolResult } from '../../shared/scryer/model-types'
import {
  isStatus,
  normalizeContract,
  normalizeProperties,
  normalizeSourceLocations,
  normalizeSources,
  validatePropertyLabels
} from './mcp-model-values'
import { validateVerifiedGate } from './mcp-task-model'

// Why: update_nodes is strict-only. It translates the MCP patch into cataloged Engine
// operations (scryer.node.update + scryer.source.update) that write the planned layer.
// The verified-status gate is enforced here against the strict 0.3 model view.
export async function updateNodes(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.nodes)) {
    return fail('update_nodes requires arguments.nodes')
  }
  return strictUpdateNodes(projectPath, args.nodes)
}

async function strictUpdateNodes(
  projectPath: string,
  updates: unknown[]
): Promise<ScryerToolResult> {
  const nodePatches: Record<string, unknown>[] = []
  const sourceEntries: Record<string, unknown>[] = []
  const boundaries: Record<string, unknown>[] = []
  const compatibilityModel = await readMcpCompatibleModel(projectPath)

  for (const update of updates) {
    if (!isRecord(update) || typeof update.node_id !== 'string') {
      return fail('Each update_nodes item requires node_id')
    }
    const node = compatibilityModel.nodes.find((candidate) => candidate.id === update.node_id)
    const appearance: Record<string, unknown> = {}
    const nextContract = normalizeContract(update.contract)

    const patch: Record<string, unknown> = { node_id: update.node_id }
    if (update.status !== undefined) {
      if (!node) {
        return fail(`Node '${update.node_id}' not found`)
      }
      if (!isStatus(update.status)) {
        return fail(`Node '${update.node_id}' has invalid status '${String(update.status)}'`)
      }
      const reason = asString(update.reason)?.trim() ?? ''
      if (!reason) {
        return fail(`Node '${update.node_id}': reason is required when changing status`)
      }
      if (update.status === 'verified') {
        const unmet = validateVerifiedGate(compatibilityModel, node, nextContract)
        if (unmet.length > 0) {
          return fail(
            `Cannot set '${update.node_id}' to verified. These expect contract items are not yet passed:\n${unmet.join('\n')}`
          )
        }
      }
      appearance.status = update.status
      appearance.statusReason = reason
    }
    const nextName = asString(update.name)
    if (nextName !== undefined) {
      patch.name = nextName
    }
    const nextDescription = asString(update.description)
    if (nextDescription !== undefined) {
      patch.description = nextDescription
    }
    const nextTechnology = asString(update.technology)
    if (nextTechnology !== undefined) {
      patch.technology = nextTechnology
    }
    if (typeof update.external === 'boolean') {
      patch.external = update.external
    }
    const nextShape = asString(update.shape)
    if (nextShape !== undefined) {
      appearance.shape = nextShape
    }
    if (nextContract !== undefined) {
      appearance.contract = nextContract
    }
    const notes = asStringArray(update.notes)
    if (notes !== undefined) {
      patch.notes = notes.join('\n')
    }
    const properties = normalizeProperties(update.properties)
    if (properties !== undefined) {
      const error = validatePropertyLabels(properties, `node '${update.node_id}'`)
      if (error) {
        return fail(error)
      }
      patch.properties = properties
    }
    if (Object.keys(appearance).length > 0) {
      patch.appearance = appearance
    }
    if (Object.keys(patch).length > 1) {
      nodePatches.push(patch)
    }

    const locations = normalizeSourceLocations(update.source)
    if (locations !== undefined) {
      sourceEntries.push({ node_id: update.node_id, locations })
    }
    const sources = normalizeSources(update.sources)
    if (sources !== undefined) {
      boundaries.push({ node_id: update.node_id, sources })
    }
  }

  if (nodePatches.length > 0) {
    const nodeResult = await defaultScryerEngine.executeOperation(
      'scryer.node.update',
      { nodes: nodePatches },
      scryerOperationContext(projectPath, `mcp-node-update-${Date.now()}`)
    )
    if (!nodeResult.ok) {
      return fail(nodeResult.error.message, nodeResult.error)
    }
  }

  if (sourceEntries.length > 0 || boundaries.length > 0) {
    const sourceResult = await defaultScryerEngine.executeOperation(
      'scryer.source.update',
      {
        ...(sourceEntries.length > 0 ? { entries: sourceEntries } : {}),
        ...(boundaries.length > 0 ? { boundaries } : {})
      },
      scryerOperationContext(projectPath, `mcp-source-update-${Date.now()}`)
    )
    if (!sourceResult.ok) {
      return fail(sourceResult.error.message, sourceResult.error)
    }
  }

  return ok(`Updated ${updates.length} node(s)`)
}
