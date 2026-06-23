import type {
  ScryGroup,
  ScryModel,
  ScryNode,
  ScryResponsibility,
  ScrySchemaProperty
} from '../model'
import type {
  FoldedItem,
  ScryerPlanFoldInput,
  ScryerPlanFoldResult,
  ScryerProjectRef
} from '../types'
import { diffModels } from '../diff'
import { ScryerEngineError } from '../pipeline'
import type { ScryerStateStore } from '../state-store'
import { validateModelStructure } from '../validators'

function findResponsibility(
  model: ScryModel,
  id: string
): { ownerId: string; responsibility: ScryResponsibility } | null {
  for (const node of model.nodes) {
    const responsibility = node.responsibilities?.find((item) => item.id === id)
    if (responsibility) {
      return { ownerId: node.id, responsibility }
    }
  }
  for (const group of model.groups) {
    const responsibility = group.responsibilities?.find((item) => item.id === id)
    if (responsibility) {
      return { ownerId: group.id, responsibility }
    }
  }
  return null
}

function responsibilityHosts(model: ScryModel): (ScryNode | ScryGroup)[] {
  return [...model.nodes, ...model.groups]
}

function foldResponsibility(committed: ScryModel, planned: ScryModel, id: string): FoldedItem {
  for (const host of responsibilityHosts(committed)) {
    host.responsibilities = (host.responsibilities ?? []).filter((item) => item.id !== id)
  }
  const plannedResponsibility = findResponsibility(planned, id)
  if (!plannedResponsibility) {
    return { kind: 'responsibility', id }
  }
  const host = responsibilityHosts(committed).find(
    (item) => item.id === plannedResponsibility.ownerId
  )
  if (!host) {
    throw new ScryerEngineError(
      'not_found',
      `cannot fold responsibility '${id}': host '${plannedResponsibility.ownerId}' is not committed`,
      { responsibility_id: id, owner_id: plannedResponsibility.ownerId }
    )
  }
  host.responsibilities = [...(host.responsibilities ?? []), plannedResponsibility.responsibility]
  return { kind: 'responsibility', id, ownerId: plannedResponsibility.ownerId }
}

function foldLink(committed: ScryModel, planned: ScryModel, id: string): FoldedItem {
  committed.links = committed.links.filter((link) => link.id !== id)
  const plannedLink = planned.links.find((link) => link.id === id)
  if (plannedLink) {
    committed.links.push(plannedLink)
  }
  return { kind: 'link', id }
}

function foldNode(committed: ScryModel, planned: ScryModel, id: string): FoldedItem {
  committed.nodes = committed.nodes.filter((node) => node.id !== id)
  const plannedNode = planned.nodes.find((node) => node.id === id)
  if (plannedNode) {
    committed.nodes.push(plannedNode)
  }
  return { kind: 'node', id }
}

function foldProperty(
  committed: ScryModel,
  planned: ScryModel,
  ownerId: string,
  label: string
): FoldedItem {
  const committedNode = committed.nodes.find((node) => node.id === ownerId)
  if (!committedNode) {
    throw new ScryerEngineError('not_found', `Node '${ownerId}' not found`, { node_id: ownerId })
  }
  committedNode.properties = (committedNode.properties ?? []).filter((item) => item.label !== label)
  const plannedProperty = planned.nodes
    .find((node) => node.id === ownerId)
    ?.properties?.find((item) => item.label === label) as ScrySchemaProperty | undefined
  if (plannedProperty) {
    committedNode.properties = [...(committedNode.properties ?? []), plannedProperty]
  }
  return { kind: 'property', id: label, ownerId }
}

export async function planFoldOperation(
  input: ScryerPlanFoldInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerPlanFoldResult> {
  if (!input || typeof input.node_id !== 'string' || !input.node_id) {
    throw new ScryerEngineError('invalid_input', 'plan.fold requires node_id', {
      field: 'node_id'
    })
  }
  const planned = await store.readPlanned(project.projectRoot)
  const committed = await store.readCommitted(project.projectRoot)
  const folded: FoldedItem[] = []

  const responsibilityIds = input.responsibility_ids ?? []
  const propertyLabels = input.property_labels ?? []
  const linkIds = input.link_ids ?? []
  if (
    input.all === true ||
    (responsibilityIds.length === 0 && propertyLabels.length === 0 && linkIds.length === 0)
  ) {
    folded.push(foldNode(committed, planned, input.node_id))
  }
  for (const id of responsibilityIds) {
    folded.push(foldResponsibility(committed, planned, id))
  }
  for (const label of propertyLabels) {
    folded.push(foldProperty(committed, planned, input.node_id, label))
  }
  for (const id of linkIds) {
    folded.push(foldLink(committed, planned, id))
  }

  const warnings = validateModelStructure(committed)
  await store.writeCommitted(project.projectRoot, committed)
  await store.writeBaseline(project.projectRoot, committed)
  await store.appendHistory(project.projectRoot, {
    operationId: 'scryer.plan.fold',
    folded,
    node_id: input.node_id,
    timestamp: Date.now()
  })
  const remaining = diffModels(committed, planned)
  return { folded, remaining, warnings }
}
