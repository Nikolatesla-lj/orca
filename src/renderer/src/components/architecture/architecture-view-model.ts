import type { ArchitectureViewDto } from '../../../../shared/scryer/architecture-view'
import type {
  ArchitectureDiagramKind,
  ArchitectureDiagramLink,
  ArchitectureDiagramModel,
  ArchitectureDiagramNode
} from './architecture-diagram-types'

function diagramKind(kind: ArchitectureViewDto['nodes'][number]['kind']): ArchitectureDiagramKind {
  return kind === 'symbol' ? 'operation' : kind
}

function nodeType(kind: ArchitectureDiagramKind): ArchitectureDiagramNode['type'] {
  return kind === 'operation' || kind === 'process' || kind === 'model' ? kind : 'architecture'
}

export function architectureViewToDiagramModel(
  view: ArchitectureViewDto,
  projectPath: string
): ArchitectureDiagramModel {
  return {
    projectPath,
    nodes: view.nodes.map((node): ArchitectureDiagramNode => {
      const kind = diagramKind(node.kind)
      return {
        id: node.id,
        type: nodeType(kind),
        parentId: node.parentId,
        position: { x: 0, y: 0 },
        data: {
          name: node.name,
          description: node.description ?? '',
          kind,
          ...(node.technology !== undefined ? { technology: node.technology } : {}),
          ...(node.external !== undefined ? { external: node.external } : {}),
          ...(node.properties
            ? {
                properties: node.properties.map((property) => ({
                  label: property.label,
                  description: property.description ?? ''
                }))
              }
            : {}),
          ...(node.notes ? { notes: [node.notes] } : {}),
          _needsLayout: true
        }
      }
    }),
    links: view.links.map(
      (link): ArchitectureDiagramLink => ({
        id: link.id,
        source: link.src,
        target: link.dst,
        data: {
          label: link.label,
          ...(link.method !== undefined ? { method: link.method } : {})
        }
      })
    ),
    groups: view.groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberIds: group.memberIds,
      ...(group.description !== undefined ? { description: group.description } : {}),
      ...(group.parentGroupId !== undefined ? { parentGroupId: group.parentGroupId } : {}),
      ...(group.parentNodeId !== undefined ? { parentNodeId: group.parentNodeId } : {})
    })),
    sourceMap: view.sourceMap,
    boundaries: view.boundaries,
    refPositions: {}
  }
}
