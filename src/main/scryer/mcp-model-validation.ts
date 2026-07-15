import type { C4ModelData, C4Node } from '../../shared/scryer/model-types'
import {
  isKind,
  validateIdentifier,
  validatePropertyLabels,
  validateTypeName
} from './mcp-model-values'

export function validateParent(model: C4ModelData, node: C4Node): string | null {
  const parent = node.parentId
    ? model.nodes.find((candidate) => candidate.id === node.parentId)
    : null
  if (node.data.kind === 'person' || node.data.kind === 'system') {
    return node.parentId ? `${node.data.kind} '${node.data.name}' must be top-level` : null
  }
  if (node.data.kind === 'container' && parent?.data.kind !== 'system') {
    return `Container '${node.data.name}' must have a system parent`
  }
  if (node.data.kind === 'component' && parent?.data.kind !== 'container') {
    return `Component '${node.data.name}' must have a container parent`
  }
  if (
    (node.data.kind === 'operation' ||
      node.data.kind === 'process' ||
      node.data.kind === 'model') &&
    parent?.data.kind !== 'component'
  ) {
    return `${node.data.kind} '${node.data.name}' must have a component parent`
  }
  return null
}

function validateNoExternalChildren(model: C4ModelData): string[] {
  const errors: string[] = []
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  for (const node of model.nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent?.data.kind === 'system' && parent.data.external) {
      errors.push(`External system '${parent.data.name}' cannot contain '${node.data.name}'`)
    }
  }
  return errors
}

const MENTION_RE = /@\[([^\]]+)\]/g

export function validateMentionEdges(model: C4ModelData): string[] {
  const errors: string[] = []
  const siblingsByParent = new Map<string, C4Node[]>()
  for (const node of model.nodes) {
    const key = node.parentId ?? ''
    siblingsByParent.set(key, [...(siblingsByParent.get(key) ?? []), node])
  }
  const edgeKeys = new Set<string>()
  for (const edge of model.edges) {
    edgeKeys.add(`${edge.source}->${edge.target}`)
    edgeKeys.add(`${edge.target}->${edge.source}`)
  }
  for (const node of model.nodes) {
    const siblings = siblingsByParent.get(node.parentId ?? '') ?? []
    for (const match of node.data.description.matchAll(MENTION_RE)) {
      const mention = match[1]
      const target = siblings.find(
        (candidate) =>
          candidate.id === mention ||
          candidate.data.name === mention ||
          candidate.data.name.toLowerCase() === mention.toLowerCase()
      )
      if (!target) {
        errors.push(`${node.data.name} mentions ${mention} but no sibling node matches it`)
        continue
      }
      if (target.id === node.id) {
        continue
      }
      if (!edgeKeys.has(`${node.id}->${target.id}`)) {
        errors.push(
          `${node.data.name} mentions ${target.data.name} but no relationship edge connects them`
        )
      }
    }
  }
  return errors
}

export function validateModelShape(model: C4ModelData): string[] {
  const errors: string[] = []
  const nodeIds = new Set(model.nodes.map((node) => node.id))
  for (const node of model.nodes) {
    if (!isKind(node.data.kind)) {
      errors.push(`Node '${node.id}' has invalid kind '${String(node.data.kind)}'`)
      continue
    }
    const parentError = validateParent(model, node)
    if (parentError) {
      errors.push(parentError)
    }
    if (node.parentId && !nodeIds.has(node.parentId)) {
      errors.push(`Node '${node.data.name}' references missing parent '${node.parentId}'`)
    }
    if (
      node.data.description.length > 200 &&
      !['operation', 'process', 'model'].includes(node.data.kind)
    ) {
      errors.push(`Description for '${node.data.name}' must be 200 characters or less`)
    }
    if (node.data.technology && node.data.technology.length > 28) {
      errors.push(
        `Technology '${node.data.technology}' on '${node.data.name}' exceeds 28 character limit`
      )
    }
    if (node.data.kind === 'operation') {
      const error = validateIdentifier(node.data.name, `operation '${node.id}'`)
      if (error) {
        errors.push(error)
      }
    }
    if (node.data.kind === 'model') {
      const error = validateTypeName(node.data.name, `model '${node.id}'`)
      if (error) {
        errors.push(error)
      }
      const propertyError = validatePropertyLabels(node.data.properties ?? [], `node '${node.id}'`)
      if (propertyError) {
        errors.push(propertyError)
      }
    }
  }
  errors.push(...validateNoExternalChildren(model))
  for (const edge of model.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`Edge '${edge.id}' references a missing node`)
    }
    if ((edge.data?.label ?? '').length > 30) {
      errors.push(`Edge label '${edge.data?.label}' exceeds 30 character limit`)
    }
  }
  return errors
}
