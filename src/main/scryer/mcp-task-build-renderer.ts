import type { C4Kind, C4ModelData, C4Node, ScryerToolResult } from '../../shared/scryer/model-types'
import { TASK_INSTRUCTIONS } from '../../shared/scryer/rules'
import { ok } from './mcp-tool-execution'
import {
  ancestorChain,
  collectNotes,
  contractIsEmpty,
  findNextName,
  formatContractBlock,
  hasStatusChildren,
  isSatisfied,
  kindStr,
  mergeContract,
  statusStr
} from './mcp-task-model'

export function renderBuildTask(args: {
  model: C4ModelData
  readyNodes: C4Node[]
  blockedNodes: C4Node[]
  parentIsExternal(node: C4Node): boolean
}): ScryerToolResult {
  const { model, readyNodes, blockedNodes, parentIsExternal } = args
  const readyContainers = readyNodes.filter((node) => node.data.kind === 'container')
  const readyComponents = readyNodes.filter((node) => node.data.kind === 'component')
  const workUnit =
    readyContainers.length > 0
      ? readyContainers
      : ((): C4Node[] => {
          const firstParent = readyComponents[0]?.parentId
          const siblings = readyComponents.filter((node) => node.parentId === firstParent)
          const siblingIds = new Set(siblings.map((node) => node.id))
          const hasInterDeps = model.edges.some(
            (edge) => siblingIds.has(edge.source) && siblingIds.has(edge.target)
          )
          if (!hasInterDeps) {
            return siblings
          }
          return siblings
            .filter(
              (node) =>
                !model.edges.some((edge) => edge.source === node.id && siblingIds.has(edge.target))
            )
            .slice(0, 1)
        })()

  if (workUnit.length === 0) {
    return ok('All tasks complete. Nothing to build.')
  }

  const globalTaskNodes = model.nodes.filter((node) => {
    if (!['container', 'component'].includes(node.data.kind) || !node.data.status) {
      return false
    }
    if (parentIsExternal(node)) {
      return false
    }
    return !(node.data.kind === 'container' && hasStatusChildren(model, node))
  })
  const globalCompleted = globalTaskNodes.filter((node) => isSatisfied(model, node)).length
  const taskNum = globalCompleted + 1
  const unitLabel =
    workUnit.length === 1
      ? `Build: ${workUnit[0]!.data.name}`
      : `Build: ${workUnit.map((node) => node.data.name).join(' + ')}`

  const lines = [
    `# Task ${taskNum} of ${globalTaskNodes.length}`,
    '',
    `## ${unitLabel}`,
    '',
    'Build ONLY what this task describes. Do not scaffold or set up other parts of the project.',
    ''
  ]

  for (const node of workUnit) {
    const chain = ancestorChain(model, node)
    const contract = mergeContract(chain, node)
    const notes = collectNotes(chain, node)
    if (workUnit.length > 1) {
      lines.push(`### ${node.data.name} [${node.id}]`)
    } else {
      lines.push(`[${node.id}]`)
    }
    if (node.data.description) {
      lines.push(node.data.description)
    }
    if (node.data.technology) {
      lines.push(`Technology: ${node.data.technology}`)
    }
    lines.push(`Status: ${statusStr(node.data.status)}`)
    if (!contractIsEmpty(contract)) {
      lines.push(
        '\nContract (you MUST follow these requirements):',
        formatContractBlock(contract, '  ')
      )
    }
    if (notes.length > 0) {
      lines.push('\nNotes:', ...notes.map((note) => `  - ${note}`))
    }

    const childKinds: [string, C4Kind][] = [
      ['Processes', 'process'],
      ['Models', 'model'],
      ['Operations', 'operation']
    ]
    for (const [label, kind] of childKinds) {
      const children = model.nodes.filter(
        (child) => child.parentId === node.id && child.data.kind === kind
      )
      if (children.length === 0) {
        continue
      }
      lines.push(`\n${label}:`)
      for (const child of children) {
        lines.push(`  - ${child.data.name} [${child.id}] (${statusStr(child.data.status)})`)
        if (child.data.description) {
          lines.push(`    ${child.data.description}`)
        }
        if (kind === 'model') {
          for (const property of child.data.properties ?? []) {
            lines.push(
              `    .${property.label}${property.description ? ` — ${property.description}` : ''}`
            )
          }
        }
      }
    }

    if ((node.data.sources ?? []).length > 0) {
      lines.push(
        '\nSources:',
        ...(node.data.sources ?? []).map((source) => `  - ${source.pattern} — ${source.comment}`)
      )
    }

    const dependencies = model.edges
      .map((edge) => {
        if (edge.source === node.id) {
          const target = model.nodes.find((candidate) => candidate.id === edge.target)
          return target
            ? `  -> ${target.data.name} "${edge.data?.label ?? ''}" (${kindStr(target.data.kind)})`
            : null
        }
        if (edge.target === node.id) {
          const source = model.nodes.find((candidate) => candidate.id === edge.source)
          return source
            ? `  <- ${source.data.name} "${edge.data?.label ?? ''}" (${kindStr(source.data.kind)})`
            : null
        }
        return null
      })
      .filter((item): item is string => item !== null)
    if (dependencies.length > 0) {
      lines.push('\nDependencies:', ...dependencies)
    }
    lines.push('')
  }

  lines.push('---', TASK_INSTRUCTIONS, '')
  lines.push('After building, mark as implemented with a reason and set source locations:')
  lines.push('```')
  lines.push(
    `update_nodes(nodes: [${workUnit
      .map(
        (node) =>
          `{node_id: "${node.id}", status: "implemented", reason: "Built ${node.data.name}", source: [{pattern: "src/module/file.ts", line: 1, endLine: 50}]}`
      )
      .join(', ')}])`
  )
  lines.push('```')

  const pendingMembers = workUnit.flatMap((node) =>
    node.data.kind === 'component'
      ? model.nodes
          .filter(
            (child) =>
              child.parentId === node.id &&
              ['operation', 'process', 'model'].includes(child.data.kind) &&
              child.data.status === 'proposed'
          )
          .map((child) => ({ child, parentName: node.data.name }))
      : []
  )
  if (pendingMembers.length > 0) {
    lines.push(
      '\nAlso mark these member nodes as implemented with a reason explaining what was built:'
    )
    for (const { child, parentName } of pendingMembers) {
      lines.push(
        `  - ${child.data.name} [${child.id}] (${kindStr(child.data.kind)}, ${statusStr(child.data.status)}) in ${parentName}`
      )
    }
  }

  const nextName = findNextName(blockedNodes, readyNodes, workUnit)
  lines.push(
    `\n---\nProgress: ${globalCompleted}/${globalTaskNodes.length} tasks complete${
      nextName ? ` | Next up: ${nextName}` : ''
    }`
  )

  return ok(lines.join('\n'), workUnit)
}
