import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join, relative, sep } from 'path'
import { scryerPaths } from './paths'
import type { ScryModel, ScryNode } from './model'
import type { ScryerHealthCounts, ScryerModelHealthResult, ScryerStateChanges } from './types'

const HEALTH_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.scryer',
  '.next',
  '__pycache__',
  '.direnv',
  '.venv',
  '.turbo',
  '.cache',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.parcel-cache',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  '.build',
  'bin',
  'obj',
  'pkg'
])

type ChildIndex = Map<string, string[]>
type HealthReport = {
  result: ScryerModelHealthResult
  changes?: ScryerStateChanges
}

function emptyCounts(): ScryerHealthCounts {
  return {
    responsibilities: 0,
    properties: 0,
    vagrant: 0,
    stale: 0,
    anchorable: 0,
    anchored: 0,
    unmapped: 0
  }
}

function cloneCounts(counts: ScryerHealthCounts): ScryerHealthCounts {
  return {
    responsibilities: counts.responsibilities,
    properties: counts.properties,
    vagrant: counts.vagrant,
    stale: counts.stale,
    anchorable: counts.anchorable,
    anchored: counts.anchored,
    unmapped: counts.unmapped,
    ...(counts.lastTouchedAt !== undefined ? { lastTouchedAt: counts.lastTouchedAt } : {})
  }
}

function touch(counts: ScryerHealthCounts, at: number | undefined): void {
  if (at === undefined) {
    return
  }
  counts.lastTouchedAt =
    counts.lastTouchedAt === undefined ? at : Math.max(counts.lastTouchedAt, at)
}

function mergeCounts(target: ScryerHealthCounts, source: ScryerHealthCounts): void {
  target.responsibilities += source.responsibilities
  target.properties += source.properties
  target.vagrant += source.vagrant
  target.stale += source.stale
  target.anchorable += source.anchorable
  target.anchored += source.anchored
  target.unmapped += source.unmapped
  touch(target, source.lastTouchedAt)
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.split(sep).join('/')
  let output = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const afterNext = normalized[index + 2]
    if (char === '*' && next === '*' && afterNext === '/') {
      output += '(?:.*/)?'
      index += 2
    } else if (char === '*' && next === '*') {
      output += '.*'
      index += 1
    } else if (char === '*') {
      output += '[^/]*'
    } else if (char === '?') {
      output += '[^/]'
    } else {
      output += escapeRegex(char ?? '')
    }
  }
  return new RegExp(`${output}$`)
}

async function walkProjectFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!HEALTH_SKIP_DIRS.has(entry.name)) {
          await walk(fullPath)
        }
      } else if (entry.isFile()) {
        files.push(relative(root, fullPath).split(sep).join('/'))
      }
    }
  }
  await walk(root)
  return files.sort()
}

function childrenIndex(model: ScryModel): ChildIndex {
  const ids = new Set(model.nodes.map((node) => node.id))
  const children = new Map<string, string[]>()
  for (const node of model.nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id])
    }
  }
  return children
}

function nodeDepth(nodeId: string, nodes: Map<string, ScryNode>): number {
  let depth = 0
  let current = nodes.get(nodeId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId)
    const parent = nodes.get(current.parentId)
    if (!parent) {
      return depth
    }
    depth += 1
    current = parent
  }
  return depth
}

function boundaryOwners(model: ScryModel, files: string[]): Map<string, string> {
  const nodes = new Map(model.nodes.map((node) => [node.id, node]))
  const boundaryMatchers = Object.entries(model.boundaries)
    .filter(([, sources]) => sources.length > 0)
    .flatMap(([nodeId, sources]) =>
      sources.map((source) => ({
        nodeId,
        depth: nodeDepth(nodeId, nodes),
        patternLength: source.pattern.length,
        matcher: globToRegex(source.pattern)
      }))
    )
  const owners = new Map<string, string>()
  for (const file of files) {
    const matches = boundaryMatchers
      .filter((entry) => entry.matcher.test(file))
      .sort((left, right) => right.depth - left.depth || right.patternLength - left.patternLength)
    if (matches[0]) {
      owners.set(file, matches[0].nodeId)
    }
  }
  return owners
}

