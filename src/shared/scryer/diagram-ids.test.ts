import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiagramId, createDiagramRefId, sortDiagramsForLibrary } from './diagram-ids'
import type { Diagram } from './model-types'

describe('diagram id helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates diagram ids with slug fallback, allowed characters, collision retry, and max length', () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    const existing = new Set([createDiagramId('???', new Set())])
    const id = createDiagramId(
      'A very long diagram name with spaces and punctuation !@#$%^&*() repeated '.repeat(3),
      existing
    )

    expect(randomUUID).toHaveBeenCalledTimes(2)
    expect(id).toMatch(/^diagram-[a-z0-9-]+-[a-z0-9]{8}$/)
    expect(id.length).toBeLessThanOrEqual(120)
    expect(id).not.toBe('diagram-untitled-00000001')
  })

  it('creates diagramRef ids from target type and retries collisions', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    const first = createDiagramRefId({ type: 'node', id: 'api' }, 'diagram-api', new Set())
    const second = createDiagramRefId({ type: 'node', id: 'api' }, 'diagram-api', new Set([first]))

    expect(first).toMatch(/^diagram-ref-node-[a-z0-9]{8}$/)
    expect(second).toMatch(/^diagram-ref-node-[a-z0-9]{8}$/)
    expect(second).not.toBe(first)
  })

  it('sorts diagrams by kind order, normalized name, updatedAt, then id', () => {
    const diagrams: Diagram[] = [
      {
        id: 'z',
        name: 'Beta',
        kind: 'sequence',
        notation: 'mermaid',
        source: 'sequenceDiagram'
      },
      {
        id: 'b',
        name: 'alpha',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD',
        updatedAt: '2026-05-26T02:00:00.000Z'
      },
      {
        id: 'a',
        name: ' Alpha ',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD',
        updatedAt: '2026-05-26T01:00:00.000Z'
      },
      {
        id: 'c',
        name: 'alpha',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD'
      }
    ]

    expect(sortDiagramsForLibrary(diagrams).map((diagram) => diagram.id)).toEqual([
      'a',
      'b',
      'c',
      'z'
    ])
  })
})
