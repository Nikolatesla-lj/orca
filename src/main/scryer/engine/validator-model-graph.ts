import type { ScryModel } from './model'

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

export type LinkViolation =
  | { reason: 'self_link' }
  | { reason: 'ancestor_descendant'; ancestor: string; descendant: string }
  | { reason: 'same_level_reference' }
  | { reason: 'duplicate_link'; linkId?: string }

export function linkViolation(model: ScryModel, src: string, dst: string): LinkViolation | null {
  if (src === dst) {
    return { reason: 'self_link' }
  }
  const duplicate = model.links.find((link) => link.src === src && link.dst === dst)
  if (duplicate) {
    return { reason: 'duplicate_link', linkId: duplicate.id }
  }
  if (isAncestor(model, src, dst)) {
    return { reason: 'ancestor_descendant', ancestor: src, descendant: dst }
  }
  if (isAncestor(model, dst, src)) {
    return { reason: 'ancestor_descendant', ancestor: dst, descendant: src }
  }
  if (parentOf(model, src) === parentOf(model, dst)) {
    return null
  }
  const srcDepth = depth(model, src)
  const dstDepth = depth(model, dst)
  if (srcDepth === dstDepth) {
    return { reason: 'same_level_reference' }
  }
  const deeper = srcDepth > dstDepth ? src : dst
  const other = srcDepth > dstDepth ? dst : src
  const parent = parentOf(model, deeper)
  if (!parent) {
    return null
  }
  if (!linkedEither(model, parent, other)) {
    return { reason: 'same_level_reference' }
  }
  return linkViolation(model, parent, other)
}

export function describeLinkViolation(
  model: ScryModel,
  src: string,
  dst: string,
  violation: LinkViolation
): string {
  switch (violation.reason) {
    case 'self_link':
      return `Link ${src}->${dst} rejected because an element cannot link to itself.`
    case 'duplicate_link':
      return `Link ${src}->${dst} rejected because that endpoint pair already exists.`
    case 'ancestor_descendant':
      return `Link ${src}->${dst} rejected: '${nodeName(model, violation.ancestor)}' contains '${nodeName(
        model,
        violation.descendant
      )}'.`
    case 'same_level_reference':
      return `Link ${src}->${dst} rejected because the endpoints are not visible from the same Scryer view surface.`
  }
}