function scopedNodeIds(
  model: ScryModel,
  nodeId: string | undefined,
  children: ChildIndex
): Set<string> {
  if (!nodeId) {
    return new Set(model.nodes.map((node) => node.id))
  }
  const ids = new Set<string>([nodeId])
  const pending = [nodeId]
  while (pending.length > 0) {
    const current = pending.pop()!
    for (const child of children.get(current) ?? []) {
      if (!ids.has(child)) {
        ids.add(child)
        pending.push(child)
      }
    }
  }
  return ids
}

function anchoredFilesPerSubtree(model: ScryModel, children: ChildIndex): Map<string, Set<string>> {
  const own = new Map<string, Set<string>>()
  for (const node of model.nodes) {
    const files = new Set<string>()
    for (const location of model.sourceMap[node.id] ?? []) {
      files.add(location.pattern)
    }
    for (const responsibility of node.responsibilities ?? []) {
      for (const location of model.sourceMap[responsibility.id] ?? []) {
        files.add(location.pattern)
      }
    }
    own.set(node.id, files)
  }

  const out = new Map<string, Set<string>>()
  const visited = new Set<string>()
  function walk(nodeId: string): Set<string> {
    if (visited.has(nodeId)) {
      return out.get(nodeId) ?? new Set()
    }
    visited.add(nodeId)
    const files = new Set(own.get(nodeId) ?? [])
    for (const child of children.get(nodeId) ?? []) {
      for (const file of walk(child)) {
        files.add(file)
      }
    }
    out.set(nodeId, files)
    return files
  }
  for (const node of model.nodes) {
    walk(node.id)
  }
  return out
}

function groupExtras(model: ScryModel): {
  byNode: Map<string, ScryerHealthCounts>
  unparented: ScryerHealthCounts
} {
  const nodes = new Map(model.nodes.map((node) => [node.id, node]))
  const byNode = new Map<string, ScryerHealthCounts>()
  const unparented = emptyCounts()
  for (const group of model.groups) {
    const counts = emptyCounts()
    for (const responsibility of group.responsibilities ?? []) {
      counts.responsibilities += 1
      if (responsibility.vagrant === true) {
        counts.vagrant += 1
      }
      if (responsibility.stale === true) {
        counts.stale += 1
      }
      touch(counts, responsibility.lastTouchedAt)
    }
    if (counts.responsibilities === 0) {
      continue
    }
    const parent =
      group.parentNodeId ??
      group.memberIds
        .map((id) => nodes.get(id)?.parentId)
        .find((id): id is string => Boolean(id && nodes.has(id)))
    if (parent && nodes.has(parent)) {
      const existing = byNode.get(parent) ?? emptyCounts()
      mergeCounts(existing, counts)
      byNode.set(parent, existing)
    } else {
      mergeCounts(unparented, counts)
    }
  }
  return { byNode, unparented }
}

function ownCounts(model: ScryModel, children: ChildIndex): Map<string, ScryerHealthCounts> {
  const countsByNode = new Map<string, ScryerHealthCounts>()
  for (const node of model.nodes) {
    const isLeaf = (children.get(node.id) ?? []).length === 0
    const anchorableNode = isLeaf && node.external !== true && node.kind !== 'person'
    const counts = emptyCounts()
    for (const responsibility of node.responsibilities ?? []) {
      counts.responsibilities += 1
      if (responsibility.vagrant === true) {
        counts.vagrant += 1
      }
      if (responsibility.stale === true) {
        counts.stale += 1
      }
      touch(counts, responsibility.lastTouchedAt)
      if (anchorableNode) {
        counts.anchorable += 1
        if ((model.sourceMap[responsibility.id] ?? []).length > 0) {
          counts.anchored += 1
        } else {
          counts.unmapped += 1
        }
      }
    }
    for (const property of node.properties ?? []) {
      counts.properties += 1
      if (property.vagrant === true) {
        counts.vagrant += 1
      }
      if (property.stale === true) {
        counts.stale += 1
      }
      touch(counts, property.lastTouchedAt)
    }
    if (anchorableNode && (node.properties ?? []).length > 0) {
      counts.anchorable += 1
      if ((model.sourceMap[node.id] ?? []).length > 0) {
        counts.anchored += 1
      } else {
        counts.unmapped += 1
      }
    }
    countsByNode.set(node.id, counts)
  }
  return countsByNode
}

