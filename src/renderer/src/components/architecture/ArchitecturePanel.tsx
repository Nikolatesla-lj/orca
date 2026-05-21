/* eslint-disable max-lines -- Why: this panel still composes the migrated C4 canvas, flow, group, sync, and inspector surfaces while controller logic now lives in useArchitectureModelController. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import {
  Bot,
  Boxes,
  Command,
  FileText,
  FolderOpen,
  GitBranch,
  Network,
  Pencil,
  Plug,
  Plus,
  Redo2,
  RefreshCw,
  Undo2
} from 'lucide-react'
import type { ArchitectureWorkspace } from '../../../../shared/types'
import { e2eConfig } from '../../lib/e2e-config'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { ArchitectureCanvas } from './ArchitectureCanvas'
import { ArchitectureCommandPalette } from './ArchitectureCommandPalette'
import { ArchitectureContextPanel } from './ArchitectureContextPanel'
import { ArchitectureModelTree } from './ArchitectureModelTree'
import { ArchitectureSectionBoundary } from './ArchitectureSectionBoundary'
import { ArchitectureThemeEditor } from './ArchitectureThemeEditor'
import { CodeLevelRack } from './CodeLevelRack'
import { FlowScriptView } from './FlowScriptView'
import { GroupsDndProvider, GroupsMain } from './GroupsView'
import { SyncBar } from './SyncBar'
import {
  type ArchitectureMode,
  useArchitectureModelController
} from './useArchitectureModelController'
import { sanitizeClientModelName } from './useArchitectureModelSession'
import {
  createScryerThemeStyle,
  normalizeScryerTheme,
  type ScryerThemeSettings
} from '../../../../shared/scryer/theme'
import { recordArchitecturePerformanceMetric } from './architecture-performance'

const ARCHITECTURE_THEME_STORAGE_KEY = 'orca-scryer:architecture-theme'
type ArchitectureSidePanel = 'tree' | 'inspector'

function newProjectPromptDismissalKey(projectPath: string, modelName: string): string {
  return `orca-scryer:new-project-dismissed:${projectPath}:${modelName}`
}

function readArchitectureTheme(): ScryerThemeSettings {
  try {
    const raw = window.localStorage.getItem(ARCHITECTURE_THEME_STORAGE_KEY)
    return normalizeScryerTheme(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeScryerTheme(null)
  }
}

function resolveArchitectureThemeDark(theme: ScryerThemeSettings): boolean {
  if (theme.mode === 'dark') {
    return true
  }
  if (theme.mode === 'light') {
    return false
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

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
  const renderStartedAtRef = useRef(performance.now())
  renderStartedAtRef.current = performance.now()
  const setArchitectureProjectPath = useAppStore((state) => state.setArchitectureProjectPath)
  const {
    projectPath,
    model,
    activeModelName,
    projectModels,
    templates,
    architectureMode,
    setArchitectureMode,
    activeFlow,
    activeFlowId,
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
    error,
    changedNodeIds,
    nodeDiffs,
    followExternalChanges,
    setFollowExternalChanges,
    loadModel,
    refreshProjectModels,
    writePendingModelNow,
    createBlankProjectModel,
    createModelFromTemplate,
    openProjectModel,
    deleteProjectModelByName,
    persist,
    applyModelChange,
    undoModelChange,
    redoModelChange,
    addNode,
    updateSelectedNode,
    persistNodePatchById,
    updateSelectedNodeDraft,
    selectNode,
    selectEdge,
    selectManyNodes,
    updateSelectedEdge,
    saveSourcePattern,
    saveSourceLocations,
    addEdge,
    deleteSelected,
    deleteSelectedEdge,
    addCodeLevelNode,
    deleteNodeById,
    runDriftCheck,
    markSynced,
    navigateToNode,
    drillIntoNode,
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
    startInitialModel,
    fillNodeWithAi,
    startAdvisorReview,
    writeMcpConfig,
    startSync,
    cancelSync,
    finishSync,
    dismissSyncMessage,
    dismissNodeDiff
  } = useArchitectureModelController({ workspace })
  const [commandOpen, setCommandOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [newProjectStep, setNewProjectStep] = useState<'choices' | 'workspace'>('choices')
  const [pendingBlankModelName, setPendingBlankModelName] = useState<string | null>(null)
  const [blankWorkspacePath, setBlankWorkspacePath] = useState(workspace.projectPath ?? '')
  const [blankWorkspaceBusy, setBlankWorkspaceBusy] = useState(false)
  const [blankWorkspaceError, setBlankWorkspaceError] = useState<string | null>(null)
  const [architectureSidePanel, setArchitectureSidePanel] = useState<ArchitectureSidePanel>('tree')
  const ignoredInspectorSelectionRef = useRef<{
    nodeId: string | null
    edgeId: string | null
    multiKey: string
  }>({ nodeId: null, edgeId: null, multiKey: '' })
  const treePanelPinnedRef = useRef(false)
  const [dismissedNewProjectKeys, setDismissedNewProjectKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [architectureTheme, setArchitectureTheme] = useState(readArchitectureTheme)
  const architectureThemeStyle = useMemo(() => {
    const style = createScryerThemeStyle(
      architectureTheme,
      resolveArchitectureThemeDark(architectureTheme)
    )
    return {
      ...style,
      '--scryer-node-bg': 'var(--architecture-node-fill)',
      '--scryer-outline-stroke': 'var(--architecture-node-border)',
      '--grid-color': 'color-mix(in srgb, var(--architecture-role-muted) 34%, transparent)',
      backgroundColor: 'var(--architecture-role-background)',
      color: 'var(--architecture-role-foreground)'
    } as React.CSSProperties
  }, [architectureTheme])

  useEffect(() => {
    recordArchitecturePerformanceMetric('render', performance.now() - renderStartedAtRef.current)
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(ARCHITECTURE_THEME_STORAGE_KEY, JSON.stringify(architectureTheme))
    } catch {
      // Local storage may be unavailable in constrained windows; the live state still applies.
    }
  }, [architectureTheme])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return
      }
      event.preventDefault()
      void refreshProjectModels()
      setCommandOpen(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [refreshProjectModels])

  const promptDismissalKey = projectPath
    ? newProjectPromptDismissalKey(projectPath, activeModelName)
    : null
  const newProjectPromptDismissed =
    !!promptDismissalKey && dismissedNewProjectKeys.has(promptDismissalKey)
  const showNewProjectPrompt =
    architectureMode === 'topology' &&
    !!model &&
    model.nodes.length === 0 &&
    !!projectPath &&
    !newProjectPromptDismissed
  const showBlankWorkspacePicker = pendingBlankModelName !== null
  const modelTabs = useMemo(() => {
    const tabs = projectModels.filter((entry) => entry.scope === 'project')
    if (!tabs.some((entry) => entry.name === activeModelName)) {
      tabs.unshift({
        name: activeModelName,
        fileName: `${activeModelName}.scry`,
        path: '',
        isDefault: activeModelName === 'model',
        scope: 'project'
      })
    }
    return tabs
  }, [activeModelName, projectModels])

  const resolveAvailableBlankModelName = (requestedName: string): string => {
    const existingNames = new Set([...projectModels.map((entry) => entry.name), activeModelName])
    const baseName = sanitizeClientModelName(requestedName)
    if (!existingNames.has(baseName)) {
      return baseName
    }
    for (let index = 2; ; index += 1) {
      const candidate = `${baseName}-${index}`
      if (!existingNames.has(candidate)) {
        return candidate
      }
    }
  }

  const beginBlankWorkspaceSelection = (
    modelName: string,
    options: { keepRequestedName?: boolean } = {}
  ): void => {
    const nextModelName = options.keepRequestedName
      ? sanitizeClientModelName(modelName)
      : resolveAvailableBlankModelName(modelName)
    setCommandOpen(false)
    setPendingBlankModelName(nextModelName)
    setBlankWorkspacePath(projectPath ?? '')
    setBlankWorkspaceError(null)
    setNewProjectStep('workspace')
  }

  useEffect(() => {
    setNewProjectStep('choices')
    setBlankWorkspacePath(projectPath ?? '')
    setBlankWorkspaceError(null)
    setPendingBlankModelName(null)
  }, [activeModelName, projectPath])

  useEffect(() => {
    ignoredInspectorSelectionRef.current = { nodeId: null, edgeId: null, multiKey: '' }
    treePanelPinnedRef.current = false
    setArchitectureSidePanel('tree')
  }, [activeModelName])

  useEffect(() => {
    if (architectureMode === 'groups' && model) {
      setArchitectureSidePanel('inspector')
    }
  }, [architectureMode, model])

  const multiSelectionKey = (nodeIds: string[]): string => [...nodeIds].sort().join('\0')

  const openTreeSidePanel = (): void => {
    treePanelPinnedRef.current = true
    ignoredInspectorSelectionRef.current = {
      nodeId: selectedNodeId,
      edgeId: selectedEdgeId,
      multiKey: multiSelectionKey(multiSelectedNodeIds)
    }
    setArchitectureSidePanel('tree')
  }

  const openInspectorSidePanel = (): void => {
    treePanelPinnedRef.current = false
    ignoredInspectorSelectionRef.current = { nodeId: null, edgeId: null, multiKey: '' }
    setArchitectureSidePanel('inspector')
  }

  const canAutoOpenNodeInspector = (nodeId: string): boolean =>
    !treePanelPinnedRef.current && ignoredInspectorSelectionRef.current.nodeId !== nodeId

  const canAutoOpenEdgeInspector = (edgeId: string): boolean =>
    !treePanelPinnedRef.current && ignoredInspectorSelectionRef.current.edgeId !== edgeId

  const canAutoOpenMultiInspector = (nodeIds: string[]): boolean =>
    !treePanelPinnedRef.current &&
    ignoredInspectorSelectionRef.current.multiKey !== multiSelectionKey(nodeIds)

  useEffect(() => {
    if (!promptDismissalKey) {
      return
    }
    try {
      if (window.localStorage.getItem(promptDismissalKey) !== 'true') {
        return
      }
      setDismissedNewProjectKeys((current) => new Set(current).add(promptDismissalKey))
    } catch {
      // Local storage can be unavailable; the in-memory dismissed state still works.
    }
  }, [promptDismissalKey])

  const handlePickBlankWorkspace = async (): Promise<void> => {
    const pickDirectory =
      e2eConfig.enabled && window.__architecturePickDirectoryForE2E
        ? window.__architecturePickDirectoryForE2E
        : window.api.shell.pickDirectory
    // Why: native Electron directory dialogs cannot be driven from headless Playwright.
    const selected = await pickDirectory({
      defaultPath: blankWorkspacePath || projectPath || undefined
    })
    if (!selected) {
      return
    }
    setBlankWorkspacePath(selected)
    setBlankWorkspaceError(null)
  }

  const handleConfirmBlankWorkspace = async (): Promise<void> => {
    const targetPath = blankWorkspacePath.trim()
    if (!targetPath || blankWorkspaceBusy) {
      return
    }
    const targetModelName = pendingBlankModelName ?? activeModelName
    setCommandOpen(false)
    setBlankWorkspaceBusy(true)
    setBlankWorkspaceError(null)
    try {
      const createdModelName =
        (await createBlankProjectModel(targetModelName, targetPath)) ?? targetModelName
      const targetDismissalKey = newProjectPromptDismissalKey(targetPath, createdModelName)
      try {
        window.localStorage.setItem(targetDismissalKey, 'true')
      } catch {
        // Local storage can fail in constrained windows; keep the session state below.
      }
      setDismissedNewProjectKeys((current) => new Set(current).add(targetDismissalKey))
      if (targetPath !== projectPath) {
        setArchitectureProjectPath(workspace.id, targetPath)
      }
      setPendingBlankModelName(null)
      setNewProjectStep('choices')
    } catch (blankError) {
      setBlankWorkspaceError(blankError instanceof Error ? blankError.message : String(blankError))
    } finally {
      setBlankWorkspaceBusy(false)
    }
  }

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
            onUpdateSourceMap={saveSourceLocations}
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
        onSelectedNodeChange={(nodeId) => {
          if (nodeId && canAutoOpenNodeInspector(nodeId)) {
            openInspectorSidePanel()
          }
          selectNode(nodeId)
        }}
        onSelectedEdgeChange={(edgeId) => {
          if (edgeId && canAutoOpenEdgeInspector(edgeId)) {
            openInspectorSidePanel()
          }
          selectEdge(edgeId)
        }}
        onMultiSelectionChange={(nodeIds, selectedCount) => {
          if (nodeIds.length >= 2 && canAutoOpenMultiInspector(nodeIds)) {
            openInspectorSidePanel()
          }
          selectManyNodes(nodeIds, selectedCount)
        }}
        onModelChange={applyModelChange}
        onOpenSourceLocation={openSourceLocation}
        onFillNodeWithAi={fillNodeWithAi}
        onCreateGroupFromSelection={createGroupFromSelection}
        onAddSelectionToGroup={addSelectionToGroup}
      />
    )
  ) : (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading architecture model...
    </div>
  )

  const mainSection = (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="scrollbar-sleek flex h-9 min-w-0 shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-border bg-muted/30 px-2 pt-1"
        role="tablist"
        aria-label="Architecture models"
        data-testid="architecture-model-tab-strip"
      >
        {modelTabs.map((entry) => {
          const isActive = entry.name === activeModelName
          return (
            <button
              key={entry.name}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`inline-flex h-8 max-w-44 min-w-24 shrink-0 items-center gap-1.5 rounded-t-md border px-3 font-mono text-[11px] transition-colors ${
                isActive
                  ? '-mb-px border-border border-b-background bg-background text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground'
              }`}
              disabled={editingLocked}
              onClick={() => {
                if (!isActive) {
                  void openProjectModel(entry.name, entry.scope)
                }
              }}
              data-testid="architecture-model-tab"
              title={entry.fileName}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{entry.fileName}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="mb-1 inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => beginBlankWorkspaceSelection('model')}
          disabled={editingLocked}
          data-testid="architecture-model-tab-new"
          title="New blank model"
          aria-label="New blank model"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div
        className="scrollbar-sleek flex h-10 min-w-0 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-border px-3"
        data-testid="architecture-toolbar"
      >
        <Network className="size-4 text-emerald-500" />
        <span className="truncate text-sm font-medium">{workspace.title}</span>
        {model?.validationWarnings?.length ? (
          <span
            className="min-w-0 flex-1 truncate text-xs text-amber-600 dark:text-amber-300"
            data-testid="architecture-model-warning"
            title={model.validationWarnings.map((warning) => warning.message).join('\n')}
          >
            {model.validationWarnings.length} model warning
            {model.validationWarnings.length === 1 ? '' : 's'}:{' '}
            {model.validationWarnings[0].message}
          </span>
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
        <ArchitectureThemeEditor
          open={themeOpen}
          theme={architectureTheme}
          onOpenChange={setThemeOpen}
          onThemeChange={setArchitectureTheme}
        />
        <Button
          variant="outline"
          size="xs"
          onClick={() => void startAdvisorReview()}
          disabled={!projectPath || !model || model.nodes.length === 0 || editingLocked}
          data-testid="architecture-advisor-review"
        >
          <Bot className="size-3" />
          Review
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => void writeMcpConfig()}
          disabled={!projectPath}
          data-testid="architecture-mcp-config"
        >
          <Plug className="size-3" />
          MCP
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            void refreshProjectModels()
            setCommandOpen(true)
          }}
          data-testid="architecture-command-open"
        >
          <Command className="size-3" />
          Cmd
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <ArchitectureSectionBoundary
          name="Architecture workspace"
          resetKey={`${activeModelName}:${architectureMode}:${activeFlowId ?? ''}:${currentParentId ?? ''}`}
        >
          {mainContent}
        </ArchitectureSectionBoundary>
        {showNewProjectPrompt || showBlankWorkspacePicker ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40">
            <div className="pointer-events-auto grid w-[380px] gap-2 rounded border border-border bg-background p-4 shadow-lg">
              <div className="grid gap-1 border-b border-border pb-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {showBlankWorkspacePicker ? 'New model' : 'New project'}
                </div>
                <div className="truncate text-sm font-semibold text-foreground">
                  {pendingBlankModelName ?? activeModelName}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{projectPath}</div>
              </div>
              {!showBlankWorkspacePicker && newProjectStep === 'choices' ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded border border-border px-3 py-2 text-left hover:bg-accent"
                    onClick={() => void startInitialModel()}
                    disabled={editingLocked}
                    data-testid="architecture-build-ai"
                  >
                    <Bot className="size-4 text-violet-500" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">Build with AI</span>
                      <span className="text-[11px] text-muted-foreground">
                        Scan the codebase and generate an architecture model
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded border border-border px-3 py-2 text-left hover:bg-accent"
                    onClick={() => {
                      beginBlankWorkspaceSelection(activeModelName, { keepRequestedName: true })
                    }}
                    disabled={editingLocked}
                    data-testid="architecture-start-blank"
                  >
                    <Plus className="size-4 text-muted-foreground" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">Start blank</span>
                      <span className="text-[11px] text-muted-foreground">
                        Add systems, containers, and components manually
                      </span>
                    </span>
                  </button>
                </>
              ) : (
                <div className="grid gap-3" data-testid="architecture-workspace-picker">
                  <div className="grid gap-2">
                    <button
                      type="button"
                      className={`flex items-center gap-3 rounded border px-3 py-2 text-left hover:bg-accent ${
                        blankWorkspacePath === projectPath
                          ? 'border-primary bg-accent/60'
                          : 'border-border'
                      }`}
                      onClick={() => {
                        setBlankWorkspacePath(projectPath ?? '')
                        setBlankWorkspaceError(null)
                      }}
                      data-testid="architecture-workspace-current"
                    >
                      <Network className="size-4 text-muted-foreground" />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">Current workspace</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {projectPath}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-3 rounded border px-3 py-2 text-left hover:bg-accent ${
                        blankWorkspacePath !== projectPath
                          ? 'border-primary bg-accent/60'
                          : 'border-border'
                      }`}
                      onClick={() => void handlePickBlankWorkspace()}
                      data-testid="architecture-workspace-other"
                    >
                      <FolderOpen className="size-4 text-muted-foreground" />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">Other workspace</span>
                        <span className="text-[11px] text-muted-foreground">
                          Choose a folder for this model
                        </span>
                      </span>
                    </button>
                  </div>
                  <div
                    className="truncate rounded border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground"
                    title={blankWorkspacePath}
                    data-testid="architecture-workspace-path"
                  >
                    {blankWorkspacePath || 'No workspace selected'}
                  </div>
                  {blankWorkspaceError ? (
                    <div className="text-xs text-destructive">{blankWorkspaceError}</div>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setCommandOpen(false)
                        setPendingBlankModelName(null)
                        setNewProjectStep('choices')
                      }}
                      disabled={blankWorkspaceBusy}
                    >
                      {showNewProjectPrompt ? 'Back' : 'Cancel'}
                    </Button>
                    <Button
                      variant="default"
                      size="xs"
                      onClick={() => void handleConfirmBlankWorkspace()}
                      disabled={!blankWorkspacePath.trim() || blankWorkspaceBusy || editingLocked}
                      data-testid="architecture-workspace-confirm"
                    >
                      {blankWorkspaceBusy ? 'Creating...' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

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
    <ArchitectureSectionBoundary
      name="Architecture inspector"
      resetKey={`${activeModelName}:${selectedNodeId ?? ''}:${selectedEdgeId ?? ''}:${selectedGroupId ?? ''}`}
    >
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
        onSave={async () => {
          if (model) {
            await persist(model, 'Saved architecture model')
            await writePendingModelNow()
          }
          return undefined
        }}
        onDeleteNode={deleteSelected}
        onDeleteEdge={deleteSelectedEdge}
        onUpdateNodeDraft={updateSelectedNodeDraft}
        onUpdateNode={updateSelectedNode}
        onPersistNodeById={persistNodePatchById}
        onUpdateEdge={updateSelectedEdge}
        onSourcePatternChange={setSourcePattern}
        onSaveSourcePattern={saveSourcePattern}
        onSaveSourceLocations={saveSourceLocations}
        onTargetNodeChange={setTargetNodeId}
        onAddEdge={addEdge}
        onCreateGroupFromSelection={createGroupFromSelection}
        onAddSelectionToGroup={addSelectionToGroup}
        onUpdateGroup={patchSelectedGroup}
        onDeleteGroup={deleteSelectedGroup}
        onRemoveGroupMember={removeSelectedGroupMember}
        docked
        groupsPaletteMode={architectureMode === 'groups' && !!model}
        nodeDiff={selectedNode ? nodeDiffs.get(selectedNode.id) : undefined}
        onDismissNodeDiff={dismissNodeDiff}
      />
    </ArchitectureSectionBoundary>
  )

  const modelTree = model ? (
    <ArchitectureSectionBoundary name="Architecture tree" resetKey={activeModelName}>
      <ArchitectureModelTree
        model={model}
        selectedNodeId={selectedNodeId}
        activeFlowId={activeFlowId}
        onSelectNode={(nodeId) => {
          openInspectorSidePanel()
          setArchitectureMode('topology')
          navigateToNode(nodeId)
        }}
        onDrillNode={drillIntoNode}
        onSelectFlow={(flowId) => {
          setArchitectureMode('flows')
          setActiveFlowId(flowId)
        }}
        docked
      />
    </ArchitectureSectionBoundary>
  ) : null

  const sideTabClass = (tab: ArchitectureSidePanel): string =>
    `flex h-16 w-11 flex-col items-center justify-center gap-1 border-l text-[10px] font-medium transition-colors ${
      architectureSidePanel === tab
        ? 'border-primary bg-accent text-foreground'
        : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground'
    }`

  const sideDock = (
    <aside
      className="flex min-h-0 shrink-0 border-l border-border bg-background"
      data-testid="architecture-side-dock"
    >
      {architectureSidePanel === 'tree' ? modelTree : contextPanel}
      <div
        className="flex w-11 shrink-0 flex-col items-stretch border-l border-border bg-muted/30"
        role="tablist"
        aria-label="Architecture side panels"
      >
        <button
          type="button"
          role="tab"
          className={sideTabClass('tree')}
          aria-selected={architectureSidePanel === 'tree'}
          onMouseDown={openTreeSidePanel}
          onClick={openTreeSidePanel}
          data-testid="architecture-side-tab-tree"
          title="Model and flow tree"
        >
          <Network className="size-3.5" />
          <span>Tree</span>
        </button>
        <button
          type="button"
          role="tab"
          className={sideTabClass('inspector')}
          aria-selected={architectureSidePanel === 'inspector'}
          onMouseDown={openInspectorSidePanel}
          onClick={openInspectorSidePanel}
          data-testid="architecture-side-tab-inspector"
          title="Edit selected model item"
        >
          <Pencil className="size-3.5" />
          <span>Edit</span>
        </button>
      </div>
    </aside>
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
        onSelectedGroupChange={(groupId) => {
          if (groupId) {
            openInspectorSidePanel()
          }
          setSelectedGroupId(groupId)
        }}
      >
        {mainSection}
        {sideDock}
      </GroupsDndProvider>
    ) : (
      <>
        {mainSection}
        {sideDock}
      </>
    )

  return (
    <>
      {!showBlankWorkspacePicker ? (
        <ArchitectureCommandPalette
          open={commandOpen}
          activeModelName={activeModelName}
          models={projectModels}
          templates={templates}
          disabled={editingLocked}
          onOpenChange={setCommandOpen}
          onOpenModel={openProjectModel}
          onDeleteModel={deleteProjectModelByName}
          onLoadTemplate={createModelFromTemplate}
        />
      ) : null}
      <div
        className="absolute inset-0 flex min-h-0 min-w-0 bg-background text-foreground"
        data-testid="architecture-panel"
        style={architectureThemeStyle}
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
    </>
  )
}
