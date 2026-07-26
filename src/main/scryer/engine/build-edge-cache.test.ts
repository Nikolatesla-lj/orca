import { describe, expect, it } from 'vitest'
import {
  classifyBuildEdgeStatus,
  normalizeBuildEdgeGraph,
  splitSymbolKey
} from './build-edge-cache'
import type { ScryerBuildEdgeGraph } from './types'

// A fixed generation scope: two symbols generated from `a.ts` and `b.ts`.
const generatedSymbols = new Set(['a.ts#a1', 'b.ts#b1'])
const generatedSourceFiles = new Set(['a.ts', 'b.ts'])

function classify(
  buildEdges: ScryerBuildEdgeGraph | null
): ReturnType<typeof classifyBuildEdgeStatus> {
  return classifyBuildEdgeStatus({
    buildEdges,
    isGeneratedSourceFile: (path) => generatedSourceFiles.has(path),
    resolvesToGeneratedSymbol: (path, name) => generatedSymbols.has(`${path}#${name}`)
  })
}

describe('splitSymbolKey', () => {
  it('splits a path#name@line key into path and name, dropping the line', () => {
    expect(splitSymbolKey('src/a.ts#handleOrder@42')).toEqual({
      path: 'src/a.ts',
      name: 'handleOrder'
    })
  })

  it('tolerates a missing @line suffix', () => {
    expect(splitSymbolKey('src/a.ts#handleOrder')).toEqual({
      path: 'src/a.ts',
      name: 'handleOrder'
    })
  })

  it('returns null when the key has no name delimiter or an empty side', () => {
    expect(splitSymbolKey('src/a.ts')).toBeNull()
    expect(splitSymbolKey('#name@1')).toBeNull()
    expect(splitSymbolKey('src/a.ts#@1')).toBeNull()
  })
})

describe('normalizeBuildEdgeGraph', () => {
  it('returns null for non-object input', () => {
    expect(normalizeBuildEdgeGraph(null)).toBeNull()
    expect(normalizeBuildEdgeGraph('nope')).toBeNull()
  })

  it('coerces a missing or malformed symbolEdges array to an empty graph', () => {
    expect(normalizeBuildEdgeGraph({})).toEqual({ symbolEdges: [] })
    expect(normalizeBuildEdgeGraph({ symbolEdges: 'x' })).toEqual({ symbolEdges: [] })
  })

  it('keeps only well-formed string src/dst edges', () => {
    const graph = normalizeBuildEdgeGraph({
      symbolEdges: [
        { src: 'a.ts#a1@1', dst: 'b.ts#b1@1' },
        { src: 1, dst: 'b.ts#b1@1' },
        null,
        { src: 'a.ts#a1@1' }
      ]
    })
    expect(graph).toEqual({ symbolEdges: [{ src: 'a.ts#a1@1', dst: 'b.ts#b1@1' }] })
  })
})

describe('classifyBuildEdgeStatus', () => {
  it('reports missing when there is no cache at all', () => {
    expect(classify(null)).toBe('missing')
  })

  it('reports empty when the cache has zero edges', () => {
    expect(classify({ symbolEdges: [] })).toBe('empty')
  })

  it('reports available when every in-scope endpoint resolves', () => {
    expect(
      classify({
        symbolEdges: [
          { src: 'a.ts#a1@1', dst: 'b.ts#b1@1' },
          // An in-scope symbol pointing at an out-of-scope dependency is not a
          // gap — the counterpart is simply external.
          { src: 'a.ts#a1@1', dst: 'ext.ts#dep@1' }
        ]
      })
    ).toBe('available')
  })

  it('reports partially_unresolved when a relevant endpoint fails to resolve', () => {
    expect(
      classify({
        symbolEdges: [{ src: 'a.ts#a1@1', dst: 'a.ts#missing@9' }]
      })
    ).toBe('partially_unresolved')
  })

  it('ignores wholly out-of-scope global edges rather than flagging partial', () => {
    expect(
      classify({
        symbolEdges: [{ src: 'x.ts#x1@1', dst: 'y.ts#y1@1' }]
      })
    ).toBe('available')
  })

  it('skips unparsable edge keys without flagging partial', () => {
    expect(
      classify({
        symbolEdges: [{ src: 'no-delimiter', dst: 'a.ts#a1@1' }]
      })
    ).toBe('available')
  })
})