function subtreeCounts(args: {
  model: ScryModel
  children: ChildIndex
  own: Map<string, ScryerHealthCounts>
  groupExtra: Map<string, ScryerHealthCounts>
}): Map<string, ScryerHealthCounts> {
  const out = new Map<string, ScryerHealthCounts>()
  const visited = new Set<string>()
  function walk(nodeId: string): ScryerHealthCounts {
    if (visited.has(nodeId)) {
      return out.get(nodeId) ?? emptyCounts()
    }
    visited.add(nodeId)
    const counts = cloneCounts(args.own.get(nodeId) ?? emptyCounts())
    const extra = args.groupExtra.get(nodeId)
    if (extra) {
      mergeCounts(counts, extra)
    }
    for (const child of args.children.get(nodeId) ?? []) {
      mergeCounts(counts, walk(child))
    }
    out.set(nodeId, counts)
    return counts
  }
  for (const node of args.model.nodes) {
    walk(node.id)
  }
  return out
}

function maintenanceChanges(projectRoot: string, nowIso: string): ScryerStateChanges | undefined {
  const paths = scryerPaths(projectRoot)
  const changes: ScryerStateChanges = {}
  if (!existsSync(paths.syncPath)) {
    changes.syncState = { reconciledAt: nowIso }
  }
  if (!existsSync(paths.anchorBaselinePath)) {
    changes.anchorBaseline = 'refresh'
  }
  return Object.keys(changes).length > 0 ? changes : undefined
}

export class ScryerHealthReporter {
  async report(args: {
    model: ScryModel
    projectRoot: string
    nodeId?: string
    nowIso: string
  }): Promise<HealthReport> {
    const children = childrenIndex(args.model)
    const scope = scopedNodeIds(args.model, args.nodeId, children)
    const own = ownCounts(args.model, children)
    const groups = groupExtras(args.model)
    const subtree = subtreeCounts({
      model: args.model,
      children,
      own,
      groupExtra: groups.byNode
    })
    const files = await walkProjectFiles(args.projectRoot)
    const owners = boundaryOwners(args.model, files)
    const anchored = anchoredFilesPerSubtree(args.model, children)
    const nodes: ScryerModelHealthResult['nodes'] = {}

    for (const node of args.model.nodes) {
      if (!scope.has(node.id)) {
        continue
      }
      const boundarySources = args.model.boundaries[node.id] ?? []
      const darkFiles = files.filter(
        (file) => owners.get(file) === node.id && !anchored.get(node.id)?.has(file)
      )
      nodes[node.id] = {
        own: cloneCounts(own.get(node.id) ?? emptyCounts()),
        subtree: cloneCounts(subtree.get(node.id) ?? emptyCounts()),
        ...(boundarySources.length > 0
          ? {
              boundary: {
                totalFiles: files.filter((file) => owners.get(file) === node.id).length,
                anchoredFiles: files.filter(
                  (file) => owners.get(file) === node.id && anchored.get(node.id)?.has(file)
                ).length,
                darkFiles
              }
            }
          : {})
      }
    }

    const totals = args.nodeId
      ? cloneCounts(subtree.get(args.nodeId) ?? emptyCounts())
      : (() => {
          const result = cloneCounts(groups.unparented)
          const nodeIds = new Set(args.model.nodes.map((node) => node.id))
          for (const node of args.model.nodes) {
            if (!node.parentId || !nodeIds.has(node.parentId)) {
              mergeCounts(result, subtree.get(node.id) ?? emptyCounts())
            }
          }
          return result
        })()

    return {
      result: { nodes, totals },
      changes: maintenanceChanges(args.projectRoot, args.nowIso)
    }
  }
}
