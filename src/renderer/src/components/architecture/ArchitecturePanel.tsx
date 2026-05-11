/* eslint-disable max-lines -- Why: this panel still composes the migrated C4 canvas, flow, group, sync, and inspector surfaces while controller logic now lives in useArchitectureModelController. */
import type React from 'react'
import { Boxes, GitBranch, Network, Plus, Redo2, RefreshCw, Undo2 } from 'lucide-react'
import type { ArchitectureWorkspace } from '../../../../shared/types'
import { Button } from '../ui/button'
import { ArchitectureCanvas } from './ArchitectureCanvas'
import { ArchitectureContextPanel } from './ArchitectureContextPanel'
import { CodeLevelRack } from './CodeLevelRack'
import { FlowScriptView } from './FlowScriptView'
import { GroupsDndProvider, GroupsMain } from './GroupsView'
import { SyncBar } from './SyncBar'
import {
  type ArchitectureMode,
  useArchitectureModelController
} from './useArchitectureModelController'

function modeButtonClass(activeMode: ArchitectureMode, mode: ArchitectureMode): string {
  return `inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors ${
    activeMode === mode
      ? 'bg-accent text-foreground'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
  }`
}

export default function ArchitecturePanel({
  workspace
}: {
  workspace: ArchitectureWorkspace
}): React.JSX.Element {
  const {
    projectPath,
    model,
    architectureMode,
    setArchitectureMode,
    activeFlow,
    setActiveFlowId,
    selectedNode,
    selectedEdge,
    selectedGroup,
    selectedNodeId,
    selectedEdgeId,
    selectedGroupId,
    setSelectedGroupId,
    multiSelectedNodeIds,
    totalSelected,
    expandedPath,
    setExpandedPath,
    currentParent,
    currentParentId,
    currentParentKind,
    canShowGroups,
    canGroupMultiSelection,
    targetNodeId,
    setTargetNodeId,
    sourcePattern,
    setSourcePattern,
    drift,
    implementing,
    syncStatus,
    syncMessage,
    syncLog,
    activeAgent,
    editingLocked,
    canUndo,
    canRedo,
    driftedNodeIds,
    flows,
    codeLevelNodes,
    message,
    error,
    changedNodeIds,
    nodeDiffs,
    followExternalChanges,
    setFollowExternalChanges,
    loadModel,
    persist,
    applyModelChange,
    undoModelChange,
    redoModelChange,
    addNode,
    updateSelectedNode,
    updateSelectedNodeDraft,
    selectNode,
    selectEdge,
    selectManyNodes,
    updateSelectedEdge,
    saveSourcePattern,
    addEdge,
    deleteSelected,
    deleteSelectedEdge,
    addCodeLevelNode,
    deleteNodeById,
    runDriftCheck,
    markSynced,
    navigateToNode,
    createFlow,
    updateFlow,
    deleteActiveFlow,
    updateGroups,
    createGroupFromSelection,
    addSelectionToGroup,
    patchSelectedGroup,
    removeSelectedGroupMember,
    deleteSelectedGroup,
    toggleLock,
    openSourceLocation,
    startSync,
    cancelSync,
    finishSync,
    dismissSyncMessage,
    dismissNodeDiff
  } = useArchitectureModelController({ workspace })

  const mainContent = error ? (
    <div className="flex-1 p-4 text-sm text-destructive">{error}</div>
  ) : model ? (
    architectureMode === 'flows' ? (
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
        <div
          className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3"
          data-testid="architecture-flow-tabs"
        >
          {flows.length === 0 ? (
            <span className="mr-auto text-xs text-muted-foreground">No flows yet</span>
          ) : (
            flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                className={`max-w-44 shrink-0 truncate rounded px-2 py-1 text-xs transition-colors ${
                  flow.id === activeFlow?.id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
                onClick={() => setActiveFlowId(flow.id)}
                data-testid="architecture-flow-tab"
                data-flow-id={flow.id}
              >
                {flow.name || flow.id}
              </button>
            ))
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={() => void createFlow()}
            disabled={editingLocked}
            data-testid="architecture-flow-create"
          >
            <Plus className="size-3" />
            Flow
          </Button>
        </div>
        {activeFlow ? (
          <FlowScriptView
            flow={activeFlow}
            allNodes={model.nodes}
            sourceMap={model.sourceMap ?? {}}
            onUpdate={updateFlow}
            onDelete={deleteActiveFlow}
            onNavigateToNode={navigateToNode}
            onSwitchToTopology={() => setArchitectureMode('topology')}
            onOpenSourceLocation={openSourceLocation}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void createFlow()}
              disabled={editingLocked}
              data-testid="architecture-flow-empty-create"
            >
              <Plus className="size-3.5" />
              New flow
            </Button>
          </div>
        )}
      </div>
    ) : architectureMode === 'groups' ? (
      <GroupsMain />
    ) : currentParentKind === 'component' && currentParentId ? (
      <CodeLevelRack
        nodes={codeLevelNodes}
        selectedNodeId={selectedNodeId}
        syncing={editingLocked}
        parentName={currentParent?.data.name ?? currentParentId}
        onNavigateUp={() => {
          setExpandedPath((path) => path.slice(0, -1))
          selectNode(currentParentId)
        }}
        onSelectNode={(nodeId) => {
          setArchitectureMode('topology')
          selectNode(nodeId)
        }}
        onAddNode={addCodeLevelNode}
        onDeleteNode={deleteNodeById}
      />
    ) : (
      <ArchitectureCanvas
        model={model}
        syncing={editingLocked}
        expandedPath={expandedPath}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        multiSelectedNodeIds={multiSelectedNodeIds}
        changedNodeIds={changedNodeIds}
        driftedNodeIds={driftedNodeIds}
        onExpandedPathChange={setExpandedPath}
        onSelectedNodeChange={selectNode}
        onSelectedEdgeChange={selectEdge}
        onMultiSelectionChange={selectManyNodes}
        onModelChange={applyModelChange}
        onOpenSourceLocation={openSourceLocation}
      />
    )
  ) : (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading architecture model...
    </div>
  )

  const mainSection = (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Network className="size-4 text-emerald-500" />
        <span className="truncate text-sm font-medium">{workspace.title}</span>
        {message ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{message}</span>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5">
          <button
            type="button"
            className={modeButtonClass(architectureMode, 'topology')}
            aria-pressed={architectureMode === 'topology'}
            onClick={() => setArchitectureMode('topology')}
            data-testid="architecture-mode-topology"
          >
            <Network className="size-3" />
            Topology
          </button>
          <button
            type="button"
            className={modeButtonClass(architectureMode, 'flows')}
            aria-pressed={architectureMode === 'flows'}
            onClick={() => setArchitectureMode('flows')}
            data-testid="architecture-mode-flows"
          >
            <GitBranch className="size-3" />
            Flows
          </button>
          {canShowGroups || architectureMode === 'groups' ? (
            <button
              type="button"
              className={modeButtonClass(architectureMode, 'groups')}
              aria-pressed={architectureMode === 'groups'}
              disabled={!canShowGroups}
              onClick={() => canShowGroups && setArchitectureMode('groups')}
              title={
                canShowGroups ? 'Organize this level into groups' : 'Drill into a system first'
              }
              data-testid="architecture-mode-groups"
            >
              <Boxes className="size-3" />
              Groups
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5">
          <button
            type="button"
            className="inline-flex h-7 items-center rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void undoModelChange()}
            disabled={!canUndo || editingLocked}
            title="Undo model change"
            data-testid="architecture-undo"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void redoModelChange()}
            disabled={!canRedo || editingLocked}
            title="Redo model change"
            data-testid="architecture-redo"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>
        <label
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
          title="Automatically navigate to the level changed by MCP or an agent"
        >
          <input
            type="checkbox"
            checked={followExternalChanges}
            onChange={(event) => setFollowExternalChanges(event.currentTarget.checked)}
            data-testid="architecture-follow-external"
          />
          Follow
        </label>
        <Button variant="outline" size="xs" onClick={() => void loadModel()}>
          <RefreshCw className="size-3" />
          Reload
        </Button>
      </div>

      {mainContent}

      <SyncBar
        activeAgent={activeAgent}
        driftedNodes={drift?.nodes ?? []}
        structureChanged={drift?.structureChanged ?? false}
        implementing={implementing}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        syncLog={syncLog}
        projectPath={projectPath ?? undefined}
        onSync={startSync}
        onCancelSync={cancelSync}
        onFinishSync={finishSync}
        onCheckDrift={runDriftCheck}
        onDismissMessage={dismissSyncMessage}
        onDismissDrift={markSynced}
        onToggleLock={toggleLock}
        onNavigateToNode={navigateToNode}
      />
    </section>
  )

  const contextPanel = (
    <ArchitectureContextPanel
      model={model}
      selectedNode={selectedNode}
      selectedEdge={selectedEdge}
      selectedGroup={selectedGroup}
      multiSelectedNodeIds={multiSelectedNodeIds}
      totalSelected={totalSelected}
      canGroupSelection={canGroupMultiSelection}
      targetNodeId={targetNodeId}
      sourcePattern={sourcePattern}
      syncing={editingLocked}
      onAddNode={addNode}
      onSave={() => {
        if (model) {
          return persist(model, 'Saved architecture model')
        }
        return undefined
      }}
      onDeleteNode={deleteSelected}
      onDeleteEdge={deleteSelectedEdge}
      onUpdateNodeDraft={updateSelectedNodeDraft}
      onUpdateNode={updateSelectedNode}
      onUpdateEdge={updateSelectedEdge}
      onSourcePatternChange={setSourcePattern}
      onSaveSourcePattern={saveSourcePattern}
      onTargetNodeChange={setTargetNodeId}
      onAddEdge={addEdge}
      onCreateGroupFromSelection={createGroupFromSelection}
      onAddSelectionToGroup={addSelectionToGroup}
      onUpdateGroup={patchSelectedGroup}
      onDeleteGroup={deleteSelectedGroup}
      onRemoveGroupMember={removeSelectedGroupMember}
      groupsPaletteMode={architectureMode === 'groups' && !!model}
      nodeDiff={selectedNode ? nodeDiffs.get(selectedNode.id) : undefined}
      onDismissNodeDiff={dismissNodeDiff}
    />
  )

  const panelContent =
    architectureMode === 'groups' && model ? (
      <GroupsDndProvider
        allNodes={model.nodes}
        groups={model.groups ?? []}
        onUpdateGroups={updateGroups}
        currentParentId={currentParentId}
        onNavigateToNode={navigateToNode}
        selectedGroupId={selectedGroupId}
        onSelectedGroupChange={setSelectedGroupId}
      >
        {mainSection}
        {contextPanel}
      </GroupsDndProvider>
    ) : (
      <>
        {mainSection}
        {contextPanel}
      </>
    )

  return (
    <div
      className="absolute inset-0 flex min-h-0 min-w-0 bg-background text-foreground"
      data-testid="architecture-panel"
    >
      {panelContent}
      {drift && (drift.nodes.length > 0 || drift.structureChanged) ? (
        <div
          className="absolute bottom-3 right-[25rem] z-20 rounded border border-border bg-background p-3 text-xs shadow"
          data-testid="architecture-drift-report"
        >
          <div className="font-medium">Drift report</div>
          <div className="mt-1 text-muted-foreground">
            Structure changed: {drift.structureChanged ? 'yes' : 'no'}
          </div>
          {drift.nodes.map((node) => (
            <div key={node.nodeId} className="mt-2">
              <div>{node.nodeName}</div>
              <div className="text-muted-foreground">{node.patterns.join(', ')}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
