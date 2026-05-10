import type {
  C4Edge,
  C4Kind,
  C4ModelData,
  C4Node,
  C4NodeData,
  Contract,
  ContractItem,
  Flow,
  FlowStep,
  FlowTransition,
  Group,
  Status
} from './model-types'

const VALID_STATUSES = new Set<Status>(['proposed', 'implemented', 'verified', 'vagrant'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isContractItem(value: unknown): value is ContractItem {
  return typeof value === 'string' || (isRecord(value) && typeof value.text === 'string')
}

function migrateContract(raw: unknown): Contract {
  const empty: Contract = { expect: [], ask: [], never: [] }
  if (!isRecord(raw)) {
    return empty
  }
  const migrate = (value: unknown): ContractItem[] => {
    if (Array.isArray(value)) {
      return value.filter(isContractItem)
    }
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    }
    return []
  }
  return {
    expect: migrate(raw.expect ?? raw.always),
    ask: migrate(raw.ask),
    never: migrate(raw.never)
  }
}

function migrateFlowTransitions(steps: FlowStep[], transitions: FlowTransition[]): FlowStep[] {
  if (transitions.length === 0) {
    return steps
  }
  const stepIds = new Set(steps.map((step) => step.id))
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const step of steps) {
    adjacency.set(step.id, [])
    inDegree.set(step.id, 0)
  }
  for (const transition of transitions) {
    if (stepIds.has(transition.source) && stepIds.has(transition.target)) {
      adjacency.get(transition.source)?.push(transition.target)
      inDegree.set(transition.target, (inDegree.get(transition.target) ?? 0) + 1)
    }
  }
  const queue = steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((step) => step.id)
  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, nextDegree)
      if (nextDegree === 0) {
        queue.push(next)
      }
    }
  }
  for (const step of steps) {
    if (!sorted.includes(step.id)) {
      sorted.push(step.id)
    }
  }
  const stepById = new Map(steps.map((step) => [step.id, step]))
  return sorted.map((id) => {
    const { position: _position, ...step } = stepById.get(id)! as FlowStep & { position?: unknown }
    return step
  })
}

function nodeTypeForKind(kind: string): C4Node['type'] {
  if (kind === 'operation' || kind === 'process' || kind === 'model') {
    return kind
  }
  return 'c4'
}

function normalizeNode(rawNode: unknown): C4Node {
  const node = isRecord(rawNode) ? rawNode : {}
  const rawData = isRecord(node.data) ? node.data : {}
  const kind = typeof rawData.kind === 'string' ? rawData.kind : 'system'
  const rawContract = rawData.contract ?? rawData.guidelines
  const contract = rawContract ? migrateContract(rawContract) : undefined
  const rawNotes = rawData.notes
  const notes =
    typeof rawNotes === 'string'
      ? rawNotes.split('\n').filter(Boolean)
      : Array.isArray(rawNotes) && rawNotes.length > 0
        ? rawNotes.filter((item): item is string => typeof item === 'string')
        : undefined
  const hasPosition = isRecord(node.position)
  const status =
    typeof rawData.status === 'string' && VALID_STATUSES.has(rawData.status as Status)
      ? (rawData.status as Status)
      : undefined
  const stripStatus = kind === 'person' || (kind === 'system' && rawData.external === true)
  const data: C4NodeData = {
    ...(rawData as Partial<C4NodeData>),
    name: typeof rawData.name === 'string' ? rawData.name : String(node.id ?? 'Unnamed'),
    description: typeof rawData.description === 'string' ? rawData.description : '',
    kind: kind as C4Kind,
    contract,
    sources: (rawData.sources ?? rawData.references) as C4NodeData['sources'],
    notes,
    status: stripStatus ? undefined : status,
    guidelines: undefined,
    references: undefined,
    ...(!hasPosition ? { _needsLayout: true } : {})
  }

  return {
    ...(node as Partial<C4Node>),
    id: typeof node.id === 'string' ? node.id : globalThis.crypto.randomUUID(),
    type: nodeTypeForKind(kind),
    position: hasPosition ? (node.position as { x: number; y: number }) : { x: 0, y: 0 },
    data
  }
}

export function parseModelData(raw: string): C4ModelData {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid Scryer model JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const root = isRecord(data) ? data : {}
  const nodes = Array.isArray(root.nodes) ? root.nodes.map(normalizeNode) : []
  const seenEdgeIds = new Set<string>()
  const edges = (Array.isArray(root.edges) ? root.edges : []).filter((edge): edge is C4Edge => {
    if (!isRecord(edge) || typeof edge.id !== 'string') {
      return false
    }
    if (seenEdgeIds.has(edge.id)) {
      return false
    }
    seenEdgeIds.add(edge.id)
    return true
  })
  const flows = (
    Array.isArray(root.flows) ? root.flows : Array.isArray(root.scenarios) ? root.scenarios : []
  ).map((flow): Flow => {
    const record = isRecord(flow) ? flow : {}
    const steps = Array.isArray(record.steps) ? (record.steps as FlowStep[]) : []
    const transitions = Array.isArray(record.transitions)
      ? (record.transitions as FlowTransition[])
      : []
    return {
      ...(record as Partial<Flow>),
      id: typeof record.id === 'string' ? record.id : globalThis.crypto.randomUUID(),
      name: typeof record.name === 'string' ? record.name : 'Flow',
      steps: migrateFlowTransitions(steps, transitions),
      transitions: undefined
    }
  })

  return {
    nodes,
    edges,
    startingLevel:
      root.startingLevel === 'container' || root.startingLevel === 'component'
        ? root.startingLevel
        : 'system',
    sourceMap: isRecord(root.sourceMap) ? (root.sourceMap as C4ModelData['sourceMap']) : {},
    projectPath: typeof root.projectPath === 'string' ? root.projectPath : undefined,
    refPositions: isRecord(root.refPositions)
      ? (root.refPositions as C4ModelData['refPositions'])
      : {},
    groups: (Array.isArray(root.groups) ? root.groups : []).map((group) => {
      const { kind: _kind, ...rest } = isRecord(group) ? group : {}
      return rest as unknown as Group
    }),
    flows
  }
}

export function serializeModelData(model: C4ModelData): string {
  return JSON.stringify(model, null, 2)
}
