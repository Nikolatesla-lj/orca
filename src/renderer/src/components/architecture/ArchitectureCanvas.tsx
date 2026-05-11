/* eslint-disable max-lines -- Why: this canvas still owns selection, drill-in, edge editing, and layout wiring until the remaining Scryer panel logic is split out. */
import { useCallback, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal
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
  deleteEdgesFromModel,
  deleteNodesFromModel,
  deleteReferenceEdgesFromModel,
  getVisibleGroupBubbles,
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
  selectedEdgeId: string | null
  multiSelectedNodeIds: string[]
  changedNodeIds: Set<string>
  driftedNodeIds: Set<string>
  onExpandedPathChange: (path: string[]) => void
  onSelectedNodeChange: (nodeId: string | null) => void
  onSelectedEdgeChange: (edgeId: string | null) => void
  onMultiSelectionChange: (nodeIds: string[], totalSelected: number) => void
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
  selectedEdgeId,
  multiSelectedNodeIds,
  changedNodeIds,
  driftedNodeIds,
  onExpandedPathChange,
  onSelectedNodeChange,
  onSelectedEdgeChange,
  onMultiSelectionChange,
  onModelChange,
  onOpenSourceLocation
}: ArchitectureCanvasProps): React.JSX.Element {
  const suppressNativeSelectionRef = useRef(false)
  const view = useMemo(
    () => getVisibleArchitectureView({ model, expandedPath, changedNodeIds, driftedNodeIds }),
    [changedNodeIds, driftedNodeIds, expandedPath, model]
  )
  const selectedNode = selectedNodeId
    ? (model.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null
  const selectedEdge = selectedEdgeId
    ? (model.edges.find((edge) => edge.id === selectedEdgeId) ?? null)
    : null
  const selectedVisibleNode = selectedNodeId
    ? (view.visibleNodes.find((node) => node.id === selectedNodeId) ?? null)
    : null

  const visibleNodes = useMemo<ArchitectureFlowNode[]>(
    () =>
      view.visibleNodes.map((node) =>
        toFlowNode(node, {
          selected: node.id === selectedNodeId || multiSelectedNodeIds.includes(node.id),
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
      multiSelectedNodeIds,
      view.visibleNodes
    ]
  )

  const visibleEdges = useMemo<ArchitectureFlowEdge[]>(
    () =>
      decorateEdgesForRouting(view.visibleNodes, view.visibleEdges).map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
        type: 'relationship',
        data: {
          label: '',
          ...edge.data,
          _onSelect: onSelectedEdgeChange
        }
      })),
    [onSelectedEdgeChange, selectedEdgeId, view.visibleEdges, view.visibleNodes]
  )

  const groupBubbles = useMemo(
    () => getVisibleGroupBubbles(model, view.visibleNodes),
    [model, view.visibleNodes]
  )

  const onNodesChange = useCallback<OnNodesChange<ArchitectureFlowNode>>(
    (changes) => {
      if (syncing) {
        return
      }
      const removedReferenceIds = changes.flatMap((change) =>
        change.type === 'remove' && 'id' in change && view.refNodeIds.has(change.id)
          ? [change.id]
          : []
      )
      const removedIds = changes.flatMap((change) =>
        change.type === 'remove' && 'id' in change && !view.refNodeIds.has(change.id)
          ? [change.id]
          : []
      )
      if (removedIds.length > 0 || removedReferenceIds.length > 0) {
        void onModelChange(
          (current) => {
            let next = current
            if (removedReferenceIds.length > 0) {
              next = deleteReferenceEdgesFromModel(next, view.currentParentId, removedReferenceIds)
            }
            if (removedIds.length > 0) {
              next = deleteNodesFromModel(next, removedIds)
            }
            return next
          },
          removedIds.length > 0 ? 'Deleted architecture nodes' : 'Disconnected reference nodes'
        )
        return
      }
      void onModelChange(
        (current) =>
          applyNodePositionChangesToModel(current, changes, view.refNodeIds, view.currentParentId),
        'Saved canvas layout'
      )
    },
    [onModelChange, syncing, view.currentParentId, view.refNodeIds]
  )

  const onEdgesChange = useCallback<OnEdgesChange<ArchitectureFlowEdge>>(
    (changes) => {
      const selection = changes.find((change) => change.type === 'select' && change.selected)
      if (selection && 'id' in selection) {
        onSelectedEdgeChange(selection.id)
      }
      if (syncing) {
        return
      }
      const removedIds = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id)
      )
      if (removedIds.size > 0) {
        void onModelChange(
          (current) => deleteEdgesFromModel(current, [...removedIds]),
          'Saved architecture edges'
        )
        if (selectedEdgeId && removedIds.has(selectedEdgeId)) {
          onSelectedEdgeChange(null)
        }
      }
    },
    [onModelChange, onSelectedEdgeChange, selectedEdgeId, syncing]
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
    if (syncing) {
      return
    }
    if (selectedVisibleNode?.data._reference) {
      void onModelChange(
        (current) =>
          deleteReferenceEdgesFromModel(current, view.currentParentId, [selectedVisibleNode.id]),
        'Disconnected reference node'
      )
      onSelectedNodeChange(null)
      return
    }
    if (selectedNode) {
      const nextModel = deleteNodesFromModel(model, [selectedNode.id])
      void onModelChange(nextModel, `Deleted ${selectedNode.data.name}`)
      onSelectedNodeChange(nextModel.nodes[0]?.id ?? null)
      return
    }
    if (selectedEdge) {
      void onModelChange(
        deleteEdgesFromModel(model, [selectedEdge.id]),
        `Deleted ${selectedEdge.id}`
      )
      onSelectedEdgeChange(null)
    }
  }, [
    model,
    onModelChange,
    onSelectedEdgeChange,
    onSelectedNodeChange,
    selectedEdge,
    selectedNode,
    selectedVisibleNode,
    syncing,
    view.currentParentId
  ])

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
  const expandNode = useCallback(
    (nodeId: string) => {
      const node = model.nodes.find((candidate) => candidate.id === nodeId)
      if (!node || node.data.external || node.data._reference) {
        return
      }
      if (
        node.data.kind !== 'system' &&
        node.data.kind !== 'container' &&
        node.data.kind !== 'component'
      ) {
        return
      }
      onSelectedNodeChange(nodeId)
      onExpandedPathChange(
        expandedPath.at(-1) === nodeId ? expandedPath : [...expandedPath, nodeId]
      )
    },
    [expandedPath, model.nodes, onExpandedPathChange, onSelectedNodeChange]
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
        onSelectionChange={({ nodes, edges }) => {
          if (suppressNativeSelectionRef.current) {
            return
          }
          const realNodeIds = nodes.filter((node) => !node.data._reference).map((node) => node.id)
          const totalSelected = realNodeIds.length + edges.length
          onMultiSelectionChange(realNodeIds.length >= 2 ? realNodeIds : [], totalSelected)
          if (realNodeIds.length >= 2) {
            onSelectedNodeChange(null)
            onSelectedEdgeChange(null)
            return
          }
          if (realNodeIds.length === 1) {
            onSelectedNodeChange(realNodeIds[0])
          }
        }}
        onNodeClick={(event, node) => {
          if (event.shiftKey) {
            suppressNativeSelectionRef.current = true
            window.setTimeout(() => {
              suppressNativeSelectionRef.current = false
            }, 0)
            if (node.data._reference) {
              return
            }
            const baseSelection =
              multiSelectedNodeIds.length > 0
                ? multiSelectedNodeIds
                : selectedVisibleNode
                  ? [selectedVisibleNode.id]
                  : []
            const nextSelection = baseSelection.includes(node.id)
              ? baseSelection.filter((nodeId) => nodeId !== node.id)
              : [...baseSelection, node.id]
            if (nextSelection.length >= 2) {
              onMultiSelectionChange(nextSelection, nextSelection.length)
            } else {
              onMultiSelectionChange([], nextSelection.length)
              onSelectedNodeChange(nextSelection[0] ?? null)
            }
            return
          }
          onSelectedNodeChange(node.id)
        }}
        onNodeDoubleClick={(_, node) => expandNode(node.id)}
        onEdgeClick={(_, edge) => onSelectedEdgeChange(edge.id)}
        onEdgeDoubleClick={(_, edge) => onSelectedEdgeChange(edge.id)}
        onPaneClick={() => {
          onSelectedNodeChange(null)
          onSelectedEdgeChange(null)
        }}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={!syncing}
        nodesConnectable={!syncing}
        elementsSelectable
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        multiSelectionKeyCode="Shift"
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} variant={BackgroundVariant.Dots} size={1} color="var(--grid-color)" />
        <ViewportPortal>
          {groupBubbles.map((bubble) => (
            <div
              key={bubble.id}
              className="pointer-events-none absolute rounded-[28px] border border-emerald-400/35 bg-emerald-400/8 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
              style={{
                left: bubble.x,
                top: bubble.y,
                width: bubble.width,
                height: bubble.height,
                zIndex: -10 - bubble.depth
              }}
              data-testid="architecture-group-bubble"
              data-group-id={bubble.id}
            >
              <div className="absolute left-4 top-2 rounded-full border border-emerald-400/30 bg-background/90 px-2 py-0.5 text-[10px] font-medium text-emerald-600 shadow-sm dark:text-emerald-300">
                {bubble.name} · {bubble.memberCount}
              </div>
            </div>
          ))}
        </ViewportPortal>
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
            {selectedVisibleNode ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:text-destructive"
                onClick={deleteSelected}
                disabled={syncing}
              >
                <Trash2 className="size-3" />
                {selectedVisibleNode.data._reference ? 'Disconnect' : 'Delete'}
              </Button>
            ) : null}
            {selectedEdge ? (
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
            <Button
              variant="ghost"
              size="xs"
              onClick={autoLayout}
              disabled={syncing}
              data-testid="architecture-auto-layout"
            >
              <LayoutGrid className="size-3" />
              Layout
            </Button>
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
