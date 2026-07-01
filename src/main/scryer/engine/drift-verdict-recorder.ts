import type { ScryModel, ScryNode, ScrySourceLocation } from './model'
import type {
  ScryerDriftFlagInput,
  ScryerDriftFlagResult,
  ScryerExecutorResult,
  ScryerOperationServices,
  ScryerSourceRouteDecision,
  ScryerStateChanges,
  ScryerValidationFinding
} from './types'

type RecordResult = ScryerExecutorResult<ScryerDriftFlagResult>

function cloneModel(model: ScryModel): ScryModel {
  return JSON.parse(JSON.stringify(model)) as ScryModel
}

function success(result: ScryerDriftFlagResult, changes?: ScryerStateChanges): RecordResult {
  return { ok: true, outcome: { result, ...(changes ? { changes } : {}) } }
}

function notFound(entity: 'node' | 'responsibility' | 'property', id: string): RecordResult {
  return {
    ok: false,
    failure: {
      code: 'not_found',
      message: `${entity} '${id}' not found`,
      details: { entity, id }
    }
  }
}

function validationFailed(message: string, finding: ScryerValidationFinding): RecordResult {
  return {
    ok: false,
    failure: {
      code: 'validation_failed',
      message,
      details: { findings: [finding] }
    }
  }
}

function emptyResult(): ScryerDriftFlagResult {
  return {
    flagged: 0,
    mintedNodes: {},
    vagrantResponsibilities: [],
    vagrantProperties: [],
    staleResponsibilities: [],
    staleProperties: [],
    staleNodes: [],
    skippedExistingProperties: []
  }
}

function validParentKind(parent: ScryNode['kind'], child: ScryNode['kind']): boolean {
  return (
    (parent === 'system' && child === 'container') ||
    (parent === 'container' && child === 'component') ||
    (parent === 'component' && child === 'symbol')
  )
}

function sourceLocation(args: {
  source_file?: string
  symbol?: string
  line?: number
  end_line?: number
}): ScrySourceLocation[] {
  if (!args.source_file) {
    return []
  }
  return [
    {
      pattern: args.source_file,
      ...(args.symbol ? { symbol: args.symbol } : {}),
      ...(args.line !== undefined ? { line: args.line } : {}),
      ...(args.end_line !== undefined ? { endLine: args.end_line } : {})
    }
  ]
}

function appendLocations(
  existing: ScryModel['sourceMap'][string] | undefined,
  additions: ScrySourceLocation[]
): ScrySourceLocation[] {
  const out = [...(existing ?? [])]
  for (const addition of additions) {
    const key = JSON.stringify(addition)
    if (!out.some((entry) => JSON.stringify(entry) === key)) {
      out.push(addition)
    }
  }
  return out
}

function nodeById(model: ScryModel): Map<string, ScryNode> {
  return new Map(model.nodes.map((node) => [node.id, node]))
}

function resolveTarget(
  model: ScryModel,
  keyToId: Map<string, string>,
  target: { node_id?: string; node_key?: string },
  entity: string
): string | RecordResult {
  if (target.node_key) {
    const id = keyToId.get(target.node_key)
    if (!id) {
      return validationFailed(`${entity} references unknown node_key '${target.node_key}'`, {
        code: 'missing_reference',
        severity: 'error',
        message: `${entity} references unknown node_key '${target.node_key}'`,
        details: { entity: 'node', id: target.node_key, field: 'node_key' }
      })
    }
    return id
  }
  if (target.node_id && !model.nodes.some((node) => node.id === target.node_id)) {
    return notFound('node', target.node_id)
  }
  return target.node_id!
}

function isFailure(value: string | RecordResult): value is RecordResult {
  return typeof value !== 'string'
}

function hasWork(input: ScryerDriftFlagInput): boolean {
  return Boolean(
    (input.new_nodes?.length ?? 0) > 0 ||
    (input.undescribed?.length ?? 0) > 0 ||
    (input.undescribed_properties?.length ?? 0) > 0 ||
    (input.stale?.length ?? 0) > 0 ||
    (input.stale_properties?.length ?? 0) > 0 ||
    (input.stale_nodes?.length ?? 0) > 0
  )
}

