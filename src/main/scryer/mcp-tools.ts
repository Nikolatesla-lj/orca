import type {
  C4ModelData,
  Flow,
  Group,
  ScryerToolCall,
  ScryerToolResult
} from '../../shared/scryer/model-types'
import { SCRYER_RULES } from '../../shared/scryer/rules'
import { addEdges, addNodes, setNode, updateEdges } from './mcp-legacy-write-tools'
import { setModel, writeModelAndBaseline } from './mcp-model-persistence'
import { normalizeSourceLocations } from './mcp-model-values'
import { validateMentionEdges, validateModelShape } from './mcp-model-validation'
import { updateNodes } from './mcp-node-write-tools'
import { computeDiff, getScopedNode } from './mcp-read-tools'
import {
  strictDeleteEdges,
  strictDeleteGroup,
  strictDeleteNodes,
  strictSetGroups,
  strictUpdateSourceMap
} from './mcp-strict-operation-adapters'
import { cleanupReferences, collectDescendantIds, stripPositions } from './mcp-model-support'
import { getTask } from './mcp-task-reader'
import { fail, isRecord, isStrictScryerModel, ok } from './mcp-tool-execution'
import {
  getProjectModelPath,
  readBaseline,
  readModel,
  setImplementing,
  writeBaseline
} from './model-store'
import { projectStructure } from './structure'

