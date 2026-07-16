import { describe, expect, it } from 'vitest'
import { containerGenerationSourceKey } from './container-generation-identity'
import { createScryerContainerGenerationPlanner } from './container-generation-planner'
import { containerGenerationRelationshipKey } from './container-generation-relationships'
import { diffModels } from './diff'
import { createScryerFoldService } from './fold'
import { createScryerIdMinter } from './id-minter'
import type { ScryModel } from './model'
import { createScryerSourceRouter } from './source-router'
import type {
  ScryerBuildEdgeGraph,
  ScryerContainerFillInput,
  ScryerContainerFillResult,
  ScryerExecutorResult,
  ScryerOperationServices
} from './types'
import { createScryerValidatorSet } from './validators'

function services(committed: ScryModel, planned: ScryModel): ScryerOperationServices {
  return {
    ids: createScryerIdMinter({ committed, planned }),
    validators: createScryerValidatorSet(),
    diff: { diffModels },
    fold: createScryerFoldService(),
    sourceRouter: createScryerSourceRouter(),
    clock: { nowIso: () => '2026-07-13T00:00:00.000Z' }
  }
}

function baseModel(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
    ],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {}
  }
}

function run(
  input: ScryerContainerFillInput,
  options: {
    committed?: ScryModel
    planned?: ScryModel
    buildEdges?: ScryerBuildEdgeGraph | null
  } = {}
): ScryerExecutorResult<ScryerContainerFillResult> {
  const committed = options.committed ?? baseModel()
  const planned = options.planned ?? JSON.parse(JSON.stringify(committed))
  return createScryerContainerGenerationPlanner({
    committed,
    planned,
    services: services(committed, planned),
    buildEdges: options.buildEdges ?? null
  }).plan(input)
}

function expectOk(
  result: ScryerExecutorResult<ScryerContainerFillResult>
): ScryerContainerFillResult {
  if (!result.ok) {
    throw new Error(`Expected ok result, got failure ${JSON.stringify(result.failure)}`)
  }
  return result.outcome.result
}

const singleComponent: ScryerContainerFillInput = {
  container_id: 'api',
  components: [
    {
      key: 'orders',
      name: 'Orders',
      description: 'Coordinates orders',
      responsibilities: ['Coordinates order lifecycle'],
      symbols: [
        {
          key: 'handleOrder',
          name: 'handleOrder',
          source_file: 'src/orders.ts',
          line: 10,
          end_line: 40,
          responsibilities: ['Handles an order request']
        }
      ]
    }
  ]
}

