import type { C4ModelData, C4Node } from '../../shared/scryer/model-types'

const MENTION_RE = /@\[([^\]]+)\]/g

// Why: mention checks are an MCP-only authoring aid (relationship hints written as
// @[Name] in descriptions) that the cataloged Engine validators do not cover. They layer
// on top of the Engine's structural findings; they are not legacy C4 shape validation.
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
