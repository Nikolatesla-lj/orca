/* eslint-disable max-lines -- Why: parser tests cover legacy normalization plus F1A diagram validation contract cases. */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  findFlowStep,
  parseModelData,
  pruneDiagramRefsForDeletedTarget,
  serializeModelData
} from './parse-model'
import type { C4ModelDataV2 } from './model-types'

function fixturePath(name: string): string {
  return join(__dirname, '__fixtures__', 'diagram-library', name)
}

describe('parseModelData', () => {
  it('migrates legacy Scryer model fields into the current C4 model shape', () => {
    const parsed = parseModelData(
      JSON.stringify({
        nodes: [
          {
            id: 'n1',
            data: {
              name: 'API',
              description: 'Backend API',
              kind: 'container',
              guidelines: { always: 'Keep handlers small\nReturn JSON', never: ['Leak secrets'] },
              references: [{ pattern: 'src/api/**/*.ts', comment: 'HTTP handlers' }],
              notes: 'Uses Express\nOwns auth',
              status: 'changed'
            }
          },
          {
            id: 'n2',
            position: { x: 40, y: 50 },
            data: {
              name: 'createUser',
              description: 'Create a user',
              kind: 'operation',
              status: 'proposed'
            }
          }
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', data: { label: 'calls' } },
          { id: 'e1', source: 'n1', target: 'n2', data: { label: 'duplicate' } }
        ],
        scenarios: [
          {
            id: 'flow-1',
            name: 'Signup',
            steps: [{ id: 'b' }, { id: 'a' }],
            transitions: [{ source: 'a', target: 'b' }]
          }
        ]
      })
    )

    expect(parsed.nodes[0]).toMatchObject({
      id: 'n1',
      type: 'c4',
      position: { x: 0, y: 0 },
      data: {
        contract: {
          expect: ['Keep handlers small', 'Return JSON'],
          ask: [],
          never: ['Leak secrets']
        },
        sources: [{ pattern: 'src/api/**/*.ts', comment: 'HTTP handlers' }],
        notes: ['Uses Express', 'Owns auth'],
        status: undefined,
        _needsLayout: true
      }
    })
    expect(parsed.nodes[1].type).toBe('operation')
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.flows?.[0].steps.map((step) => step.id)).toEqual(['a', 'b'])
  })

  it('normalizes dirty flow branches, source maps, contracts, groups, and mention warnings', () => {
    const parsed = parseModelData(
      JSON.stringify({
        nodes: [
          {
            id: 'api',
            data: {
              name: 'API',
              description: 'Calls @[Ghost API]',
              kind: 'container',
              contract: {
                expect: [
                  {
                    text: 'Attach evidence',
                    passed: false,
                    url: ' https://example.test/evidence ',
                    image: {
                      filename: 'evidence.png',
                      mimeType: 'image/png',
                      dataUrl: 'data:image/png;base64,abc123'
                    }
                  },
                  {
                    text: 'Ignore malformed image',
                    image: { data: 42 }
                  }
                ]
              }
            }
          }
        ],
        sourceMap: {
          api: [
            { pattern: ' src/api.ts ', line: 8, endLine: 3, command: ' npm test ' },
            { pattern: '' },
            { pattern: 'src/model.ts', line: -2, endLine: 4 }
          ],
          ghost: [{ pattern: 'src/ghost.ts' }]
        },
        groups: [
          { id: 'backend', name: 'Backend', nodeIds: ['api', 'ghost'], kind: 'legacy-group' },
          { id: 42, name: 'Broken', memberIds: 'api' }
        ],
        flows: [
          {
            id: 'flow-1',
            name: 'Dirty Flow',
            steps: [
              {
                id: 'step-1',
                label: 123,
                description: 'Use @[API]',
                branches: [
                  {
                    condition: 99,
                    steps: [{ id: 'branch-step', description: 'Return @[Ghost API]' }]
                  },
                  { condition: 'empty branch', steps: 'not-an-array' }
                ]
              }
            ]
          }
        ]
      })
    )

    expect(parsed.nodes[0].data.contract?.expect[0]).toEqual({
      text: 'Attach evidence',
      passed: false,
      url: 'https://example.test/evidence',
      image: {
        filename: 'evidence.png',
        mimeType: 'image/png',
        data: 'abc123'
      }
    })
    expect(parsed.nodes[0].data.contract?.expect[1]).toEqual({
      text: 'Ignore malformed image'
    })
    expect(parsed.sourceMap).toEqual({
      api: [
        { pattern: 'src/api.ts', line: 3, endLine: 8, command: 'npm test' },
        { pattern: 'src/model.ts', endLine: 4 }
      ]
    })
    expect(parsed.groups).toEqual([{ id: 'backend', name: 'Backend', memberIds: ['api'] }])
    expect(parsed.flows?.[0].steps[0]).toMatchObject({
      id: 'step-1',
      label: '',
      branches: [
        {
          condition: '',
          steps: [{ id: 'branch-step', description: 'Return @[Ghost API]' }]
        },
        {
          condition: 'empty branch',
          steps: []
        }
      ]
    })
    expect(parsed.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'missing-mention',
          reference: 'Ghost API',
          path: 'nodes.api.description'
        }),
        expect.objectContaining({
          kind: 'missing-mention',
          reference: 'Ghost API',
          path: 'flows.flow-1.steps.branch-step.description'
        })
      ])
    )
  })

  it('normalizes legacy .scry files to schema v2 in memory without rewriting the file', async () => {
    const path = fixturePath('legacy-v1-no-diagrams.scry')
    const before = await readFile(path, 'utf8')
    const parsed = parseModelData(before) as C4ModelDataV2
    const after = await readFile(path, 'utf8')

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.diagrams).toEqual([])
    expect(parsed.diagramRefs).toEqual([])
    expect(parsed.nodes.map((node) => node.id)).toEqual(['api', 'db'])
    expect(parsed.flows?.[0]?.id).toBe('flow-signup')
    expect(after).toBe(before)
  })

  it('preserves standalone-compatible unknown top-level fields from v2 fixtures', async () => {
    const parsed = parseModelData(
      await readFile(fixturePath('standalone-roundtrip-v2.scry'), 'utf8')
    ) as C4ModelDataV2 & { compatibleUnknownTopLevel?: unknown }
    const serialized = JSON.parse(serializeModelData(parsed)) as {
      compatibleUnknownTopLevel?: unknown
      diagrams?: unknown[]
      diagramRefs?: unknown[]
    }

    expect(parsed.compatibleUnknownTopLevel).toEqual({ source: 'orca', preserve: true })
    expect(serialized.compatibleUnknownTopLevel).toEqual({ source: 'orca', preserve: true })
    expect(serialized.diagrams?.[0]).toMatchObject({
      id: 'diagram-api-flow',
      source: expect.stringContaining('api[API]')
    })
    expect(serialized.diagramRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ref-nested-step',
          target: { type: 'flowStep', flowId: 'flow-signup', stepId: 'step-nested-review' }
        })
      ])
    )
  })

  it('preserves dangling diagramRefs and reports parser warnings with stable codes', async () => {
    const parsed = parseModelData(
      await readFile(fixturePath('bad-diagram-refs.scry'), 'utf8')
    ) as C4ModelDataV2

    expect(parsed.diagrams.map((diagram) => diagram.id)).toEqual([
      'diagram-valid',
      'diagram-invalid-updated-at'
    ])
    expect(
      parsed.diagrams.find((diagram) => diagram.id === 'diagram-invalid-updated-at')
    ).not.toHaveProperty('updatedAt')
    expect(parsed.diagramRefs.map((ref) => ref.id)).toEqual([
      'ref-valid-node',
      'ref-missing-diagram',
      'ref-missing-node',
      'ref-missing-step',
      'ref-invalid-range',
      'ref-absolute-source',
      'ref-traversal-source',
      'ref-scheme-source',
      'ref-glob-source'
    ])
    expect(parsed.diagramRefs.find((ref) => ref.id === 'ref-invalid-range')).not.toHaveProperty(
      'sourceRange'
    )
    expect(parsed.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'parser.duplicate-diagram-id',
          diagramId: 'diagram-valid'
        }),
        expect.objectContaining({
          code: 'parser.invalid-updated-at',
          diagramId: 'diagram-invalid-updated-at'
        }),
        expect.objectContaining({
          code: 'parser.duplicate-ref-id',
          diagramRefId: 'ref-valid-node'
        }),
        expect.objectContaining({
          code: 'parser.missing-diagram',
          diagramRefId: 'ref-missing-diagram',
          diagramId: 'diagram-missing'
        }),
        expect.objectContaining({
          code: 'parser.missing-target',
          diagramRefId: 'ref-missing-node'
        }),
        expect.objectContaining({
          code: 'parser.missing-flow-step',
          diagramRefId: 'ref-missing-step'
        }),
        expect.objectContaining({
          code: 'parser.invalid-source-range',
          diagramRefId: 'ref-invalid-range'
        }),
        expect.objectContaining({
          code: 'parser.invalid-source-target',
          diagramRefId: 'ref-absolute-source'
        }),
        expect.objectContaining({
          code: 'parser.invalid-source-target',
          diagramRefId: 'ref-traversal-source'
        }),
        expect.objectContaining({
          code: 'parser.invalid-source-target',
          diagramRefId: 'ref-scheme-source'
        }),
        expect.objectContaining({
          code: 'parser.invalid-source-target',
          diagramRefId: 'ref-glob-source'
        })
      ])
    )
  })

  it('finds nested flow steps and prunes refs for deleted nested targets', async () => {
    const parsed = parseModelData(
      await readFile(fixturePath('nested-flow-steps.scry'), 'utf8')
    ) as C4ModelDataV2
    const flow = parsed.flows?.[0]
    if (!flow) {
      throw new Error('Expected nested-flow fixture to contain a flow')
    }

    expect(findFlowStep(flow, 'step-grandchild')?.description).toBe('Grandchild step')

    const pruned = pruneDiagramRefsForDeletedTarget(parsed.diagramRefs, {
      type: 'flowStep',
      flowId: 'flow-nested',
      stepId: 'step-child',
      flow
    })

    expect(pruned.deletedRefIds).toEqual(['ref-child', 'ref-grandchild'])
    expect(pruned.diagramRefs.map((ref) => ref.id)).toEqual(['ref-root', 'ref-sibling'])
  })

  it('serializes v2 fields and omits validation warnings and render output', async () => {
    const parsed = parseModelData(
      await readFile(fixturePath('legacy-v1-no-diagrams.scry'), 'utf8')
    ) as C4ModelDataV2
    const serialized = JSON.parse(
      serializeModelData({
        ...parsed,
        validationWarnings: [
          {
            kind: 'diagram-validation',
            path: 'diagramRefs.0',
            code: 'parser.missing-diagram',
            message: 'Missing diagram'
          }
        ],
        diagrams: [
          {
            id: 'diagram-api',
            name: 'API Detail',
            kind: 'flowchart',
            notation: 'mermaid',
            source: 'flowchart TD\n  A[API]',
            svg: '<svg />',
            diagnostics: []
          } as never
        ]
      })
    )

    expect(serialized.schemaVersion).toBe(2)
    expect(serialized.diagrams).toEqual([
      {
        id: 'diagram-api',
        name: 'API Detail',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD\n  A[API]'
      }
    ])
    expect(serialized.diagramRefs).toEqual([])
    expect(serialized.validationWarnings).toBeUndefined()
    expect(serialized.diagrams[0].svg).toBeUndefined()
    expect(serialized.diagrams[0].diagnostics).toBeUndefined()
  })
})
