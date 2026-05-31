import { describe, expect, it } from 'vitest'
import { detectMermaidDiagramKind, getMermaidSourceDirective } from './diagram-kind'

describe('Mermaid diagram kind detection', () => {
  it.each([
    ['flowchart TD', 'flowchart'],
    ['graph LR', 'flowchart'],
    ['sequenceDiagram', 'sequence'],
    ['classDiagram', 'class'],
    ['classDiagram-v2', 'class'],
    ['stateDiagram-v2', 'state'],
    ['erDiagram', 'er'],
    ['architecture-beta', 'architecture'],
    ['C4Context', 'c4'],
    ['C4Container', 'c4'],
    ['gitGraph', 'gitGraph'],
    ['requirementDiagram', 'requirement'],
    ['quadrantChart', 'quadrant'],
    ['xychart-beta', 'xy']
  ] as const)('maps %s to %s', (source, expectedKind) => {
    expect(detectMermaidDiagramKind(source)).toMatchObject({ kind: expectedKind })
  })

  it('skips BOM, frontmatter, comments, init directives, and blank lines before detection', () => {
    const source = [
      '\uFEFF',
      '---',
      'title: Ignored metadata',
      '---',
      '',
      '%% a leading comment',
      '%%{init: {"theme": "dark"}}%%',
      '  ',
      'stateDiagram-v2',
      '  [*] --> Ready'
    ].join('\n')

    expect(getMermaidSourceDirective(source)).toBe('stateDiagram-v2')
    expect(detectMermaidDiagramKind(source)).toMatchObject({ kind: 'state' })
  })

  it('returns other with an unsupported-kind warning for unknown directives', () => {
    expect(detectMermaidDiagramKind('unknownDiagram\n  A --> B')).toEqual({
      kind: 'other',
      directive: 'unknownDiagram',
      warning: expect.objectContaining({
        severity: 'warning',
        code: 'renderer.unsupported-kind'
      })
    })
  })
})
