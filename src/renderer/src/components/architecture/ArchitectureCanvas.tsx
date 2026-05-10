import { useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider
} from '@xyflow/react'
import type {
  Connection,
  DefaultEdgeOptions,
  OnEdgesChange,
  OnConnect,
  OnNodesChange
} from '@xyflow/react'
import { ChevronRight, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type {
  C4Edge,
  C4ModelData,
  C4Node,
  SourceLocation
} from '../../../../shared/scryer/model-types'
import {
  applyNodePositionChangesToModel,
  createNodeForParent,
  deleteNodesFromModel,
  getVisibleArchitectureView
} from './c4-model'
import { Button } from '../ui/button'
import { edgeTypes, type ArchitectureFlowEdge } from './edges'
import { autoLayoutVisibleNodes, decorateEdgesForRouting } from './layout/architecture-layout'
import { nodeTypes, type ArchitectureFlowNode } from './nodes'

type ArchitectureCanvasProps = {
  model: C4ModelData
  syncing: boolean
  expandedPath: string[]
  selectedNodeId: string | null
  driftedNodeIds: Set<string>
  onExpandedPathChange: (path: string[]) => void
  onSelectedNodeChange: (nodeId: string | null) => void
  onModelChange: (change: C4ModelData | ModelUpdater, message: string) => void | Promise<void>
  onOpenSourceLocation: (location: SourceLocation) => void | Promise<void>
}

export type ModelUpdater = (current: C4ModelData) => C4ModelData | null

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'relationship'
}