describe('ScryerContainerGenerationPlanner', () => {
  it('preserves the historical NUL-delimited composite key semantics', () => {
    const nul = String.fromCharCode(0)

    // NUL-containing inputs intentionally retain the pre-extraction collision behavior.
    expect(containerGenerationSourceKey(`a${nul}b`, 'c')).toBe(
      containerGenerationSourceKey('a', `b${nul}c`)
    )
    expect(containerGenerationRelationshipKey(`a${nul}b`, 'c')).toBe(
      containerGenerationRelationshipKey('a', `b${nul}c`)
    )
  })

  it('fills an empty container with a component/symbol subtree and source anchors', () => {
    const result = run(singleComponent)
    const value = expectOk(result)

    expect(value.summary.components).toBe(1)
    expect(value.summary.symbols).toBe(1)
    expect(value.commit.baselineRefreshed).toBe(false)
    expect(value.created.components[0].name).toBe('Orders')
    expect(value.created.symbols[0].parentComponentId).toBe(value.created.components[0].id)

    // Both layers receive the generated subtree; anchors are mirrored.
    const changes = result.ok ? result.outcome.changes! : undefined
    const componentId = value.created.components[0].id
    expect(changes?.committed?.nodes.some((node) => node.id === componentId)).toBe(true)
    expect(changes?.planned?.nodes.some((node) => node.id === componentId)).toBe(true)
    const respId = value.created.symbols[0].responsibilityIds[0]
    expect(changes?.committed?.sourceMap[respId]?.[0]?.pattern).toBe('src/orders.ts')
    expect(changes?.planned?.sourceMap[respId]?.[0]?.pattern).toBe('src/orders.ts')
    // A plain-string responsibility anchors to the whole symbol, never inheriting
    // the symbol's declared line range.
    expect(changes?.committed?.sourceMap[respId]?.[0]?.line).toBeUndefined()
    expect(changes?.committed?.sourceMap[respId]?.[0]?.endLine).toBeUndefined()

    // Every symbol also keeps its own node-level source anchor, mirrored to planned.
    const symbolId = value.created.symbols[0].id
    expect(changes?.committed?.sourceMap[symbolId]?.[0]).toMatchObject({
      pattern: 'src/orders.ts',
      symbol: 'handleOrder',
      line: 10,
      endLine: 40
    })
    expect(changes?.planned?.sourceMap[symbolId]?.[0]?.pattern).toBe('src/orders.ts')

    // Node anchor + responsibility anchor.
    expect(value.summary.sourceAnchors).toBe(2)
    // A clean snapshot surfaces no warning-severity findings.
    expect(value.reports.warningCount).toBe(0)
  })

  it('does not refresh the baseline or advance any drift anchor', () => {
    const result = run(singleComponent)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.outcome.changes?.baseline).toBeUndefined()
      expect(result.outcome.changes?.anchorBaseline).toBeUndefined()
      expect(result.outcome.changes?.syncState).toBeUndefined()
      expect(result.outcome.changes?.historyEvents?.[0]).toMatchObject({ kind: 'born' })
    }
  })

  it('mints ids against committed plus planned so it never collides with a planned-only node', () => {
    const committed = baseModel()
    const planned: ScryModel = JSON.parse(JSON.stringify(committed))
    // A concurrent session minted node-9 into planned only.
    planned.nodes.push({ id: 'node-9', kind: 'person', name: 'Concurrent Person' })

    const value = expectOk(run(singleComponent, { committed, planned }))
    const mintedIds = [
      ...value.created.components.map((component) => component.id),
      ...value.created.symbols.map((symbol) => symbol.id)
    ]
    expect(mintedIds).not.toContain('node-9')
    expect(new Set(mintedIds).size).toBe(mintedIds.length)
  })

  it('allows a thin symbol with no responsibilities or properties but keeps its node anchor', () => {
    const result = run({
      container_id: 'api',
      components: [
        {
          key: 'reexport',
          name: 'ReExport',
          symbols: [{ key: 'index', name: 'index', source_file: 'src/index.ts' }]
        }
      ]
    })
    const value = expectOk(result)
    expect(value.summary.symbols).toBe(1)
    expect(value.reports.thinSymbolCount).toBe(1)

    // A thin symbol still retains a persistent node-level source anchor in both
    // layers — no fabricated responsibility, just its own code identity.
    const symbolId = value.created.symbols[0].id
    expect(value.created.symbols[0].responsibilityIds).toHaveLength(0)
    const changes = result.ok ? result.outcome.changes : undefined
    expect(changes?.committed?.sourceMap[symbolId]?.[0]?.pattern).toBe('src/index.ts')
    expect(changes?.planned?.sourceMap[symbolId]?.[0]?.pattern).toBe('src/index.ts')
    expect(value.summary.sourceAnchors).toBe(1)
  })

  it('rejects a container that already has component children', () => {
    const committed = baseModel()
    committed.nodes.push({ id: 'existing', kind: 'component', name: 'Existing', parentId: 'api' })
    const result = run(singleComponent, { committed })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('validation_failed')
      const findings = result.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'empty_generation_target_required')).toBe(
        true
      )
    }
  })

  it('rejects generation when only the planned layer already has a component child', () => {
    const committed = baseModel()
    const planned: ScryModel = JSON.parse(JSON.stringify(committed))
    // A concurrent session drafted a component under the same container; the
    // committed layer is still empty, but effective state is not.
    planned.nodes.push({ id: 'planned-comp', kind: 'component', name: 'Planned', parentId: 'api' })
    const result = run(singleComponent, { committed, planned })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('validation_failed')
      const findings = result.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'empty_generation_target_required')).toBe(
        true
      )
    }
  })

  it('returns not_found when the target container does not exist', () => {
    const result = run({ ...singleComponent, container_id: 'ghost' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('not_found')
    }
  })

  it('rejects a non-container target', () => {
    const result = run({ ...singleComponent, container_id: 'shop' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const findings = result.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'not_a_container')).toBe(true)
    }
  })

  it('rejects duplicate local keys without writing', () => {
    const result = run({
      container_id: 'api',
      components: [
        {
          key: 'dup',
          name: 'A',
          symbols: [{ key: 'dup', name: 'a', source_file: 'a.ts' }]
        }
      ]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const findings = result.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'duplicate_local_key')).toBe(true)
    }
  })

  it('rejects a local key that conflicts with an existing model node id', () => {
    const result = run({
      container_id: 'api',
      components: [
        {
          key: 'shop',
          name: 'Clash',
          symbols: [{ key: 'clash-sym', name: 'clash', source_file: 'c.ts' }]
        }
      ]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const findings = result.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'local_key_conflicts_existing_id')).toBe(
        true
      )
    }
  })

  it('creates a group over proposed components and rejects unresolved members', () => {
    const twoComponents: ScryerContainerFillInput = {
      container_id: 'api',
      components: [
        { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'a.ts' }] },
        { key: 'b', name: 'B', symbols: [{ key: 'b1', name: 'b1', source_file: 'b.ts' }] }
      ],
      groups: [{ name: 'Pair', member_keys: ['a', 'b'] }]
    }
    const value = expectOk(run(twoComponents))
    expect(value.summary.groups).toBe(1)
    expect(value.created.groups[0].memberIds).toHaveLength(2)

    const bad = run({
      ...twoComponents,
      groups: [{ name: 'Pair', member_keys: ['a', 'missing'] }]
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      const findings = bad.failure.details?.findings as { details?: { reason?: string } }[]
      expect(findings.some((f) => f.details?.reason === 'unresolved_group_member')).toBe(true)
    }
  })

  it('owns a generated group under the target container with only its direct component children', () => {
    const twoComponents: ScryerContainerFillInput = {
      container_id: 'api',
      components: [
        { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'a.ts' }] },
        { key: 'b', name: 'B', symbols: [{ key: 'b1', name: 'b1', source_file: 'b.ts' }] }
      ],
      groups: [{ name: 'Pair', member_keys: ['a', 'b'] }]
    }
    const result = run(twoComponents)
    const value = expectOk(result)
    const componentIds = value.created.components.map((component) => component.id)

    const committedGroup = result.ok ? result.outcome.changes!.committed!.groups[0] : undefined
    expect(committedGroup?.parentNodeId).toBe('api')
    expect(committedGroup?.memberIds).toEqual(componentIds)
    // Mirrored into planned with the same container ownership.
    const plannedGroup = result.ok ? result.outcome.changes!.planned!.groups[0] : undefined
    expect(plannedGroup?.parentNodeId).toBe('api')
  })

  it('keeps a legal agent link and drops unknown, self, and illegal ones', () => {
    const input: ScryerContainerFillInput = {
      container_id: 'api',
      components: [
        { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'a.ts' }] },
        { key: 'b', name: 'B', symbols: [{ key: 'b1', name: 'b1', source_file: 'b.ts' }] }
      ],
      links: [
        { src: 'a', dst: 'b', label: 'uses' },
        { src: 'a', dst: 'ghost', label: 'bad dst' },
        { src: 'a', dst: 'a', label: 'self' },
        { src: 'a1', dst: 'a', label: 'containment' }
      ]
    }
    const value = expectOk(run(input))
    expect(value.summary.keptLinks).toBe(1)
    expect(value.summary.droppedLinks).toBe(3)
    const reasons = value.reports.droppedLinks.map((link) => link.reason)
    expect(reasons.some((r) => r.includes("unknown dst 'ghost'"))).toBe(true)
    expect(reasons.some((r) => r.startsWith('self-link'))).toBe(true)
    expect(reasons.some((r) => r.startsWith('containment'))).toBe(true)
  })

  it('derives code links from build edges, lifting cross-component edges', () => {
    const input: ScryerContainerFillInput = {
      container_id: 'api',
      components: [
        {
          key: 'a',
          name: 'A',
          symbols: [
            { key: 'a1', name: 'a1', source_file: 'a.ts' },
            { key: 'a2', name: 'a2', source_file: 'a.ts' }
          ]
        },
        { key: 'b', name: 'B', symbols: [{ key: 'b1', name: 'b1', source_file: 'b.ts' }] }
      ]
    }
    const buildEdges: ScryerBuildEdgeGraph = {
      symbolEdges: [
        { src: 'a.ts#a1@1', dst: 'a.ts#a2@5' }, // intra-component -> symbol link
        { src: 'a.ts#a1@1', dst: 'b.ts#b1@1' } // cross-component -> component link
      ]
    }
    const result = run(input, { buildEdges })
    const value = expectOk(result)
    expect(value.summary.derivedLinks).toBe(2)
    expect(value.reports.edgeGraphStatus).toBe('available')

    const symbols = value.created.symbols
    const compA = value.created.components.find((c) => c.key === 'a')!
    const compB = value.created.components.find((c) => c.key === 'b')!
    const a1 = symbols.find((s) => s.key === 'a1')!.id
    const a2 = symbols.find((s) => s.key === 'a2')!.id
    const links = result.ok ? result.outcome.changes!.committed!.links : []
    expect(links).toContainEqual(expect.objectContaining({ src: a1, dst: a2 }))
    expect(links).toContainEqual(expect.objectContaining({ src: compA.id, dst: compB.id }))
  })

  it('reports edgeGraphStatus missing and empty when evidence is absent', () => {
    expect(expectOk(run(singleComponent, { buildEdges: null })).reports.edgeGraphStatus).toBe(
      'missing'
    )
    expect(
      expectOk(run(singleComponent, { buildEdges: { symbolEdges: [] } })).reports.edgeGraphStatus
    ).toBe('empty')
  })

  it('reports partially_unresolved for an in-scope unresolved endpoint but ignores unrelated edges', () => {
    const input: ScryerContainerFillInput = {
      container_id: 'api',
      components: [
        { key: 'a', name: 'A', symbols: [{ key: 'a1', name: 'a1', source_file: 'a.ts' }] }
      ]
    }
    const buildEdges: ScryerBuildEdgeGraph = {
      symbolEdges: [
        // Relevant: a.ts is a generated source file, but a.ts#missing was never
        // proposed, so the derived-link set is incomplete for this file.
        { src: 'a.ts#a1@1', dst: 'a.ts#missing@9' },
        // Wholly outside the generation scope: a global-cache edge that must be
        // ignored, never inflated into a partial-evidence claim.
        { src: 'x.ts#x1@1', dst: 'y.ts#y1@1' }
      ]
    }
    const value = expectOk(run(input, { buildEdges }))
    expect(value.reports.edgeGraphStatus).toBe('partially_unresolved')
    expect(value.summary.derivedLinks).toBe(0)
  })

  it('rejects and writes nothing when a final snapshot validator returns a blocking finding', () => {
    const committed = baseModel()
    const planned: ScryModel = JSON.parse(JSON.stringify(committed))
    const base = services(committed, planned)
    const injected: ScryerOperationServices = {
      ...base,
      validators: {
        ...base.validators,
        // A blocking finding on the final would-be snapshot is a hard error.
        validateModel: () => [
          {
            code: 'invalid_hierarchy',
            severity: 'error',
            message: 'injected snapshot failure',
            path: 'model'
          }
        ]
      }
    }
    const result = createScryerContainerGenerationPlanner({
      committed,
      planned,
      services: injected,
      buildEdges: null
    }).plan(singleComponent)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('validation_failed')
      expect(result.failure.details?.reason).toBe('generation_proposal_invalid')
    }
    // No durable changes are produced when the final snapshot check fails.
    expect('outcome' in result).toBe(false)
  })

  it('counts a shared-subtree warning once across the committed and planned snapshots', () => {
    const committed = baseModel()
    const planned: ScryModel = JSON.parse(JSON.stringify(committed))
    const base = services(committed, planned)
    // The generated subtree is identical in both layers, so validating each
    // yields the same warning; it must be surfaced and counted once.
    const injected: ScryerOperationServices = {
      ...base,
      validators: {
        ...base.validators,
        validateModel: () => [
          {
            code: 'coverage_gap',
            severity: 'warning',
            message: 'generated subtree coverage gap',
            path: 'node:node-2'
          }
        ]
      }
    }
    const result = createScryerContainerGenerationPlanner({
      committed,
      planned,
      services: injected,
      buildEdges: null
    }).plan(singleComponent)

    const value = expectOk(result)
    // Not doubled by the two-layer validation.
    expect(value.reports.warningCount).toBe(1)
    expect(value.reports.findings).toHaveLength(1)
    expect(value.reports.findings[0].code).toBe('coverage_gap')
  })

  it('still hard-errors on a blocking finding shared by both layers, unaffected by dedupe', () => {
    const committed = baseModel()
    const planned: ScryModel = JSON.parse(JSON.stringify(committed))
    const base = services(committed, planned)
    const injected: ScryerOperationServices = {
      ...base,
      validators: {
        ...base.validators,
        validateModel: () => [
          {
            code: 'invalid_hierarchy',
            severity: 'error',
            message: 'shared blocking finding',
            path: 'node:node-2'
          }
        ]
      }
    }
    const result = createScryerContainerGenerationPlanner({
      committed,
      planned,
      services: injected,
      buildEdges: null
    }).plan(singleComponent)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('validation_failed')
      const findings = result.failure.details?.findings as unknown[]
      // Deduped to the single unique blocking finding, but still rejects.
      expect(findings).toHaveLength(1)
    }
    expect('outcome' in result).toBe(false)
  })
})
