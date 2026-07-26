import type { ScryerToolResult } from '../../shared/scryer/model-types'
import { executeStrictScryerOperation, fail, isRecord } from './mcp-tool-execution'

export async function strictAddEdges(
  projectPath: string,
  edges: unknown[]
): Promise<ScryerToolResult> {
  return executeStrictScryerOperation(
    projectPath,
    'scryer.link.add',
    {
      links: edges.map((edge) => {
        if (!isRecord(edge)) {
          return {}
        }
        return {
          src: edge.source ?? edge.src,
          dst: edge.target ?? edge.dst,
          label: edge.label,
          ...(typeof edge.method === 'string' ? { method: edge.method } : {})
        }
      })
    },
    `Added ${edges.length} edge(s)`
  )
}

export async function strictUpdateEdges(
  projectPath: string,
  edges: unknown[]
): Promise<ScryerToolResult> {
  const unsupportedEndpointPatch = edges.find(
    (edge) => isRecord(edge) && (edge.source !== undefined || edge.target !== undefined)
  )
  if (unsupportedEndpointPatch) {
    return fail('update_edges cannot repoint Scryer 0.3 links; delete and add the link instead')
  }
  return executeStrictScryerOperation(
    projectPath,
    'scryer.link.update',
    {
      links: edges.map((edge) => {
        if (!isRecord(edge)) {
          return {}
        }
        const data = isRecord(edge.data) ? edge.data : {}
        return {
          link_id: edge.edge_id ?? edge.link_id ?? edge.id,
          ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
          ...(typeof data.label === 'string' ? { label: data.label } : {}),
          ...(typeof edge.method === 'string' ? { method: edge.method } : {}),
          ...(typeof data.method === 'string' ? { method: data.method } : {})
        }
      })
    },
    `Updated ${edges.length} edge(s)`
  )
}

export async function strictDeleteNodes(
  projectPath: string,
  nodeIds: string[]
): Promise<ScryerToolResult> {
  return executeStrictScryerOperation(
    projectPath,
    'scryer.node.delete',
    { node_ids: nodeIds },
    `Deleted ${nodeIds.length} node(s)`
  )
}

export async function strictDeleteEdges(
  projectPath: string,
  linkIds: string[]
): Promise<ScryerToolResult> {
  return executeStrictScryerOperation(
    projectPath,
    'scryer.link.delete',
    { link_ids: linkIds },
    `Deleted ${linkIds.length} edge(s)`
  )
}

export async function strictUpdateSourceMap(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (Array.isArray(args.entries)) {
    return executeStrictScryerOperation(
      projectPath,
      'scryer.source.update',
      { entries: args.entries },
      'Updated source map'
    )
  }
  if (isRecord(args.sourceMap)) {
    return executeStrictScryerOperation(
      projectPath,
      'scryer.source.update',
      {
        entries: Object.entries(args.sourceMap).map(([nodeId, locations]) => ({
          node_id: nodeId,
          locations
        }))
      },
      'Updated source map'
    )
  }
  return fail('update_source_map requires entries')
}

export async function strictSetGroups(
  projectPath: string,
  data: string
): Promise<ScryerToolResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch (error) {
    return fail(`Invalid group JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const groups = Array.isArray(parsed) ? parsed : [parsed]
  return executeStrictScryerOperation(
    projectPath,
    'scryer.group.set',
    { data: groups },
    `Set ${groups.length} group(s)`
  )
}

export async function strictDeleteGroup(
  projectPath: string,
  groupId: string
): Promise<ScryerToolResult> {
  return executeStrictScryerOperation(
    projectPath,
    'scryer.group.delete',
    { group_id: groupId },
    `Deleted group '${groupId}'`
  )
}
