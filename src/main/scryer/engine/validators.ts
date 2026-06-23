import type { ScryKind, ScryModel } from './model'
import type { ValidationWarning } from './types'

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

function pushWarning(
  warnings: ValidationWarning[],
  code: string,
  message: string,
  path?: string
): void {
  warnings.push(path ? { code, message, path } : { code, message })
}

export function validateModelStructure(model: ScryModel): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]))
  const seenNodeIds = new Set<string>()
  for (const node of model.nodes) {
    if (seenNodeIds.has(node.id)) {
      pushWarning(
        warnings,
        'duplicate_node_id',
        `Duplicate node id: ${node.id}`,
        `nodes.${node.id}`
      )
    }
    seenNodeIds.add(node.id)
    if (!isScryKind(node.kind)) {
      pushWarning(
        warnings,
        'invalid_kind',
        `Node ${node.id} has invalid kind '${String(node.kind)}'`,
        `nodes.${node.id}.kind`
      )
      continue
    }
    if (node.parentId) {
      const parent = nodesById.get(node.parentId)
      if (!parent) {
        pushWarning(
          warnings,
          'invalid_parent',
          `Node ${node.id} has parentId '${node.parentId}' that does not exist`,
          `nodes.${node.id}.parentId`
        )
      } else if (!validParentKind(parent.kind, node.kind)) {
        pushWarning(
          warnings,
          'invalid_parent',
          `Node ${node.id} kind '${node.kind}' cannot have parent kind '${parent.kind}'`,
          `nodes.${node.id}.parentId`
        )
      } else if (parent.external === true) {
        pushWarning(
          warnings,
          'external_parent',
          `Node ${node.id} is a child of external node ${parent.id}`,
          `nodes.${node.id}.parentId`
        )
      }
    } else if (node.kind !== 'person' && node.kind !== 'system') {
      pushWarning(
        warnings,
        'invalid_parent',
        `Node ${node.id} of kind '${node.kind}' has no parent; only person/system are top-level`,
        `nodes.${node.id}.parentId`
      )
    }
  }

  const seenLinkIds = new Set<string>()
  for (const link of model.links) {
    if (seenLinkIds.has(link.id)) {
      pushWarning(
        warnings,
        'duplicate_link_id',
        `Duplicate link id: ${link.id}`,
        `links.${link.id}`
      )
    }
    seenLinkIds.add(link.id)
    if (!nodesById.has(link.src)) {
      pushWarning(
        warnings,
        'unknown_link_endpoint',
        `Link ${link.id} has unknown src '${link.src}'`,
        `links.${link.id}.src`
      )
    }
    if (!nodesById.has(link.dst)) {
      pushWarning(
        warnings,
        'unknown_link_endpoint',
        `Link ${link.id} has unknown dst '${link.dst}'`,
        `links.${link.id}.dst`
      )
    }
    if (link.src === link.dst) {
      pushWarning(
        warnings,
        'self_link',
        `Link ${link.id} has src == dst (${link.src})`,
        `links.${link.id}`
      )
    } else if (nodesById.has(link.src) && nodesById.has(link.dst)) {
      const violation = linkViolation(model, link.src, link.dst)
      if (violation) {
        pushWarning(
          warnings,
          'illegal_link',
          describeLinkViolation(model, link.src, link.dst, violation),
          `links.${link.id}`
        )
      }
    }
  }

  return warnings
}

type LinkViolation =
  | { type: 'containment'; ancestor: string; descendant: string }
  | { type: 'same_level_different_parent' }
  | { type: 'unauthorized_cross_level'; deeper: string; other: string; parent: string }

function parentOf(model: ScryModel, id: string): string | undefined {
  return model.nodes.find((node) => node.id === id)?.parentId
}

function depth(model: ScryModel, id: string): number {
  let current = id
  let count = 0
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const parent = parentOf(model, current)
    if (!parent) {
      return count
    }
    current = parent
    count += 1
  }
  return count
}

function isAncestor(model: ScryModel, ancestor: string, descendant: string): boolean {
  let current = parentOf(model, descendant)
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    if (current === ancestor) {
      return true
    }
    seen.add(current)
    current = parentOf(model, current)
  }
  return false
}

function linkedEither(model: ScryModel, left: string, right: string): boolean {
  return model.links.some(
    (link) => (link.src === left && link.dst === right) || (link.src === right && link.dst === left)
  )
}

function nodeName(model: ScryModel, id: string): string {
  return model.nodes.find((node) => node.id === id)?.name ?? id
}

export function linkViolation(model: ScryModel, src: string, dst: string): LinkViolation | null {
  if (src === dst) {
    return null
  }
  if (isAncestor(model, src, dst)) {
    return { type: 'containment', ancestor: src, descendant: dst }
  }
  if (isAncestor(model, dst, src)) {
    return { type: 'containment', ancestor: dst, descendant: src }
  }
  if (parentOf(model, src) === parentOf(model, dst)) {
    return null
  }
  const srcDepth = depth(model, src)
  const dstDepth = depth(model, dst)
  if (srcDepth === dstDepth) {
    return { type: 'same_level_different_parent' }
  }
  const deeper = srcDepth > dstDepth ? src : dst
  const other = srcDepth > dstDepth ? dst : src
  const parent = parentOf(model, deeper)
  if (!parent) {
    return null
  }
  if (!linkedEither(model, parent, other)) {
    return { type: 'unauthorized_cross_level', deeper, other, parent }
  }
  return linkViolation(model, parent, other)
}

export function describeLinkViolation(
  model: ScryModel,
  src: string,
  dst: string,
  violation: LinkViolation
): string {
  switch (violation.type) {
    case 'containment':
      return `Link ${src}->${dst} rejected: '${nodeName(model, violation.ancestor)}' contains '${nodeName(
        model,
        violation.descendant
      )}'. Containment is expressed by nesting, not by a link.`
    case 'same_level_different_parent':
      return `Link ${src}->${dst} rejected: '${nodeName(model, src)}' and '${nodeName(
        model,
        dst
      )}' sit at the same level under different parents.`
    case 'unauthorized_cross_level':
      return `Link ${src}->${dst} rejected: '${nodeName(model, violation.other)}' is not visible on the surface where '${nodeName(
        model,
        violation.deeper
      )}' lives. Add a link between '${nodeName(model, violation.parent)}' and '${nodeName(
        model,
        violation.other
      )}' first.`
  }
}
