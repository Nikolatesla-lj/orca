import type { C4ModelData, C4Node, ScryerToolResult } from '../../shared/scryer/model-types'
import { TASK_INSTRUCTIONS } from '../../shared/scryer/rules'
import { ok } from './mcp-tool-execution'
import {
  ancestorChain,
  collectNotes,
  contractIsEmpty,
  findNextName,
  formatContractAndNotes,
  formatContractBlock,
  groupMemberIds,
  isSatisfied,
  mergeContract
} from './mcp-task-model'

export function renderTaskScaffold(args: {
  model: C4ModelData
  scopeId?: string
  taskNodes: C4Node[]
  readyNodes: C4Node[]
  blockedNodes: C4Node[]
  completedTasks: number
  totalTasks: number
  isDescendantOf(nodeId: string, ancestorId: string): boolean
  parentIsExternal(node: C4Node): boolean
}): ScryerToolResult | null {
  const {
    model,
    scopeId,
    readyNodes,
    blockedNodes,
    completedTasks,
    totalTasks,
    isDescendantOf,
    parentIsExternal
  } = args
  for (const group of model.groups ?? []) {
    const memberIds = groupMemberIds(group)
    const memberContainers = model.nodes.filter(
      (node) => node.data.kind === 'container' && memberIds.includes(node.id)
    )
    if (memberContainers.length === 0 || memberContainers.length !== memberIds.length) {
      continue
    }
    const scopedToGroup =
      !scopeId ||
      memberContainers.some(
        (node) =>
          node.id === scopeId ||
          isDescendantOf(scopeId, node.id) ||
          isDescendantOf(node.id, scopeId)
      )
    if (!scopedToGroup) {
      continue
    }
    if (!memberContainers.every((node) => node.data.status === 'proposed')) {
      continue
    }

    const lines = [
      '# Setup',
      '',
      `## Scaffold: ${group.name}`,
      '',
      group.description ?? '',
      'Set up the project structure for these containers:',
      '',
      ...memberContainers.flatMap((node) => [
        `- **${node.data.name}** [${node.id}]${node.data.technology ? ` — ${node.data.technology}` : ''}`,
        node.data.description ? `  ${node.data.description}` : ''
      ]),
      !contractIsEmpty(group.contract)
        ? `\n${group.name} — Group Contract (MUST follow):\n${formatContractBlock(group.contract!)}`
        : '',
      ...memberContainers.map((node) =>
        formatContractAndNotes(
          node.data.name,
          mergeContract(ancestorChain(model, node), node),
          collectNotes(ancestorChain(model, node), node)
        )
      ),
      '---',
      TASK_INSTRUCTIONS,
      '',
      'After scaffolding, mark these as implemented with a reason explaining what was scaffolded:',
      '```',
      `update_nodes(nodes: [${memberContainers
        .map(
          (node) =>
            `{node_id: "${node.id}", status: "implemented", reason: "Scaffolded shared runtime"}`
        )
        .join(', ')}])`,
      '```',
      '',
      `---\nProgress: ${completedTasks}/${totalTasks} tasks complete${
        findNextName(blockedNodes, readyNodes, memberContainers)
          ? ` | Next up: ${findNextName(blockedNodes, readyNodes, memberContainers)}`
          : ''
      }`
    ]
      .filter(Boolean)
      .join('\n')

    return ok(lines, memberContainers)
  }

  if (!scopeId) {
    const choosableContainers = model.nodes.filter((node) => {
      if (node.data.kind !== 'container' || !node.data.status || node.data.external) {
        return false
      }
      if (parentIsExternal(node)) {
        return false
      }
      const selfNeedsWork = !isSatisfied(model, node)
      const childrenNeedWork = model.nodes.some(
        (child) =>
          child.parentId === node.id &&
          child.data.status !== undefined &&
          !['implemented', 'verified', 'vagrant'].includes(child.data.status)
      )
      return selfNeedsWork || childrenNeedWork
    })

    if (choosableContainers.length > 1) {
      const lines = [
        `# Task ${completedTasks + 1} of ${totalTasks}`,
        '',
        '## Choose next task',
        '',
        'These containers are ready to build. Pick one and call get_task again with node_id set to that container id.',
        '',
        ...choosableContainers.map((node) => `- **${node.data.name}** [${node.id}]`)
      ]
      return ok(lines.join('\n'), choosableContainers)
    }
  }

  return null
}