export async function callScryerTool(
  projectPath: string,
  call: ScryerToolCall
): Promise<ScryerToolResult> {
  switch (call.toolName) {
    case 'list_models': {
      await readModel(projectPath)
      return ok(`* ${getProjectModelPath(projectPath)} (project)`)
    }
    case 'set_model':
      return setModel(projectPath, call.arguments)
    case 'get_model': {
      const model = stripPositions(await readModel(projectPath))
      await writeBaseline(projectPath, model)
      return ok(JSON.stringify(model, null, 2), model)
    }
    case 'get_node': {
      const model = await readModel(projectPath)
      const nodeId = String(call.arguments.node_id ?? call.arguments.nodeId ?? '')
      const scoped = getScopedNode(model, nodeId)
      if (!scoped) {
        return fail(`Node '${nodeId}' not found`)
      }
      await writeBaseline(projectPath, model)
      return ok(JSON.stringify(scoped, null, 2), scoped)
    }
    case 'add_nodes':
      return addNodes(projectPath, call.arguments)
    case 'set_node':
      return setNode(projectPath, call.arguments)
    case 'update_nodes':
      return updateNodes(projectPath, call.arguments)
    case 'delete_nodes': {
      const nodeIds = (Array.isArray(call.arguments.node_ids) ? call.arguments.node_ids : []).map(
        String
      )
      if (await isStrictScryerModel(projectPath)) {
        return strictDeleteNodes(projectPath, nodeIds)
      }
      const ids = new Set(nodeIds)
      const model = await readModel(projectPath)
      const toDelete = new Set<string>()
      for (const id of ids) {
        for (const descendant of collectDescendantIds(model, id)) {
          toDelete.add(descendant)
        }
      }
      const before = model.nodes.length
      model.nodes = model.nodes.filter((node) => !toDelete.has(node.id))
      model.edges = model.edges.filter(
        (edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)
      )
      cleanupReferences(model, toDelete)
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted ${before - model.nodes.length} node(s)`, model)
    }
    case 'add_edges':
      return addEdges(projectPath, call.arguments)
    case 'update_edges':
      return updateEdges(projectPath, call.arguments)
    case 'delete_edges': {
      const edgeIds = (Array.isArray(call.arguments.edge_ids) ? call.arguments.edge_ids : []).map(
        String
      )
      if (await isStrictScryerModel(projectPath)) {
        return strictDeleteEdges(projectPath, edgeIds)
      }
      const ids = new Set(edgeIds)
      const model = await readModel(projectPath)
      const missing = [...ids].filter((id) => !model.edges.some((edge) => edge.id === id))
      if (missing.length > 0) {
        return fail(`Edge '${missing[0]}' not found`)
      }
      model.edges = model.edges.filter((edge) => !ids.has(edge.id))
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted ${ids.size} edge(s)`, model)
    }
    case 'update_source_map': {
      if (await isStrictScryerModel(projectPath)) {
        return strictUpdateSourceMap(projectPath, call.arguments)
      }
      const model = await readModel(projectPath)
      const sourceMap = { ...model.sourceMap }
      if (Array.isArray(call.arguments.entries)) {
        for (const entry of call.arguments.entries) {
          if (!isRecord(entry) || typeof entry.node_id !== 'string') {
            return fail('Each update_source_map entry requires node_id')
          }
          const exists =
            model.nodes.some((node) => node.id === entry.node_id) ||
            (model.flows ?? []).some((flow) => flow.id === entry.node_id)
          if (!exists) {
            return fail(`Node or flow '${entry.node_id}' not found`)
          }
          const locations = normalizeSourceLocations(entry.locations) ?? []
          if (locations.length === 0) {
            delete sourceMap[entry.node_id]
          } else {
            sourceMap[entry.node_id] = locations
          }
        }
      } else if (isRecord(call.arguments.sourceMap)) {
        Object.assign(sourceMap, call.arguments.sourceMap as C4ModelData['sourceMap'])
      } else {
        return fail('update_source_map requires entries')
      }
      model.sourceMap = sourceMap
      await writeModelAndBaseline(projectPath, model)
      return ok('Updated source map', model)
    }
    case 'set_flows': {
      if (await isStrictScryerModel(projectPath)) {
        return fail('set_flows is not supported for Scryer 0.3 Architecture models')
      }
      if (typeof call.arguments.data !== 'string') {
        return fail('set_flows requires data')
      }
      let parsed: Flow | Flow[]
      try {
        parsed = JSON.parse(call.arguments.data) as Flow | Flow[]
      } catch (error) {
        return fail(`Invalid flow JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      const flows = Array.isArray(parsed) ? parsed : [parsed]
      const model = await readModel(projectPath)
      const next = [...(model.flows ?? [])]
      for (const flow of flows) {
        const index = next.findIndex((candidate) => candidate.id === flow.id)
        if (index === -1) {
          next.push(flow)
        } else {
          next[index] = flow
        }
      }
      model.flows = next
      await writeModelAndBaseline(projectPath, model)
      return ok(`Set ${flows.length} flow(s)`, model)
    }
    case 'delete_flow': {
      if (await isStrictScryerModel(projectPath)) {
        return fail('delete_flow is not supported for Scryer 0.3 Architecture models')
      }
      const flowId = String(call.arguments.flow_id ?? '')
      const model = await readModel(projectPath)
      const before = (model.flows ?? []).length
      model.flows = (model.flows ?? []).filter((flow) => flow.id !== flowId)
      if (model.flows.length === before) {
        return fail(`Flow '${flowId}' not found`)
      }
      delete model.sourceMap?.[flowId]
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted flow '${flowId}'`, model)
    }
    case 'set_groups': {
      if (typeof call.arguments.data !== 'string') {
        return fail('set_groups requires data')
      }
      if (await isStrictScryerModel(projectPath)) {
        return strictSetGroups(projectPath, call.arguments.data)
      }
      let parsed: Group | Group[]
      try {
        parsed = JSON.parse(call.arguments.data) as Group | Group[]
      } catch (error) {
        return fail(`Invalid group JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      const groups = Array.isArray(parsed) ? parsed : [parsed]
      const model = await readModel(projectPath)
      const nodeIds = new Set(model.nodes.map((node) => node.id))
      for (const group of groups) {
        for (const memberId of group.memberIds) {
          if (!nodeIds.has(memberId)) {
            return fail(`Member '${memberId}' in group '${group.name}' not found in model`)
          }
        }
      }
      const next = [...(model.groups ?? [])]
      for (const group of groups) {
        const memberIds = new Set(group.memberIds)
        for (const existing of next) {
          if (existing.id !== group.id) {
            existing.memberIds = existing.memberIds.filter((id) => !memberIds.has(id))
          }
        }
        const index = next.findIndex((candidate) => candidate.id === group.id)
        if (index === -1) {
          next.push(group)
        } else {
          next[index] = group
        }
      }
      model.groups = next.filter((group) => group.memberIds.length > 0)
      await writeModelAndBaseline(projectPath, model)
      return ok(`Set ${groups.length} group(s)`, model)
    }
    case 'delete_group': {
      const groupId = String(call.arguments.group_id ?? '')
      if (await isStrictScryerModel(projectPath)) {
        return strictDeleteGroup(projectPath, groupId)
      }
      const model = await readModel(projectPath)
      const before = (model.groups ?? []).length
      model.groups = (model.groups ?? []).filter((group) => group.id !== groupId)
      if (model.groups.length === before) {
        return fail(`Group '${groupId}' not found`)
      }
      await writeModelAndBaseline(projectPath, model)
      return ok(`Deleted group '${groupId}'`, model)
    }
    case 'set_implementing': {
      await setImplementing(projectPath, call.arguments.active === true)
      return ok(
        call.arguments.active === true ? 'Drift detection suppressed' : 'Drift detection resumed'
      )
    }
    case 'get_rules':
      return ok(SCRYER_RULES)
    case 'validate_model': {
      const model = await readModel(projectPath)
      const errors = [...validateModelShape(model), ...validateMentionEdges(model)]
      return errors.length === 0 ? ok('Model is valid') : fail(errors.join('\n'))
    }
    case 'get_task':
      return getTask(projectPath, call.arguments)
    case 'get_changes': {
      const baseline = await readBaseline(projectPath)
      if (!baseline) {
        return fail('No baseline found. Call get_model first to establish a reference point.')
      }
      const model = await readModel(projectPath)
      return ok(computeDiff(baseline, model), { baseline, current: model })
    }
    case 'get_structure': {
      const path = String(call.arguments.path ?? projectPath)
      const tree = await projectStructure(path)
      return ok(tree, { tree })
    }
  }
}
