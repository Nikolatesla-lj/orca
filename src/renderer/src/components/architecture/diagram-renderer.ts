import DOMPurify from 'dompurify'
import type {
  Diagram,
  DiagramDiagnostic,
  DiagramKind,
  DiagramRenderResult,
  DiagramRenderedElement,
  DiagramSourceRange
} from '../../../../shared/scryer/model-types'
import {
  detectMermaidDiagramKind,
  type DetectedDiagramKind
} from '../../../../shared/scryer/diagram-kind'
import { getMermaidConfig } from '../editor/mermaid-config'
import { renderMermaidSvg } from './mermaid-render-queue'

export type DiagramCacheOutputProfile = 'review' | 'thumbnail' | 'export'
export type DiagramRenderTheme = 'light' | 'dark'

export type DiagramRenderOptions = {
  theme: DiagramRenderTheme
  outputProfile: DiagramCacheOutputProfile
}

export type DiagramRenderAdapter = {
  detectDiagramKind(source: string): DetectedDiagramKind
  getRendererVersion?: () => string
  renderDiagram(diagram: Diagram, options: DiagramRenderOptions): Promise<DiagramRenderResult>
  extractRenderedElements(source: string, svg: string, kind: DiagramKind): DiagramRenderedElement[]
}

const CORE_MERMAID_KINDS = new Set<DiagramKind>(['flowchart', 'sequence', 'class', 'state', 'er'])

export const DIAGRAM_RENDERER_VERSION = `mermaid@unknown|adapter@1|dompurify@${DOMPurify.version ?? 'unknown'}`

let renderCounter = 0

export function detectDiagramKind(source: string): DetectedDiagramKind {
  return detectMermaidDiagramKind(source)
}

export async function renderDiagram(
  diagram: Diagram,
  options: DiagramRenderOptions
): Promise<DiagramRenderResult> {
  const sourceHash = await computeSourceHash(diagram.source)
  const detected = detectDiagramKind(diagram.source)
  const diagnostics = collectRenderWarnings(diagram, detected)

  if (!CORE_MERMAID_KINDS.has(detected.kind)) {
    return {
      ok: false,
      diagnostics: [createUnsupportedKindDiagnostic(detected), ...diagnostics],
      sourceHash,
      rendererVersion: DIAGRAM_RENDERER_VERSION
    }
  }

  try {
    const rawSvg = await renderMermaidSvg(
      nextRenderId(diagram.id),
      diagram.source,
      getMermaidConfig(options.theme === 'dark', false)
    )
    const { svg, elements } = annotateBindableElements(diagram.source, rawSvg, detected.kind)
    const sanitizedSvg = sanitizeSvg(svg)
    if (!sanitizedSvg.includes('<svg')) {
      return {
        ok: false,
        diagnostics: [createSanitizationDiagnostic(diagram.id, sourceHash), ...diagnostics],
        sourceHash,
        rendererVersion: DIAGRAM_RENDERER_VERSION
      }
    }
    return {
      ok: true,
      svg: sanitizedSvg,
      elements,
      diagnostics,
      sourceHash,
      rendererVersion: DIAGRAM_RENDERER_VERSION
    }
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createInvalidSourceDiagnostic(error), ...diagnostics],
      sourceHash,
      rendererVersion: DIAGRAM_RENDERER_VERSION
    }
  }
}

export function extractRenderedElements(
  source: string,
  svg: string,
  kind: DiagramKind
): DiagramRenderedElement[] {
  return annotateBindableElements(source, svg, kind).elements
}

export const defaultDiagramRenderAdapter: DiagramRenderAdapter = {
  detectDiagramKind,
  getRendererVersion: () => DIAGRAM_RENDERER_VERSION,
  renderDiagram,
  extractRenderedElements
}

function collectRenderWarnings(
  diagram: Diagram,
  detected: DetectedDiagramKind
): DiagramDiagnostic[] {
  const diagnostics: DiagramDiagnostic[] = []
  if (detected.warning) {
    diagnostics.push(detected.warning)
  }
  if (detected.kind !== 'other' && detected.kind !== diagram.kind) {
    diagnostics.push({
      severity: 'warning',
      code: 'renderer.kind-conflict',
      message: `Diagram kind '${diagram.kind}' differs from source directive kind '${detected.kind}'.`
    })
  }
  return diagnostics
}

function createUnsupportedKindDiagnostic(detected: DetectedDiagramKind): DiagramDiagnostic {
  const directive = detected.directive ?? 'unknown'
  return {
    severity: 'error',
    code: 'renderer.unsupported-kind',
    message: `Unsupported Mermaid directive '${directive}' for adapter ${DIAGRAM_RENDERER_VERSION}.`
  }
}