export class ScryerDriftVerdictRecorder {
  record(args: {
    input: ScryerDriftFlagInput
    committed: ScryModel
    planned: ScryModel
    services: ScryerOperationServices
  }): RecordResult {
    if (!args.planned.nodes.some((node) => node.id === args.input.node_id)) {
      return notFound('node', args.input.node_id)
    }
    const result = emptyResult()
    if (!hasWork(args.input)) {
      return success(result)
    }

    const planned = cloneModel(args.planned)
    const committed = cloneModel(args.committed)
    const nodes = nodeById(planned)
    const originalNodeIds = new Set(planned.nodes.map((node) => node.id))
    const keyToId = new Map<string, string>()
    const sourceDecisions: ScryerSourceRouteDecision[] = []
    const pendingNodeSourceEntries = new Map<string, ScryModel['sourceMap'][string]>()

    for (const item of args.input.new_nodes ?? []) {
      if (keyToId.has(item.key)) {
        return validationFailed(`duplicate new_nodes key '${item.key}'`, {
          code: 'duplicate_id',
          severity: 'error',
          message: `duplicate new_nodes key '${item.key}'`,
          details: { entity: 'node', id: item.key, field: 'key' }
        })
      }
      const parentId = item.parent_key ? keyToId.get(item.parent_key) : item.parent_id
      if (!parentId || (item.parent_id && !originalNodeIds.has(item.parent_id))) {
        return validationFailed(`new_nodes '${item.key}' references a missing parent`, {
          code: 'missing_reference',
          severity: 'error',
          message: `new_nodes '${item.key}' references a missing parent`,
          details: {
            entity: 'node',
            id: item.parent_key ?? item.parent_id ?? '',
            field: item.parent_key ? 'parent_key' : 'parent_id'
          }
        })
      }
      const parent = nodes.get(parentId)
      if (!parent || !validParentKind(parent.kind, item.kind)) {
        return validationFailed(`new_nodes '${item.key}' has an invalid parent chain`, {
          code: 'invalid_hierarchy',
          severity: 'error',
          message: `new_nodes '${item.key}' has an invalid parent chain`,
          details: { nodeId: item.key, parentId, reason: 'invalid_parent_kind' }
        })
      }
      const node: ScryNode = {
        id: args.services.ids.node(),
        kind: item.kind,
        name: item.name,
        parentId,
        vagrant: true,
        ...(item.description ? { description: item.description } : {}),
        ...(item.technology ? { technology: item.technology } : {})
      }
      planned.nodes.push(node)
      nodes.set(node.id, node)
      keyToId.set(item.key, node.id)
      result.mintedNodes[item.key] = node.id
    }

    for (const item of args.input.undescribed ?? []) {
      const target = resolveTarget(planned, keyToId, item, 'undescribed')
      if (isFailure(target)) {
        return target
      }
      const node = nodes.get(target)
      if (!node) {
        return notFound('node', target)
      }
      const responsibility = {
        id: args.services.ids.responsibility(),
        statement: item.statement,
        vagrant: true
      }
      node.responsibilities = [...(node.responsibilities ?? []), responsibility]
      result.vagrantResponsibilities.push({
        nodeId: target,
        responsibilityId: responsibility.id,
        statement: responsibility.statement
      })
      const locations = sourceLocation(item)
      if (locations.length > 0) {
        sourceDecisions.push(
          args.services.sourceRouter.routeSourceEntry({
            target: { kind: 'responsibility', responsibilityId: responsibility.id },
            entry: locations,
            committed,
            planned,
            targetLayer: 'planned'
          })
        )
      }
    }

    for (const item of args.input.undescribed_properties ?? []) {
      const target = resolveTarget(planned, keyToId, item, 'undescribed_properties')
      if (isFailure(target)) {
        return target
      }
      const node = nodes.get(target)
      if (!node) {
        return notFound('node', target)
      }
      if ((node.properties ?? []).some((property) => property.label === item.label)) {
        result.skippedExistingProperties?.push({ nodeId: target, label: item.label })
        continue
      }
      node.properties = [
        ...(node.properties ?? []),
        {
          label: item.label,
          ...(item.description ? { description: item.description } : {}),
          vagrant: true
        }
      ]
      result.vagrantProperties.push({ nodeId: target, label: item.label })
      const locations = sourceLocation(item)
      if (locations.length > 0) {
        const entry = appendLocations(
          pendingNodeSourceEntries.get(target) ?? planned.sourceMap[target],
          locations
        )
        pendingNodeSourceEntries.set(target, entry)
        sourceDecisions.push(
          args.services.sourceRouter.routeSourceEntry({
            target: { kind: 'node', nodeId: target },
            entry,
            committed,
            planned,
            targetLayer: 'planned'
          })
        )
      }
    }

    for (const item of args.input.stale ?? []) {
      const hosts = [...planned.nodes, ...planned.groups]
      const responsibility = hosts
        .flatMap((host) => host.responsibilities ?? [])
        .find((candidate) => candidate.id === item.responsibility_id)
      if (!responsibility) {
        return notFound('responsibility', item.responsibility_id)
      }
      responsibility.stale = true
      const proposal = item.proposedStatement?.trim()
      if (proposal) {
        responsibility.staleProposal = proposal
      }
      result.staleResponsibilities.push({
        responsibilityId: responsibility.id,
        ...(proposal ? { staleProposal: proposal } : {})
      })
    }

    for (const item of args.input.stale_properties ?? []) {
      const node = nodes.get(item.node_id)
      if (!node) {
        return notFound('node', item.node_id)
      }
      const property = (node.properties ?? []).find((candidate) => candidate.label === item.label)
      if (!property) {
        return notFound('property', `${item.node_id}.${item.label}`)
      }
      property.stale = true
      result.staleProperties.push({ nodeId: item.node_id, label: item.label })
    }

    for (const item of args.input.stale_nodes ?? []) {
      const node = nodes.get(item.node_id)
      if (!node) {
        return notFound('node', item.node_id)
      }
      node.stale = true
      result.staleNodes.push({ nodeId: item.node_id })
    }

    const routed =
      sourceDecisions.length > 0
        ? args.services.sourceRouter.applySourceRoutes({
            committed,
            planned,
            decisions: sourceDecisions
          }).planned
        : planned
    result.flagged =
      Object.keys(result.mintedNodes).length +
      result.vagrantResponsibilities.length +
      result.vagrantProperties.length +
      result.staleResponsibilities.length +
      result.staleProperties.length +
      result.staleNodes.length

    if (result.flagged === 0) {
      return success(result)
    }

    return success(result, {
      planned: routed,
      historyEvents: [
        {
          type: 'drift.flag',
          nodeId: args.input.node_id,
          flagged: result.flagged,
          mintedNodes: result.mintedNodes,
          vagrantResponsibilities: result.vagrantResponsibilities,
          vagrantProperties: result.vagrantProperties,
          staleResponsibilities: result.staleResponsibilities,
          staleProperties: result.staleProperties,
          staleNodes: result.staleNodes
        }
      ]
    })
  }
}
