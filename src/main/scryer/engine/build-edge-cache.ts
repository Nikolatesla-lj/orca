import { readFile } from 'fs/promises'
import { scryerPaths } from './paths'
import type { ScryerBuildEdge, ScryerBuildEdgeGraph } from './types'

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
