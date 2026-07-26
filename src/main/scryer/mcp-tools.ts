import type { ScryerToolCall, ScryerToolResult } from '../../shared/scryer/model-types'
import { SCRYER_RULES } from '../../shared/scryer/rules'
import { setModel } from './mcp-model-persistence'
import { validateMentionEdges } from './mcp-model-validation'
import { updateNodes } from './mcp-node-write-tools'
import { computeDiff, getScopedNode } from './mcp-read-tools'
import {
  strictAddEdges,
  strictDeleteEdges,
  strictDeleteGroup,
  strictDeleteNodes,
  strictSetGroups,
  strictUpdateEdges,
  strictUpdateSourceMap
} from './mcp-strict-operation-adapters'
import { stripPositions } from './mcp-model-support'
import { getTask } from './mcp-task-reader'
import {
  defaultScryerEngine,
  fail,
  ok,
  readMcpCompatibleModel,
  scryerOperationContext
} from './mcp-tool-execution'
import { getProjectModelPath, readBaseline, setImplementing, writeBaseline } from './model-store'
import { projectStructure } from './structure'

type ValidationFinding = { severity: 'info' | 'warning' | 'error'; code: string; message: string }

export async function callScryerTool(
  projectPath: string,
  call: ScryerToolCall
): Promise<ScryerToolResult> {
  switch (call.toolName) {
    case 'list_models':
      // The strict project model is always the single project-scoped Scryer model.
      return ok(`* ${getProjectModelPath(projectPath)} (project)`)
    case 'set_model':
      return setModel(projectPath, call.arguments)
    case 'get_model': {
      const model = stripPositions(await readMcpCompatibleModel(projectPath))
      await writeBaseline(projectPath, model)
      return ok(JSON.stringify(model, null, 2), model)
    }
    case 'get_node': {
      const model = await readMcpCompatibleModel(projectPath)
      const nodeId = String(call.arguments.node_id ?? call.arguments.nodeId ?? '')
      const scoped = getScopedNode(model, nodeId)
      if (!scoped) {
        return fail(`Node '${nodeId}' not found`)
      }
      await writeBaseline(projectPath, model)
      return ok(JSON.stringify(scoped, null, 2), scoped)
    }
    // Retired legacy 0.3 aliases: authoring goes through the intent add/update
    // operations, not raw node/flow mutation through the compatibility bridge.
    case 'add_nodes':
      return fail('add_nodes is not supported for Scryer 0.3 models; use intent add operations')
    case 'set_node':
      return fail(
        'set_node is not supported for Scryer 0.3 models through the compatibility bridge'
      )
    case 'set_flows':
      return fail('set_flows is not supported for Scryer 0.3 Architecture models')
    case 'delete_flow':
      return fail('delete_flow is not supported for Scryer 0.3 Architecture models')
    case 'update_nodes':
      return updateNodes(projectPath, call.arguments)
    case 'delete_nodes': {
      const nodeIds = (Array.isArray(call.arguments.node_ids) ? call.arguments.node_ids : []).map(
        String
      )
      return strictDeleteNodes(projectPath, nodeIds)
    }
    case 'add_edges': {
      if (!Array.isArray(call.arguments.edges)) {
        return fail('add_edges requires arguments.edges')
      }
      return strictAddEdges(projectPath, call.arguments.edges)
    }
    case 'update_edges': {
      if (!Array.isArray(call.arguments.edges)) {
        return fail('update_edges requires arguments.edges')
      }
      return strictUpdateEdges(projectPath, call.arguments.edges)
    }
    case 'delete_edges': {
      const edgeIds = (Array.isArray(call.arguments.edge_ids) ? call.arguments.edge_ids : []).map(
        String
      )
      return strictDeleteEdges(projectPath, edgeIds)
    }
    case 'update_source_map':
      return strictUpdateSourceMap(projectPath, call.arguments)
    case 'set_groups': {
      if (typeof call.arguments.data !== 'string') {
        return fail('set_groups requires data')
      }
      return strictSetGroups(projectPath, call.arguments.data)
    }
    case 'delete_group':
      return strictDeleteGroup(projectPath, String(call.arguments.group_id ?? ''))
    case 'set_implementing': {
      await setImplementing(projectPath, call.arguments.active === true)
      return ok(
        call.arguments.active === true ? 'Drift detection suppressed' : 'Drift detection resumed'
      )
    }
    case 'get_rules':
      return ok(SCRYER_RULES)
    case 'validate_model':
      return validateModel(projectPath)
    case 'get_task':
      return getTask(projectPath, call.arguments)
    case 'get_changes': {
      const baseline = await readBaseline(projectPath)
      if (!baseline) {
        return fail('No baseline found. Call get_model first to establish a reference point.')
      }
      const model = await readMcpCompatibleModel(projectPath)
      return ok(computeDiff(baseline, model), { baseline, current: model })
    }
    case 'get_structure': {
      const path = String(call.arguments.path ?? projectPath)
      const tree = await projectStructure(path)
      return ok(tree, { tree })
    }
  }
}

// Why: validation is sourced from the cataloged Engine validate operation for structural
// findings, plus the MCP-only mention check (relationship hints in descriptions) that the
// engine validators do not cover. Any finding or mention issue fails validation.
async function validateModel(projectPath: string): Promise<ScryerToolResult> {
  const result = await defaultScryerEngine.executeOperation(
    'scryer.model.validate',
    { layer: 'plan' },
    scryerOperationContext(projectPath, `mcp-validate-${Date.now()}`)
  )
  if (!result.ok) {
    return fail(result.error.message, result.error)
  }
  const findings = (result.result as { findings?: ValidationFinding[] }).findings ?? []
  const model = await readMcpCompatibleModel(projectPath)
  const messages = [...findings.map((finding) => finding.message), ...validateMentionEdges(model)]
  return messages.length === 0 ? ok('Model is valid') : fail(messages.join('\n'))
}
