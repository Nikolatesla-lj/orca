import type { C4Node, ScryerToolResult } from '../../shared/scryer/model-types'
import { asString, ok, readMcpCompatibleModel } from './mcp-tool-execution'
import { renderBuildTask } from './mcp-task-build-renderer'
import { renderTaskScaffold } from './mcp-task-scaffold-renderer'
import {
  childrenAllDone,
  hasStatusChildren,
  isSatisfied,
  kindStr,
  statusStr
} from './mcp-task-model'

export async function getTask(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  const model = await readMcpCompatibleModel(projectPath)
  const scopeId = asString(args.node_id ?? args.nodeId)

  const isDescendantOf = (nodeId: string, ancestorId: string): boolean => {
    let current = model.nodes.find((node) => node.id === nodeId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true
      }
      current = model.nodes.find((node) => node.id === current?.parentId)
    }
    return false
  }

  const inScope = (node: C4Node): boolean =>
    !scopeId || node.id === scopeId || isDescendantOf(node.id, scopeId)

  const parentIsExternal = (node: C4Node): boolean => {
    const parent = node.parentId
      ? model.nodes.find((candidate) => candidate.id === node.parentId)
      : null
    return parent?.data.external === true
  }

  const taskNodes = model.nodes.filter((node) => {
    if (!['container', 'component'].includes(node.data.kind)) {
      return false
    }
    if (!node.data.status || node.data.status === 'vagrant') {
      return false
    }
    if (parentIsExternal(node)) {
      return false
    }
    if (node.data.kind === 'container' && hasStatusChildren(model, node)) {
      return false
    }
    return inScope(node)
  })

  if (taskNodes.length === 0) {
    return ok('All architecture tasks complete.')
  }

  const workNodes = taskNodes.filter((node) => !isSatisfied(model, node))

  if (workNodes.length === 0) {
    const completed = taskNodes.filter((node) => isSatisfied(model, node)).length
    const propagateNodes = model.nodes.filter((node) => {
      if (!['container', 'system'].includes(node.data.kind)) {
        return false
      }
      if (node.data.status === 'implemented' || node.data.status === 'verified') {
        return false
      }
      return hasStatusChildren(model, node) && childrenAllDone(model, node) && inScope(node)
    })

    if (propagateNodes.length === 0) {
      return ok('All architecture tasks complete.')
    }

    const pendingMembers = model.nodes.filter((node) => {
      if (!['operation', 'process', 'model'].includes(node.data.kind)) {
        return false
      }
      if (node.data.status !== 'proposed') {
        return false
      }
      const parent = node.parentId
        ? model.nodes.find((candidate) => candidate.id === node.parentId)
        : null
      return parent?.data.kind === 'component' && isSatisfied(model, parent)
    })

    const output = [
      `All ${completed} tasks complete.`,
      '',
      'Mark these parent nodes as implemented:',
      '```',
      `update_nodes(nodes: [${propagateNodes
        .map(
          (node) =>
            `{node_id: "${node.id}", status: "implemented", reason: "All child tasks are implemented", source: [{pattern: "src/module/**/*.ts"}]}`
        )
        .join(', ')}])`,
      '```',
      ...propagateNodes.map((node) => `- ${node.data.name}`),
      pendingMembers.length > 0
        ? [
            '',
            'These member nodes are still proposed — mark as implemented with a reason explaining what was built:',
            ...pendingMembers.map((member) => {
              const parent = model.nodes.find((node) => node.id === member.parentId)
              return `  - ${member.data.name} [${member.id}] (${kindStr(member.data.kind)}, ${statusStr(member.data.status)}) in ${parent?.data.name ?? 'unknown'}`
            })
          ].join('\n')
        : '',
      (model.flows ?? []).length > 0 ? 'Then call get_task again to validate flows.' : ''
    ]
      .filter(Boolean)
      .join('\n')

    return ok(output, propagateNodes)
  }

  const depsSatisfied = (node: C4Node): boolean => {
    if (node.data.kind !== 'component') {
      return true
    }
    for (const edge of model.edges) {
      if (edge.source !== node.id) {
        continue
      }
      const target = model.nodes.find((candidate) => candidate.id === edge.target)
      if (
        target?.data.kind === 'component' &&
        target.parentId === node.parentId &&
        !isSatisfied(model, target)
      ) {
        return false
      }
    }
    return true
  }

  const readyNodes: C4Node[] = []
  const blockedNodes: C4Node[] = []
  for (const node of workNodes) {
    if (depsSatisfied(node)) {
      readyNodes.push(node)
    } else {
      blockedNodes.push(node)
    }
  }

  if (readyNodes.length === 0 && blockedNodes.length > 0) {
    return ok(
      [
        'Dependency cycle detected. The following nodes all block each other:',
        '',
        ...blockedNodes.map((node) => `  - ${node.data.name} [${node.id}]`),
        '',
        'Fix the model by removing or redirecting edges to break the cycle.'
      ].join('\n'),
      blockedNodes
    )
  }

  const totalTasks = taskNodes.length
  const completedTasks = taskNodes.filter((node) => isSatisfied(model, node)).length
  const scaffold = renderTaskScaffold({
    model,
    scopeId,
    taskNodes,
    readyNodes,
    blockedNodes,
    completedTasks,
    totalTasks,
    isDescendantOf,
    parentIsExternal
  })
  if (scaffold) {
    return scaffold
  }
  return renderBuildTask({ model, readyNodes, blockedNodes, parentIsExternal })
}
