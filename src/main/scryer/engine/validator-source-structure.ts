import type { ScryModel, ScryNode } from './model'
import type { ScryerValidationFinding } from './operation-results'
import { semanticPath } from './semantic-paths'

function nodeById(model: ScryModel): Map<string, ScryNode> {
  return new Map(model.nodes.map((node) => [node.id, node]))
}

function pushFinding(findings: ScryerValidationFinding[], item: ScryerValidationFinding): void {
  findings.push(item)
}

function responsibilityIds(model: ScryModel): Set<string> {
  const ids = new Set<string>()
  for (const host of [...model.nodes, ...model.groups]) {
    for (const responsibility of host.responsibilities ?? []) {
      ids.add(responsibility.id)
    }
  }
  return ids
}

function validateSourceMap(model: ScryModel, findings: ScryerValidationFinding[]): void {
  const nodes = nodeById(model)
  const responsibilities = responsibilityIds(model)
  for (const key of Object.keys(model.sourceMap)) {
    if (!nodes.has(key) && !responsibilities.has(key)) {
      pushFinding(findings, {
        code: 'unknown_source_map_target',
        severity: 'warning',
        message: `sourceMap key '${key}' does not target a known node or responsibility`,
        path: semanticPath.sourceMapRaw(key),
        details: { key, expected: 'responsibility_or_property_node' }
      })
    }
  }
  for (const key of Object.keys(model.boundaries)) {
    if (!nodes.has(key)) {
      pushFinding(findings, {
        code: 'unknown_boundary_target',
        severity: 'warning',
        message: `boundary key '${key}' does not target a known node`,
        path: semanticPath.boundaryNode(key),
        details: { nodeId: key }
      })
    }
  }
}

function validateDisconnected(model: ScryModel, findings: ScryerValidationFinding[]): void {
  if (model.nodes.length < 2) {
    return
  }
  const linked = new Set<string>()
  for (const link of model.links) {
    linked.add(link.src)
    linked.add(link.dst)
  }
  for (const node of model.nodes) {
    const hasChildren = model.nodes.some((candidate) => candidate.parentId === node.id)
    if (node.parentId || node.kind === 'person' || linked.has(node.id) || hasChildren) {
      continue
    }
    pushFinding(findings, {
      code: 'disconnected_node',
      severity: 'warning',
      message: `Top-level node ${node.id} is disconnected`,
      path: semanticPath.node(node.id),
      details: { nodeId: node.id, view: 'system' }
    })
  }
}

export function validateSourceStructure(model: ScryModel): ScryerValidationFinding[] {
  const findings: ScryerValidationFinding[] = []
  validateSourceMap(model, findings)
  validateDisconnected(model, findings)
  return findings
}
