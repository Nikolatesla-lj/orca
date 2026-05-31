import type { Diagram, DiagramKind, DiagramRefTarget } from './model-types'

export const DIAGRAM_KIND_ORDER: DiagramKind[] = [
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'architecture',
  'gitGraph',
  'c4',
  'gantt',
  'journey',
  'mindmap',
  'timeline',
  'requirement',
  'quadrant',
  'xy',
  'block',
  'packet',
  'kanban',
  'other'
]

const DIAGRAM_ID_MAX_LENGTH = 120
const SHORT_ID_LENGTH = 8

function createShortId(): string {
  const uuidHex = globalThis.crypto.randomUUID().replace(/-/g, '')
  return BigInt(`0x${uuidHex.slice(0, 16)}`)
    .toString(36)
    .padStart(SHORT_ID_LENGTH, '0')
    .slice(0, SHORT_ID_LENGTH)
    .toLowerCase()
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

function withMaxLength(prefix: string, slug: string, shortId: string): string {
  const maxSlugLength = DIAGRAM_ID_MAX_LENGTH - prefix.length - 1 - shortId.length
  return `${prefix}${slug.slice(0, Math.max(0, maxSlugLength)).replace(/-+$/g, '') || 'untitled'}-${shortId}`
}

export function createDiagramId(name: string, existingIds: Set<string>): string {
  let id = ''
  do {
    id = withMaxLength('diagram-', slugifyName(name), createShortId())
  } while (existingIds.has(id))
  return id
}

export function createDiagramRefId(
  target: DiagramRefTarget,
  diagramId: string,
  existingIds: Set<string>
): string {
  void diagramId
  let id = ''
  do {
    id = `diagram-ref-${target.type}-${createShortId()}`
  } while (existingIds.has(id))
  return id
}

function normalizedDiagramName(diagram: Diagram): string {
  return diagram.name.trim().toLocaleLowerCase()
}

export function sortDiagramsForLibrary(diagrams: Diagram[]): Diagram[] {
  const order = new Map(DIAGRAM_KIND_ORDER.map((kind, index) => [kind, index]))
  return [...diagrams].sort((left, right) => {
    const leftKind = order.get(left.kind) ?? order.get('other')!
    const rightKind = order.get(right.kind) ?? order.get('other')!
    if (leftKind !== rightKind) {
      return leftKind - rightKind
    }

    const nameCompare = normalizedDiagramName(left).localeCompare(normalizedDiagramName(right))
    if (nameCompare !== 0) {
      return nameCompare
    }

    if (left.updatedAt && right.updatedAt && left.updatedAt !== right.updatedAt) {
      return left.updatedAt.localeCompare(right.updatedAt)
    }

    return left.id.localeCompare(right.id)
  })
}
