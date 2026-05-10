import { describe, expect, it } from 'vitest'
import { parseModelData } from './parse-model'

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
})
