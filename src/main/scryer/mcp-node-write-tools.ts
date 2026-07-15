import type { C4Node, ScryerToolResult } from '../../shared/scryer/model-types'
import {
  asString,
  asStringArray,
  defaultScryerEngine,
  fail,
  isRecord,
  isStrictScryerModel,
  ok,
  readMcpCompatibleModel,
  scryerOperationContext
} from './mcp-tool-execution'
import {
  isStatus,
  normalizeContract,
  normalizeProperties,
  normalizeSourceLocations,
  normalizeSources,
  validateIdentifier,
  validatePropertyLabels,
  validateTypeName
} from './mcp-model-values'
import { validateModelShape } from './mcp-model-validation'
import { writeModelAndBaseline } from './mcp-model-persistence'
import { validateVerifiedGate } from './mcp-task-model'
import { readModel } from './model-store'

export async function updateNodes(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (!Array.isArray(args.nodes)) {
    return fail('update_nodes requires arguments.nodes')
  }
  if (await isStrictScryerModel(projectPath)) {
    return strictUpdateNodes(projectPath, args.nodes)
  }
  const model = await readModel(projectPath)
  const sourceMap = { ...model.sourceMap }
  const updated: string[] = []
  for (const update of args.nodes) {
    if (!isRecord(update) || typeof update.node_id !== 'string') {
      return fail('Each update_nodes item requires node_id')
    }
    const node = model.nodes.find((candidate) => candidate.id === update.node_id)
    if (!node) {
      return fail(`Node '${update.node_id}' not found`)
    }
    const nextContract = normalizeContract(update.contract)
    if (update.status !== undefined) {
      if (!isStatus(update.status)) {
        return fail(`Node '${update.node_id}' has invalid status '${String(update.status)}'`)
      }
      const reason = asString(update.reason)?.trim() ?? ''
      if (!reason) {
        return fail(`Node '${update.node_id}': reason is required when changing status`)
      }
      if (update.status === 'verified') {
        const unmet = validateVerifiedGate(model, node, nextContract)
        if (unmet.length > 0) {
          return fail(
            `Cannot set '${update.node_id}' to verified. These expect contract items are not yet passed:\n${unmet.join('\n')}`
          )
        }
      }
      node.data.status = update.status
      node.data.statusReason = reason
    }
    const nextName = asString(update.name)
    if (nextName !== undefined) {
      const identifierError =
        node.data.kind === 'operation'
          ? validateIdentifier(nextName, `operation '${node.id}'`)
          : null
      const typeError =
        node.data.kind === 'model' ? validateTypeName(nextName, `model '${node.id}'`) : null
      if (identifierError ?? typeError) {
        return fail((identifierError ?? typeError)!)
      }
      node.data.name = nextName
    }
    const nextDescription = asString(update.description)
    if (nextDescription !== undefined) {
      node.data.description = nextDescription
    }
    const nextTechnology = asString(update.technology)
    if (nextTechnology !== undefined) {
      node.data.technology = nextTechnology
    }
    if (typeof update.external === 'boolean') {
      node.data.external = update.external
    }
    const nextShape = asString(update.shape)
    if (nextShape !== undefined) {
      node.data.shape = nextShape as C4Node['data']['shape']
    }
    const sources = normalizeSources(update.sources)
    if (sources !== undefined) {
      node.data.sources = sources
    }
    if (nextContract !== undefined) {
      node.data.contract = nextContract
    }
    const notes = asStringArray(update.notes)
    if (notes !== undefined) {
      node.data.notes = notes
    }
    const properties = normalizeProperties(update.properties)
    if (properties !== undefined) {
      const error = validatePropertyLabels(properties, `node '${update.node_id}'`)
      if (error) {
        return fail(error)
      }
      node.data.properties = properties
    }
    const locations = normalizeSourceLocations(update.source)
    if (locations !== undefined) {
      if (locations.length === 0) {
        delete sourceMap[node.id]
      } else {
        sourceMap[node.id] = locations
      }
    }
    updated.push(update.node_id)
  }
  model.sourceMap = sourceMap
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Updated ${updated.length} node(s)`, model)
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
