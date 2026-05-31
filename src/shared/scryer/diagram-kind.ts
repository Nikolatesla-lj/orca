import type { DiagramDiagnostic, DiagramKind } from './model-types'

export type DetectedDiagramKind = {
  kind: DiagramKind
  directive?: string
  warning?: DiagramDiagnostic
}

const DIRECTIVE_TO_KIND: Record<string, DiagramKind> = {
  flowchart: 'flowchart',
  graph: 'flowchart',
  sequenceDiagram: 'sequence',
  classDiagram: 'class',
  'classDiagram-v2': 'class',
  stateDiagram: 'state',
  'stateDiagram-v2': 'state',
  erDiagram: 'er',
  'architecture-beta': 'architecture',
  C4Context: 'c4',
  C4Container: 'c4',
  C4Component: 'c4',
  C4Dynamic: 'c4',
  C4Deployment: 'c4',
  gantt: 'gantt',
  journey: 'journey',
  gitGraph: 'gitGraph',
  mindmap: 'mindmap',
  timeline: 'timeline',
  requirementDiagram: 'requirement',
  quadrantChart: 'quadrant',
  'xychart-beta': 'xy',
  'block-beta': 'block',
  'packet-beta': 'packet',
  kanban: 'kanban'
}

function lineLooksLikeMermaidInitDirective(line: string): boolean {
  return line.startsWith('%%{') && line.endsWith('}%%')
}

export function getMermaidSourceDirective(source: string): string | null {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  let index = 0

  while (index < lines.length && !lines[index]!.trim()) {
    index += 1
  }

  if (lines[index]?.trim() === '---') {
    index += 1
    while (index < lines.length && lines[index]!.trim() !== '---') {
      index += 1
    }
    if (lines[index]?.trim() === '---') {
      index += 1
    }
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (!line || line.startsWith('%%') || lineLooksLikeMermaidInitDirective(line)) {
      continue
    }
    return line.split(/\s+/)[0] ?? null
  }

  return null
}

export function detectMermaidDiagramKind(source: string): DetectedDiagramKind {
  const directive = getMermaidSourceDirective(source)
  if (!directive) {
    return { kind: 'other' }
  }

  const kind = DIRECTIVE_TO_KIND[directive]
  if (kind) {
    return { kind, directive }
  }

  return {
    kind: 'other',
    directive,
    warning: {
      severity: 'warning',
      code: 'renderer.unsupported-kind',
      message: `Unsupported Mermaid directive '${directive}'`
    }
  }
}
