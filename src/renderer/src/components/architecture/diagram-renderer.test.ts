// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Diagram, DiagramKind } from '../../../../shared/scryer/model-types'
import { detectMermaidDiagramKind } from '../../../../shared/scryer/diagram-kind'
import { detectDiagramKind, renderDiagram } from './diagram-renderer'
import {
  getMermaidRenderQueueDiagnostics,
  resetMermaidRenderQueueDiagnostics
} from './mermaid-render-queue'

class TestCSSStyleSheet {
  cssRules: { cssText: string }[] = []

  replaceSync(): void {
    this.cssRules = []
  }

  insertRule(rule: string): number {
    this.cssRules.push({ cssText: rule })
    return this.cssRules.length - 1
  }
}

Object.defineProperty(globalThis, 'CSSStyleSheet', {
  configurable: true,
  value: globalThis.CSSStyleSheet ?? TestCSSStyleSheet
})

Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
  configurable: true,
  value() {
    return (this.textContent ?? '').length * 8
  }
})

Object.defineProperty(SVGElement.prototype, 'getBBox', {
  configurable: true,
  value() {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, (this.textContent ?? '').length * 8),
      height: 16
    }
  }
})

const FIXTURE_DIR = path.join(
  process.cwd(),
  'src',
  'shared',
  'scryer',
  '__fixtures__',
  'diagram-library'
)

function readFixture(filename: string): string {
  return readFileSync(path.join(FIXTURE_DIR, filename), 'utf8')
}

function makeDiagram(filename: string, kind: DiagramKind): Diagram {
  return {
    id: `diagram-${kind}`,
    name: `${kind} diagram`,
    kind,
    notation: 'mermaid',
    source: readFixture(filename)
  }
}

describe('diagram renderer adapter', () => {
  it('delegates renderer kind detection to the shared Mermaid helper', () => {
    const source = readFixture('valid-mermaid-flowchart.mmd')

    expect(detectDiagramKind(source)).toEqual(detectMermaidDiagramKind(source))
  })

  it.each([
    ['valid-mermaid-flowchart.mmd', 'flowchart'],
    ['valid-mermaid-sequence.mmd', 'sequence'],
    ['valid-mermaid-class.mmd', 'class'],
    ['valid-mermaid-state.mmd', 'state'],
    ['valid-mermaid-er.mmd', 'er']
  ] as const)('renders sanitized SVG for core Mermaid fixture %s', async (filename, kind) => {
    const result = await renderDiagram(makeDiagram(filename, kind), {
      theme: 'light',
      outputProfile: 'review'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => d.message).join('\n'))
    }
    expect(result.svg).toContain('<svg')
    expect(result.svg).not.toMatch(/<script/i)
    expect(result.svg).not.toMatch(/\son[a-z]+\s*=/i)
    expect(result.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.rendererVersion).toMatch(/^mermaid@.+\|adapter@.+\|dompurify@.+$/)
    expect(result.diagnostics.every((diagnostic) => diagnostic.code.startsWith('renderer.'))).toBe(
      true
    )
  })

  it('returns stable bindable element keys and annotates rendered flowchart SVG', async () => {
    const diagram = makeDiagram('valid-mermaid-flowchart.mmd', 'flowchart')

    const first = await renderDiagram(diagram, { theme: 'light', outputProfile: 'review' })
    const second = await renderDiagram(diagram, { theme: 'light', outputProfile: 'review' })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      throw new Error('expected flowchart render to succeed')
    }
    expect(first.elements.length).toBeGreaterThan(0)
    expect(first.elements.map((element) => element.elementKey)).toEqual(
      second.elements.map((element) => element.elementKey)
    )
    expect(first.elements[0]?.elementKey).toMatch(/^flowchart:node:/)
    expect(first.svg).toContain('data-diagram-element-key=')
  })

  it.each([
    ['valid-mermaid-architecture-beta.mmd', 'architecture', 'architecture-beta'],
    ['valid-mermaid-gitgraph.mmd', 'gitGraph', 'gitGraph'],
    ['valid-mermaid-c4context.mmd', 'c4', 'C4Context']
  ] as const)(
    'records explicit support status for non-core fixture %s',
    async (filename, expectedKind, directive) => {
      const diagram = makeDiagram(filename, expectedKind)
      const result = await renderDiagram(diagram, { theme: 'light', outputProfile: 'review' })

      expect(detectDiagramKind(diagram.source)).toMatchObject({
        kind: expectedKind,
        directive
      })
      if (result.ok) {
        expect(result.svg).toContain('<svg')
        expect(result.svg).not.toMatch(/\son[a-z]+\s*=/i)
      } else {
        expect(result.diagnostics[0]).toMatchObject({
          code: 'renderer.unsupported-kind',
          severity: 'error'
        })
        expect(result.diagnostics[0]?.message).toContain(directive)
        expect(result.diagnostics[0]?.message).toContain('adapter')
      }
    }
  )

  it('returns renderer.invalid-source for invalid Mermaid without mutating source', async () => {
    const diagram = makeDiagram('invalid-mermaid-syntax.mmd', 'flowchart')
    const originalSource = diagram.source

    const result = await renderDiagram(diagram, { theme: 'light', outputProfile: 'review' })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'renderer.invalid-source',
      severity: 'error'
    })
    expect(result.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(diagram.source).toBe(originalSource)
  })

  it('serializes concurrent render calls through the shared Mermaid queue', async () => {
    resetMermaidRenderQueueDiagnostics()

    const results = await Promise.all([
      renderDiagram(makeDiagram('valid-mermaid-flowchart.mmd', 'flowchart'), {
        theme: 'light',
        outputProfile: 'review'
      }),
      renderDiagram(makeDiagram('valid-mermaid-sequence.mmd', 'sequence'), {
        theme: 'light',
        outputProfile: 'review'
      }),
      renderDiagram(makeDiagram('valid-mermaid-class.mmd', 'class'), {
        theme: 'light',
        outputProfile: 'review'
      })
    ])

    expect(results.every((result) => result.ok)).toBe(true)
    expect(getMermaidRenderQueueDiagnostics()).toMatchObject({
      active: 0,
      maxConcurrent: 1,
      started: 3,
      completed: 3
    })
  })

  it('renders the FX11 large Mermaid flowchart fixture through the real adapter', async () => {
    const result = await renderDiagram(
      makeDiagram('large-mermaid-flowchart-200.mmd', 'flowchart'),
      {
        theme: 'light',
        outputProfile: 'review'
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
    }
    expect(result.svg).toContain('<svg')
    expect(result.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  }, 20_000)
})
