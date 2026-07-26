import type { ScryKind, ScryModel, ScryNode } from './model'
import type { ScryerValidationFinding } from './operation-results'
import { semanticPath } from './semantic-paths'

const DESCRIPTION_MAX_CHARS = 500

function isScryKind(value: unknown): value is ScryKind {
  return (
    value === 'person' ||
    value === 'system' ||
    value === 'container' ||
    value === 'component' ||
    value === 'symbol'
  )
}

function validParentKind(parent: ScryKind, child: ScryKind): boolean {
  return (
    (parent === 'system' && child === 'container') ||
    (parent === 'container' && child === 'component') ||
    (parent === 'component' && child === 'symbol')
  )
}

function finding(args: ScryerValidationFinding): ScryerValidationFinding {
  return args
}

function pushFinding(findings: ScryerValidationFinding[], item: ScryerValidationFinding): void {
  findings.push(item)
}
function nodeById(model: ScryModel): Map<string, ScryNode> {
  return new Map(model.nodes.map((node) => [node.id, node]))
}
function validateNodeIds(model: ScryModel, findings: ScryerValidationFinding[]): void {
  const seen = new Set<string>()
  for (const node of model.nodes) {
    if (seen.has(node.id)) {
      pushFinding(
        findings,
        finding({
          code: 'duplicate_id',
          severity: 'warning',
          message: `Duplicate node id '${node.id}'`,
          path: semanticPath.node(node.id),
          details: { entity: 'node', id: node.id }
        })
      )
    }
    seen.add(node.id)
  }
}

function validateNodeHierarchy(model: ScryModel, findings: ScryerValidationFinding[]): void {
  const nodes = nodeById(model)
  for (const node of model.nodes) {
    if (!isScryKind(node.kind)) {
      pushFinding(findings, {
        code: 'invalid_hierarchy',
        severity: 'warning',
        message: `Node ${node.id} has invalid kind '${String(node.kind)}'`,
        path: semanticPath.node(node.id, 'kind'),
        details: { nodeId: node.id, reason: 'top_level_kind' }
      })
      continue
    }
    if (node.external === true && node.kind !== 'person' && node.kind !== 'system') {
      pushFinding(findings, {
        code: 'invalid_external',
        severity: 'warning',
        message: `Node ${node.id} cannot be external as kind '${node.kind}'`,
        path: semanticPath.node(node.id, 'external'),
        details: { nodeId: node.id, kind: node.kind }
      })
    }
    if (node.parentId) {
      const parent = nodes.get(node.parentId)
      if (!parent) {
        pushFinding(findings, {
          code: 'missing_reference',
          severity: 'warning',
          message: `Node ${node.id} references missing parent '${node.parentId}'`,
          path: semanticPath.node(node.id, 'parentId'),
          details: { entity: 'node', id: node.parentId, field: 'parentId', targetEntity: 'node' }
        })
      } else if (!validParentKind(parent.kind, node.kind)) {
        pushFinding(findings, {
          code: 'invalid_hierarchy',
          severity: 'warning',
          message: `Node ${node.id} kind '${node.kind}' cannot have parent kind '${parent.kind}'`,
          path: semanticPath.node(node.id, 'parentId'),
          details: { nodeId: node.id, parentId: parent.id, reason: 'invalid_parent_kind' }
        })
      } else if (parent.external === true) {
        pushFinding(findings, {
          code: 'invalid_hierarchy',
          severity: 'warning',
          message: `Node ${node.id} is under external parent '${parent.id}'`,
          path: semanticPath.node(node.id, 'parentId'),
          details: { nodeId: node.id, parentId: parent.id, reason: 'external_parent' }
        })
      }
    } else if (node.kind !== 'person' && node.kind !== 'system') {
      pushFinding(findings, {
        code: 'invalid_hierarchy',
        severity: 'warning',
        message: `Node ${node.id} of kind '${node.kind}' cannot be top-level`,
        path: semanticPath.node(node.id, 'parentId'),
        details: { nodeId: node.id, reason: 'top_level_kind' }
      })
    }
  }
}

function validateText(model: ScryModel, findings: ScryerValidationFinding[]): void {
  for (const node of model.nodes) {
    if ((node.description?.length ?? 0) > DESCRIPTION_MAX_CHARS) {
      pushFinding(findings, {
        code: 'description_too_long',
        severity: 'warning',
        message: `Node ${node.id} description is too long`,
        path: semanticPath.node(node.id, 'description'),
        details: {
          entity: 'node',
          id: node.id,
          max: DESCRIPTION_MAX_CHARS,
          actual: node.description?.length ?? 0
        }
      })
    }
    for (const responsibility of node.responsibilities ?? []) {
      if (responsibility.statement.trim().length === 0) {
        pushFinding(findings, {
          code: 'empty_responsibility',
          severity: 'warning',
          message: `Responsibility ${responsibility.id} has an empty statement`,
          path: semanticPath.nodeResponsibility(node.id, responsibility.id, 'statement'),
          details: { responsibilityId: responsibility.id, ownerId: node.id }
        })
      }
    }
    if (node.kind === 'symbol') {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(node.name)) {
        pushFinding(findings, {
          code: 'invalid_symbol_name',
          severity: 'warning',
          message: `Symbol ${node.id} has invalid name '${node.name}'`,
          path: semanticPath.node(node.id, 'name'),
          details: { nodeId: node.id, name: node.name }
        })
      }
      if (
        (node.responsibilities ?? []).length === 0 &&
        (node.properties ?? []).length === 0 &&
        node.visual !== true
      ) {
        pushFinding(findings, {
          code: 'empty_symbol',
          severity: 'warning',
          message: `Symbol ${node.id} has no responsibilities, properties, or visual appearance`,
          path: semanticPath.node(node.id),
          details: { nodeId: node.id }
        })
      }
    }
  }
}

export function validateNodeStructure(model: ScryModel): ScryerValidationFinding[] {
  const findings: ScryerValidationFinding[] = []
  validateNodeIds(model, findings)
  validateNodeHierarchy(model, findings)
  validateText(model, findings)
  return findings
}