export function ArchitectureCanvas(props: ArchitectureCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ArchitectureCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function ArchitectureCanvasInner({
  model,
  syncing,
  expandedPath,
  selectedNodeId,
  driftedNodeIds,
  onExpandedPathChange,
  onSelectedNodeChange,
  onModelChange,
  onOpenSourceLocation
}: ArchitectureCanvasProps): React.JSX.Element {
  const view = useMemo(
    () => getVisibleArchitectureView({ model, expandedPath, driftedNodeIds }),
    [driftedNodeIds, expandedPath, model]
  )
  const selectedNode = selectedNodeId
    ? (model.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null

  const visibleNodes = useMemo<ArchitectureFlowNode[]>(
    () =>
      view.visibleNodes.map((node) =>
        toFlowNode(node, {
          selected: node.id === selectedNodeId,
          data: {
            sourceLocations: model.sourceMap?.[node.id] ?? [],
            onExpand: () => onExpandedPathChange([...expandedPath, node.id]),
            onOpenSourceLocation
          }
        })
      ),
    [
      expandedPath,
      model.sourceMap,
      onExpandedPathChange,
      onOpenSourceLocation,
      selectedNodeId,
      view.visibleNodes
    ]
  )

  const visibleEdges = useMemo<ArchitectureFlowEdge[]>(
    () =>
      decorateEdgesForRouting(view.visibleNodes, view.visibleEdges).map((edge) => ({
        ...edge,
        type: 'relationship',
        data: edge.data ?? { label: '' }
      })),
    [view.visibleEdges, view.visibleNodes]
  )

  const onNodesChange = useCallback<OnNodesChange<ArchitectureFlowNode>>(
    (changes) => {
      const selection = changes.find((change) => change.type === 'select' && change.selected)
      if (selection) {
        if ('id' in selection) {
          onSelectedNodeChange(selection.id)
        }
      }
      if (syncing) {
        return
      }
      const removedIds = changes.flatMap((change) =>
        change.type === 'remove' && 'id' in change && !view.refNodeIds.has(change.id)
          ? [change.id]
          : []
      )
      if (removedIds.length > 0) {
        void onModelChange(
          (current) => deleteNodesFromModel(current, removedIds),
          'Deleted architecture nodes'
        )
        return
      }
      void onModelChange(
        (current) => applyNodePositionChangesToModel(current, changes, view.refNodeIds),
        'Saved canvas layout'
      )
    },
    [onModelChange, onSelectedNodeChange, syncing, view.refNodeIds]
  )

  const onEdgesChange = useCallback<OnEdgesChange<ArchitectureFlowEdge>>(
    (changes) => {
      if (syncing) {
        return
      }
      const removedIds = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id)
      )
      if (removedIds.size > 0) {
        void onModelChange(
          (current) => ({
            ...current,
            edges: current.edges.filter((edge) => !removedIds.has(edge.id))
          }),
          'Saved architecture edges'
        )
      }
    },
    [onModelChange, syncing]
  )

  const onConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (
        syncing ||
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        return
      }
      const edgeId = `edge-${connection.source}-${connection.target}`
      void onModelChange((current) => {
        if (current.edges.some((edge) => edge.id === edgeId)) {
          return null
        }
        const nextEdges: C4Edge[] = [
          ...current.edges,
          {
            id: edgeId,
            source: connection.source,
            target: connection.target,
            data: { label: '' }
          }
        ]
        return { ...current, edges: nextEdges }
      }, 'Saved architecture edge')
    },
    [onModelChange, syncing]
  )

  const addNodeAtLevel = useCallback(() => {
    if (syncing) {
      return
    }
    const parent = view.currentParentId
      ? (model.nodes.find((node) => node.id === view.currentParentId) ?? null)
      : null
    const node = createNodeForParent(model, parent)
    void onModelChange({ ...model, nodes: [...model.nodes, node] }, `Added ${node.data.name}`)
    onSelectedNodeChange(node.id)
  }, [model, onModelChange, onSelectedNodeChange, syncing, view.currentParentId])

  const deleteSelected = useCallback(() => {
    if (syncing || !selectedNode) {
      return
    }
    const nextModel = deleteNodesFromModel(model, [selectedNode.id])
    void onModelChange(nextModel, `Deleted ${selectedNode.data.name}`)
    onSelectedNodeChange(nextModel.nodes[0]?.id ?? null)
  }, [model, onModelChange, onSelectedNodeChange, selectedNode, syncing])

  const autoLayout = useCallback(() => {
    if (syncing) {
      return
    }
    const layoutNodes = autoLayoutVisibleNodes(view.visibleNodes, view.visibleEdges, {
      codeLevel: view.currentParentKind === 'component',
      fullRelayout: true
    })
    const positions = new Map(
      layoutNodes
        .filter((node) => !node.data._reference && node.position)
        .map((node) => [node.id, node.position!])
    )
    if (positions.size === 0) {
      return
    }
    void onModelChange((current) => {
      let changed = false
      const nodes = current.nodes.map((node) => {
        const position = positions.get(node.id)
        if (!position) {
          return node
        }
        if (node.position?.x === position.x && node.position.y === position.y) {
          return node
        }
        changed = true
        return { ...node, position }
      })
      return changed ? { ...current, nodes } : null
    }, 'Saved auto layout')
  }, [onModelChange, syncing, view.currentParentKind, view.visibleEdges, view.visibleNodes])

  const navigateToRoot = useCallback(() => onExpandedPathChange([]), [onExpandedPathChange])
  const navigateToBreadcrumb = useCallback(
    (index: number) => onExpandedPathChange(expandedPath.slice(0, index + 1)),
    [expandedPath, onExpandedPathChange]
  )

  return (
    <div className="relative flex-1 overflow-hidden" data-testid="architecture-canvas">
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={({ nodes }) => {
          const node = nodes[0]
          if (node) {
            onSelectedNodeChange(node.id)
          }
        }}
        onPaneClick={() => onSelectedNodeChange(null)}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={!syncing}
        nodesConnectable={!syncing}
        elementsSelectable
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} variant={BackgroundVariant.Dots} size={1} color="var(--grid-color)" />
        <MiniMap pannable zoomable className="!bg-background/90" />
        <Controls showInteractive={!syncing}>
          <button
            type="button"
            title="Auto layout"
            className="react-flow__controls-button"
            onClick={autoLayout}
            data-testid="architecture-auto-layout"
            disabled={syncing}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </Controls>
        <Panel position="top-left" className="!m-3">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-1 shadow-sm">
            <Button variant="ghost" size="xs" onClick={navigateToRoot}>
              Root
            </Button>
            {expandedPath.map((nodeId, index) => {
              const node = model.nodes.find((candidate) => candidate.id === nodeId)
              return (
                <div key={nodeId} className="flex items-center gap-1">
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <Button variant="ghost" size="xs" onClick={() => navigateToBreadcrumb(index)}>
                    {node?.data.name ?? nodeId}
                  </Button>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel position="top-center" className="!m-3">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-1 shadow-sm">
            <Button
              variant="ghost"
              size="xs"
              onClick={addNodeAtLevel}
              disabled={syncing}
              data-testid="architecture-canvas-add-node"
            >
              <Plus className="size-3" />
              Add
            </Button>
            {selectedNode ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:text-destructive"
                onClick={deleteSelected}
                disabled={syncing}
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
            ) : null}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}

function toFlowNode(
  node: C4Node,
  options: { selected: boolean; data: Record<string, unknown> }
): ArchitectureFlowNode {
  return {
    id: node.id,
    type: node.type ?? 'c4',
    position: node.position ?? { x: 0, y: 0 },
    dragHandle: '.architecture-node-title',
    data: {
      ...node.data,
      _inspectorSelected: options.selected,
      ...options.data
    }
  }
}
