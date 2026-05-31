import { describe, expect, it } from 'vitest'
import type { C4ModelDataV2 } from '../../../../shared/scryer/model-types'
import { createDiagramRef, deleteDiagramRefs, upsertDiagramRefs } from './diagram-controller'

function modelWithDiagram(): C4ModelDataV2 {
  return {
    schemaVersion: 2,
    nodes: [
      {
        id: 'api',
        type: 'c4',
        data: {
          name: 'API',
          description: 'Backend API',
          kind: 'container'
        }
      }
    ],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    refPositions: {},
    groups: [],
    flows: [],
    diagrams: [
      {
        id: 'diagram-api-flow',
        name: 'API Flow',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD\n  api[API]'
      }
    ],
    diagramRefs: [
      {
        id: 'ref-api-flow',
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      }
    ]
  }
}

describe('S3 diagram ref controller mutations', () => {
  it('creates whole-diagram refs to existing targets and keeps diagram timestamps unchanged', () => {
    const initial = modelWithDiagram()
    const diagramBefore = initial.diagrams[0]!

    const result = createDiagramRef(initial, {
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail'
    })

    const createdRef = result.model.diagramRefs?.find((ref) => ref.id !== 'ref-api-flow')
    expect(createdRef).toMatchObject({
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail'
    })
    expect(createdRef).not.toHaveProperty('elementKey')
    expect(result.model.diagrams?.[0]).toEqual(diagramBefore)
    expect(result.changedDiagramIds).toEqual([])
  })

  it('creates element-level refs with durable elementKey and never persists svgSelector', () => {
    const initial = modelWithDiagram()

    const result = createDiagramRef(initial, {
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail',
      elementKey: 'flowchart:node:api',
      sourceRange: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 }
    })

    const createdRef = result.model.diagramRefs?.find((ref) => ref.id !== 'ref-api-flow')
    expect(createdRef).toEqual(
      expect.objectContaining({
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail',
        elementKey: 'flowchart:node:api',
        sourceRange: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 }
      })
    )
    expect(JSON.stringify(createdRef)).not.toContain('svgSelector')
  })

  it('rejects missing role and other without note before writing refs', () => {
    const initial = modelWithDiagram()

    expect(() =>
      createDiagramRef(initial, {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' }
      })
    ).toThrow(expect.objectContaining({ code: 'controller.missing-role' }))

    expect(() =>
      createDiagramRef(initial, {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'other',
        note: '   '
      })
    ).toThrow(expect.objectContaining({ code: 'controller.other-note-required' }))

    expect(initial.diagramRefs).toHaveLength(1)
  })

  it('rejects missing diagrams, missing targets, and unsafe source targets', () => {
    const initial = modelWithDiagram()

    expect(() =>
      createDiagramRef(initial, {
        diagramId: 'diagram-missing',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      })
    ).toThrow(expect.objectContaining({ code: 'controller.diagram-not-found' }))

    expect(() =>
      createDiagramRef(initial, {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'missing-node' },
        role: 'architecture-detail'
      })
    ).toThrow(expect.objectContaining({ code: 'controller.missing-target' }))

    expect(() =>
      createDiagramRef(initial, {
        diagramId: 'diagram-api-flow',
        target: { type: 'source', pattern: '../outside.ts' },
        role: 'evidence'
      })
    ).toThrow(expect.objectContaining({ code: 'controller.invalid-source-target' }))
  })

  it('upserts refs by id and deletes refs by id without updating diagrams', () => {
    const initial = modelWithDiagram()
    const diagramBefore = initial.diagrams[0]!
    const upserted = upsertDiagramRefs(initial, [
      {
        id: 'ref-api-flow',
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'sequence-detail',
        note: 'Calls through API'
      },
      {
        id: 'ref-source-safe',
        diagramId: 'diagram-api-flow',
        target: { type: 'source', pattern: './src\\api.ts', line: 2, endLine: 4 },
        role: 'evidence'
      }
    ])

    expect(upserted.model.diagramRefs).toEqual([
      {
        id: 'ref-api-flow',
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'sequence-detail',
        note: 'Calls through API'
      },
      {
        id: 'ref-source-safe',
        diagramId: 'diagram-api-flow',
        target: { type: 'source', pattern: 'src/api.ts', line: 2, endLine: 4 },
        role: 'evidence'
      }
    ])
    expect(upserted.model.diagrams?.[0]).toEqual(diagramBefore)

    const deleted = deleteDiagramRefs(upserted.model, ['ref-api-flow'])
    expect(deleted.deletedDiagramRefIds).toEqual(['ref-api-flow'])
    expect(deleted.model.diagramRefs).toEqual([
      {
        id: 'ref-source-safe',
        diagramId: 'diagram-api-flow',
        target: { type: 'source', pattern: 'src/api.ts', line: 2, endLine: 4 },
        role: 'evidence'
      }
    ])
    expect(deleted.model.diagrams?.[0]).toEqual(diagramBefore)
  })
})