function createInvalidSourceDiagnostic(error: unknown): DiagramDiagnostic {
  const message = error instanceof Error ? error.message : 'Invalid Mermaid source.'
  const line = extractFirstNumber(message, /line\s+(\d+)/i)
  const column = extractFirstNumber(message, /column\s+(\d+)/i)
  return {
    severity: 'error',
    code: 'renderer.invalid-source',
    message,
    ...(line ? { line } : {}),
    ...(column ? { column } : {})
  }
}

function createSanitizationDiagnostic(
  diagramId: string,
  sourceHash: `sha256:${string}`
): DiagramDiagnostic {
  return {
    severity: 'error',
    code: 'renderer.sanitization-failed',
    message: `Renderer could not sanitize SVG for diagram '${diagramId}' (${sourceHash}).`
  }
}

function extractFirstNumber(message: string, pattern: RegExp): number | undefined {
  const value = pattern.exec(message)?.[1]
  if (!value) {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function nextRenderId(diagramId: string): string {
  renderCounter += 1
  return `diagram-render-${diagramId.replace(/[^A-Za-z0-9_-]/g, '-')}-${renderCounter}`
}

function sanitizeSvg(svg: string): string {
  return String(
    DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true },
      ADD_ATTR: ['data-diagram-element-key']
    })
  )
}

function annotateBindableElements(
  source: string,
  svg: string,
  kind: DiagramKind
): { svg: string; elements: DiagramRenderedElement[] } {
  const candidates = extractSourceElementCandidates(source, kind)
  if (candidates.length === 0 || typeof DOMParser === 'undefined') {
    return { svg, elements: [] }
  }

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const elements: DiagramRenderedElement[] = []

  for (const candidate of candidates) {
    const svgElement = findRenderedElement(document, candidate)
    if (!svgElement) {
      continue
    }
    svgElement.setAttribute('data-diagram-element-key', candidate.elementKey)
    elements.push({
      elementKey: candidate.elementKey,
      label: candidate.label,
      kind: candidate.kind,
      sourceRange: candidate.sourceRange,
      svgSelector: svgElement.id ? `#${escapeCssIdentifier(svgElement.id)}` : undefined
    })
  }

  return {
    svg: new XMLSerializer().serializeToString(document.documentElement),
    elements
  }
}

type SourceElementCandidate = {
  sourceId: string
  elementKey: string
  label: string
  kind: string
  sourceRange: DiagramSourceRange
}

function extractSourceElementCandidates(
  source: string,
  kind: DiagramKind
): SourceElementCandidate[] {
  if (kind !== 'flowchart') {
    return []
  }

  const candidates = new Map<string, SourceElementCandidate>()
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const nodePattern =
    /\b([A-Za-z][A-Za-z0-9_-]*)\s*(?:\[(.+?)\]|\(\((.+?)\)\)|\((.+?)\)|\{(.+?)\})/g

  lines.forEach((line, index) => {
    nodePattern.lastIndex = 0
    let match: RegExpExecArray | null = nodePattern.exec(line)
    while (match) {
      const sourceId = match[1]!
      if (!candidates.has(sourceId)) {
        const label = normalizeMermaidLabel(
          match[2] ?? match[3] ?? match[4] ?? match[5] ?? sourceId
        )
        candidates.set(sourceId, {
          sourceId,
          elementKey: `flowchart:node:${normalizeElementKeyPart(sourceId)}`,
          label,
          kind: 'node',
          sourceRange: {
            startLine: index + 1,
            startColumn: match.index + 1,
            endLine: index + 1,
            endColumn: match.index + match[0].length + 1
          }
        })
      }
      match = nodePattern.exec(line)
    }
  })

  return [...candidates.values()]
}

function normalizeMermaidLabel(label: string): string {
  return label
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\(|\)$/g, '')
    .trim()
}

function normalizeElementKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function findRenderedElement(
  document: Document,
  candidate: SourceElementCandidate
): Element | null {
  const sourceId = candidate.sourceId.toLowerCase()
  const nodeGroups = [...document.querySelectorAll('g.node, g[class~="node"], g[id]')]

  return (
    nodeGroups.find((element) => {
      const id = element.id.toLowerCase()
      return id === sourceId || id.includes(`flowchart-${sourceId}-`) || id.includes(`${sourceId}-`)
    }) ??
    nodeGroups.find((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      return text === candidate.label || text.includes(candidate.label)
    }) ??
    null
  )
}

function escapeCssIdentifier(value: string): string {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value)
  }
  return value.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`)
}

async function computeSourceHash(source: string): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(source.replace(/\r\n?/g, '\n'))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}
