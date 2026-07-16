import { readFile } from 'node:fs/promises'
import { scryerPaths } from './paths'
import type { ScryerBuildEdge, ScryerBuildEdgeGraph, ScryerEdgeGraphStatus } from './types'

// Reads the extractor's cached dependency graph at `.scryer/.build_edges.json`.
// A missing or unparsable cache means the fill wires no automatic links — it is
// never a build failure — so this returns null rather than throwing.
export async function readBuildEdgeGraph(
  projectRoot: string
): Promise<ScryerBuildEdgeGraph | null> {
  const paths = scryerPaths(projectRoot)
  let raw: string
  try {
    raw = await readFile(paths.buildEdgesPath, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return normalizeBuildEdgeGraph(parsed)
}

export function normalizeBuildEdgeGraph(parsed: unknown): ScryerBuildEdgeGraph | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const symbolEdges = (parsed as { symbolEdges?: unknown }).symbolEdges
  if (!Array.isArray(symbolEdges)) {
    return { symbolEdges: [] }
  }
  const edges: ScryerBuildEdge[] = []
  for (const candidate of symbolEdges) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue
    }
    const src = (candidate as { src?: unknown }).src
    const dst = (candidate as { dst?: unknown }).dst
    if (typeof src === 'string' && typeof dst === 'string') {
      edges.push({ src, dst })
    }
  }
  return { symbolEdges: edges }
}

// Classify how much the cached dependency graph could be applied to this fill.
// Relevance is scoped to the generation's own source files: an edge is relevant
// only when at least one endpoint lives in a file we drew symbols from. Edges
// wholly outside that scope are the global cache's business and are ignored, so
// they never masquerade as a `partially_unresolved` gap. Within scope, an
// in-scope endpoint that fails to resolve to a generated symbol means the
// derived-link set is incomplete — `partially_unresolved` rather than a guess.
export function classifyBuildEdgeStatus(args: {
  buildEdges: ScryerBuildEdgeGraph | null
  isGeneratedSourceFile: (path: string) => boolean
  resolvesToGeneratedSymbol: (path: string, name: string) => boolean
}): ScryerEdgeGraphStatus {
  if (!args.buildEdges) {
    return 'missing'
  }
  if (args.buildEdges.symbolEdges.length === 0) {
    return 'empty'
  }
  let sawRelevantUnresolved = false
  for (const edge of args.buildEdges.symbolEdges) {
    const from = splitSymbolKey(edge.src)
    const to = splitSymbolKey(edge.dst)
    if (!from || !to) {
      continue
    }
    const fromInScope = args.isGeneratedSourceFile(from.path)
    const toInScope = args.isGeneratedSourceFile(to.path)
    if (!fromInScope && !toInScope) {
      continue
    }
    if (fromInScope && !args.resolvesToGeneratedSymbol(from.path, from.name)) {
      sawRelevantUnresolved = true
    }
    if (toInScope && !args.resolvesToGeneratedSymbol(to.path, to.name)) {
      sawRelevantUnresolved = true
    }
  }
  return sawRelevantUnresolved ? 'partially_unresolved' : 'available'
}

// Parse one extractor symbol key (`path#name@line`) into `(path, name)`. The
// trailing `@line` only disambiguates same-named defs in one file; the join is
// on `(path, name)`.
export function splitSymbolKey(key: string): { path: string; name: string } | null {
  const hash = key.indexOf('#')
  if (hash < 0) {
    return null
  }
  const path = key.slice(0, hash)
  const rest = key.slice(hash + 1)
  const at = rest.lastIndexOf('@')
  const name = at < 0 ? rest : rest.slice(0, at)
  if (!path || !name) {
    return null
  }
  return { path, name }
}
