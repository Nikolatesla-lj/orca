import type {
  C4Kind,
  C4ModelData,
  C4Node,
  Contract,
  ContractItem,
  Group,
  Status
} from '../../shared/scryer/model-types'

export function stripPositions(model: C4ModelData): C4ModelData {
  return {
    ...model,
    nodes: model.nodes.map(
      ({ position: _position, selected: _selected, measured: _measured, ...node }) => node
    )
  }
}

export function stripNodeForAgent(
  node: C4Node
): Omit<C4Node, 'position' | 'selected' | 'measured'> {
  const { position: _position, selected: _selected, measured: _measured, ...rest } = node
  return rest
}

export function nextNodeId(model: C4ModelData): string {
  let max = 0
  for (const node of model.nodes) {
    const match = /^node-(\d+)$/.exec(node.id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `node-${max + 1}`
}

export function ancestorChain(model: C4ModelData, node: C4Node): C4Node[] {
  const chain: C4Node[] = []
  let current = node
  while (current.parentId) {
    const parent = model.nodes.find((candidate) => candidate.id === current.parentId)
    if (!parent) {
      break
    }
    chain.unshift(parent)
    current = parent
  }
  return chain
}

export function validateVerifiedGate(
  model: C4ModelData,
  node: C4Node,
  nextContract?: Contract
): string[] {
  const chain = ancestorChain(model, node)
  return [
    ...chain,
    { ...node, data: { ...node.data, contract: nextContract ?? node.data.contract } }
  ]
    .flatMap((item) => item.data.contract?.expect ?? [])
    .filter((item) => typeof item !== 'object' || item.passed !== true)
    .map((item) => `- ${typeof item === 'string' ? item : item.text}`)
}

export function mergeContract(chain: C4Node[], node: C4Node): Contract {
  const merged: Contract = { expect: [], ask: [], never: [] }
  for (const item of [...chain, node]) {
    const contract = item.data.contract
    if (!contract) {
      continue
    }
    merged.expect.push(...contract.expect)
    merged.ask.push(...contract.ask)
    merged.never.push(...contract.never)
  }
  return merged
}

export function collectNotes(chain: C4Node[], node: C4Node): string[] {
  const notes: string[] = []
  for (const ancestor of chain) {
    for (const note of ancestor.data.notes ?? []) {
      notes.push(`${ancestor.data.name}: ${note}`)
    }
  }
  notes.push(...(node.data.notes ?? []))
  return notes
}

export function hasStatusChildren(model: C4ModelData, node: C4Node): boolean {
  return model.nodes.some(
    (candidate) =>
      candidate.parentId === node.id &&
      candidate.data.status !== undefined &&
      ((node.data.kind === 'container' && candidate.data.kind === 'component') ||
        (node.data.kind === 'system' && candidate.data.kind === 'container'))
  )
}

export function childrenAllDone(model: C4ModelData, node: C4Node): boolean {
  const childKind =
    node.data.kind === 'container' ? 'component' : node.data.kind === 'system' ? 'container' : null
  if (!childKind) {
    return true
  }
  return model.nodes
    .filter(
      (candidate) =>
        candidate.parentId === node.id && candidate.data.kind === childKind && candidate.data.status
    )
    .every((candidate) => ['implemented', 'verified', 'vagrant'].includes(candidate.data.status!))
}

export function isSatisfied(model: C4ModelData, node: C4Node): boolean {
  if (node.data.external) {
    return true
  }
  if (hasStatusChildren(model, node)) {
    return childrenAllDone(model, node)
  }
  return (
    node.data.status === undefined ||
    ['implemented', 'verified', 'vagrant'].includes(node.data.status)
  )
}

function contractItemText(item: ContractItem): string {
  return typeof item === 'string' ? item : item.text
}

export function contractIsEmpty(contract?: Contract): boolean {
  return (
    !contract ||
    (contract.expect.length === 0 && contract.ask.length === 0 && contract.never.length === 0)
  )
}

export function formatContractBlock(contract: Contract, indent = ''): string {
  const lines: string[] = []
  if (contract.expect.length > 0) {
    lines.push(
      `${indent}MUST:`,
      ...contract.expect.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  if (contract.ask.length > 0) {
    lines.push(
      `${indent}ASK USER FIRST:`,
      ...contract.ask.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  if (contract.never.length > 0) {
    lines.push(
      `${indent}NEVER:`,
      ...contract.never.map((item) => `${indent}  - ${contractItemText(item)}`)
    )
  }
  return lines.join('\n')
}

export function statusStr(status?: Status): string {
  return status ?? 'none'
}

export function kindStr(kind: C4Kind): string {
  return kind
}

export function groupMemberIds(group: Group): string[] {
  const legacy = group as Group & { member_ids?: string[] }
  return Array.isArray(group.memberIds) ? group.memberIds : (legacy.member_ids ?? [])
}

export function formatContractAndNotes(title: string, contract: Contract, notes: string[]): string {
  const lines: string[] = []
  if (!contractIsEmpty(contract)) {
    lines.push(`\n${title} Contract (MUST follow):`, formatContractBlock(contract, '  '))
  }
  if (notes.length > 0) {
    lines.push(`\n${title} Notes:`, ...notes.map((note) => `  - ${note}`))
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}

export function findNextName(
  blockedNodes: C4Node[],
  readyNodes: C4Node[],
  currentWorkUnit: C4Node[]
): string | null {
  const current = new Set(currentWorkUnit.map((node) => node.id))
  const nextReady = readyNodes.find((node) => !current.has(node.id))
  if (nextReady) {
    return nextReady.data.name
  }
  return blockedNodes[0]?.data.name ?? null
}

export function collectDescendantIds(model: C4ModelData, nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of model.nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

export function cleanupReferences(model: C4ModelData, deletedIds: Set<string>): void {
  for (const id of deletedIds) {
    delete model.sourceMap?.[id]
  }
  model.groups = (model.groups ?? [])
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => !deletedIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0)
}
