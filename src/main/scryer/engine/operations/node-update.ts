import type { ScryKind } from '../model'
import type { ScryerStateStore } from '../state-store'
import type { ScryerNodeUpdateInput, ScryerNodeUpdateResult, ScryerProjectRef } from '../types'
import { diffModels, summarizePending } from '../diff'
import { ScryerEngineError } from '../pipeline'
import { validateModelStructure } from '../validators'

function isScryKind(value: string): value is ScryKind {
  return (
    value === 'person' ||
    value === 'system' ||
    value === 'container' ||
    value === 'component' ||
    value === 'symbol'
  )
}

export async function nodeUpdateOperation(
  input: ScryerNodeUpdateInput,
  project: ScryerProjectRef,
  store: ScryerStateStore
): Promise<ScryerNodeUpdateResult> {
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new ScryerEngineError('invalid_input', 'node.update requires at least one node patch', {
      field: 'nodes'
    })
  }
  const committed = await store.readCommitted(project.projectRoot)
  let planned = await store.readPlannedForEdit(project.projectRoot)
  let updated = 0
  for (const patch of input.nodes) {
    if (!patch || typeof patch.node_id !== 'string' || !patch.node_id) {
      throw new ScryerEngineError('invalid_input', 'each node patch requires node_id', {
        field: 'nodes.node_id'
      })
    }
    const index = planned.nodes.findIndex((node) => node.id === patch.node_id)
    if (index === -1) {
      throw new ScryerEngineError('not_found', `Node '${patch.node_id}' not found`, {
        node_id: patch.node_id
      })
    }
    const node = planned.nodes[index]!
    if (patch.kind !== undefined) {
      if (!isScryKind(patch.kind)) {
        throw new ScryerEngineError('invalid_input', `invalid node kind '${patch.kind}'`, {
          field: 'nodes.kind'
        })
      }
      node.kind = patch.kind
    }
    if (patch.name !== undefined) {
      node.name = patch.name
    }
    if (patch.description !== undefined) {
      node.description = patch.description
    }
    if (patch.technology !== undefined) {
      node.technology = patch.technology
    }
    if (patch.external !== undefined) {
      node.external = patch.external
    }
    if (patch.responsibilities !== undefined) {
      node.responsibilities = patch.responsibilities
    }
    if (patch.properties !== undefined) {
      node.properties = patch.properties
    }
    if (patch.visual !== undefined) {
      node.visual = patch.visual || undefined
    }
    if (patch.parent_id !== undefined) {
      node.parentId = patch.parent_id ?? undefined
    }
    updated += 1
  }
  planned = { ...planned, nodes: [...planned.nodes] }
  const warnings = validateModelStructure(planned)
  await store.writePlanned(project.projectRoot, planned)
  return {
    updated,
    warnings,
    pendingSummary: summarizePending(diffModels(committed, planned))
  }
}
