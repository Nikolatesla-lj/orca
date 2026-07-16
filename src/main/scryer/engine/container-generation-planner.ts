import type {
  ScryerBuildEdgeGraph,
  ScryerContainerFillInput,
  ScryerContainerFillResult
} from './container-generation-contracts'
import { planGeneratedSubtreeIdentity } from './container-generation-identity'
import {
  failContainerGeneration,
  invalidContainerGenerationProposal,
  isBlockingContainerGenerationFinding,
  validateContainerGenerationProposal
} from './container-generation-proposal'
import {
  addGeneratedLinksToPlanned,
  planGeneratedGroups,
  planGeneratedRelationships
} from './container-generation-relationships'
import {
  completeContainerGeneration,
  planContainerGenerationHistory,
  planContainerGenerationResult
} from './container-generation-result'
import { planGeneratedSourceAnchors } from './container-generation-source-anchors'
import type { ScryGroup, ScryModel, ScryNode } from './model'
import type { ScryerOperationServices } from './operation-services'
import type { ScryerExecutorResult } from './operation-results'

type ContainerGenerationArgs = {
  committed: ScryModel
  planned: ScryModel
  services: ScryerOperationServices
  buildEdges: ScryerBuildEdgeGraph | null
}

function cloneModel(model: ScryModel): ScryModel {
  return JSON.parse(JSON.stringify(model)) as ScryModel
}

export class ScryerContainerGenerationPlanner {
  private readonly committed: ScryModel
  private readonly planned: ScryModel
  private readonly services: ScryerOperationServices
  private readonly buildEdges: ScryerBuildEdgeGraph | null

  constructor(args: ContainerGenerationArgs) {
    this.committed = args.committed
    this.planned = args.planned
    this.services = args.services
    this.buildEdges = args.buildEdges
  }

  plan(input: ScryerContainerFillInput): ScryerExecutorResult<ScryerContainerFillResult> {
    const container = this.committed.nodes.find((node) => node.id === input.container_id)
    if (!container) {
      return failContainerGeneration({
        code: 'not_found',
        message: `Container '${input.container_id}' not found`,
        details: { entity: 'node', id: input.container_id, field: 'container_id' }
      })
    }

    const preflight = validateContainerGenerationProposal({
      input,
      container,
      committed: this.committed,
      planned: this.planned
    })
    if (preflight) {
      return preflight
    }

    const committed = cloneModel(this.committed)
    const planned = cloneModel(this.planned)
    const build = planGeneratedSubtreeIdentity({
      input,
      containerId: container.id,
      ids: this.services.ids
    })
    for (const node of build.nodes) {
      committed.nodes.push(node)
      planned.nodes.push(JSON.parse(JSON.stringify(node)) as ScryNode)
    }

    const groupPlan = planGeneratedGroups({
      proposals: input.groups ?? [],
      componentIdByKey: build.componentIdByKey,
      containerId: container.id,
      ids: this.services.ids
    })
    if (!groupPlan.ok) {
      return groupPlan.failure
    }
    for (const group of groupPlan.value.groups) {
      committed.groups.push(group)
      planned.groups.push(JSON.parse(JSON.stringify(group)) as ScryGroup)
    }

    planGeneratedSourceAnchors({
      committed,
      planned,
      entries: build.sourceEntries,
      sourceRouter: this.services.sourceRouter
    })

    const relationships = planGeneratedRelationships({
      proposals: input.links ?? [],
      committed,
      existingLinks: this.committed.links,
      localIds: build.localIds,
      symbolNodeByLoc: build.symbolNodeByLoc,
      symbolComponent: build.symbolComponent,
      sourceFiles: build.sourceFiles,
      buildEdges: this.buildEdges,
      ids: this.services.ids,
      validators: this.services.validators
    })
    committed.links.push(...relationships.links)
    addGeneratedLinksToPlanned({
      planned,
      links: relationships.links,
      existingLinks: this.planned.links
    })

    const snapshotFindings = [
      ...this.services.validators.validateModel(committed),
      ...this.services.validators.validateModel(planned)
    ]
    const blocking = snapshotFindings.filter(isBlockingContainerGenerationFinding)
    if (blocking.length > 0) {
      return invalidContainerGenerationProposal(
        'container.fill would produce an invalid model snapshot',
        blocking
      )
    }

    const result = planContainerGenerationResult({
      input,
      build,
      groups: groupPlan.value.created,
      links: relationships,
      findings: snapshotFindings
    })
    return completeContainerGeneration({
      result,
      committed,
      planned,
      historyEvents: planContainerGenerationHistory({
        created: build.created,
        clock: this.services.clock
      })
    })
  }
}

export function createScryerContainerGenerationPlanner(
  args: ContainerGenerationArgs
): ScryerContainerGenerationPlanner {
  return new ScryerContainerGenerationPlanner(args)
}
