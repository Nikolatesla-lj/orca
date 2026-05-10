/* eslint-disable max-lines -- Why: this migration surface keeps load/save, ReactFlow canvas, and inspector state together until Scryer panels are split across smaller Orca-native modules. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  GitCompareArrows,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { detectLanguage } from '../../lib/language-detect'
import { launchAgentInNewTab } from '../../lib/launch-agent-in-new-tab'
import { useAppStore } from '../../store'
import type { ArchitectureWorkspace, TuiAgent } from '../../../../shared/types'
import type {
  C4Edge,
  C4ModelData,
  C4Node,
  DriftReport,
  SourceLocation,
  Status
} from '../../../../shared/scryer/model-types'
import { resolveSourceLocationTarget } from '../../../../shared/scryer/source-map-paths'
import { Button } from '../ui/button'
import { ArchitectureCanvas, type ModelUpdater } from './ArchitectureCanvas'
import {
  createNodeForParent,
  deleteNodesFromModel,
  isExpandableKind,
  reconcileExpandedPath
} from './c4-model'

const STATUS_OPTIONS: Status[] = ['proposed', 'implemented', 'verified', 'vagrant']

function createEmptyModel(projectPath: string): C4ModelData {
  return {
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    projectPath,
    refPositions: {},
    groups: [],
    flows: []
  }
}

export default function ArchitecturePanel({
  workspace
}: {
  workspace: ArchitectureWorkspace
}): React.JSX.Element {
  const projectPath = workspace.projectPath
  const openFile = useAppStore((state) => state.openFile)
  const setPendingEditorReveal = useAppStore((state) => state.setPendingEditorReveal)
  const settingsDefaultAgent = useAppStore((state) => state.settings?.defaultTuiAgent)
  const detectedAgentIds = useAppStore((state) => state.detectedAgentIds)
  const [model, setModel] = useState<C4ModelData | null>(null)
  const modelRef = useRef<C4ModelData | null>(null)
  const sourcePatternSyncRef = useRef<{ nodeId: string | null; pattern: string } | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandedPath, setExpandedPath] = useState<string[]>([])
  const [targetNodeId, setTargetNodeId] = useState<string>('')
  const [sourcePattern, setSourcePattern] = useState('')
  const [drift, setDrift] = useState<DriftReport | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')

  const selectedNode = useMemo(
    () => model?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [model, selectedNodeId]
  )

  const selectedSourcePattern = selectedNode
    ? (model?.sourceMap?.[selectedNode.id]?.[0]?.pattern ?? '')
    : ''

  const driftedNodeIds = useMemo(
    () => new Set((drift?.nodes ?? []).map((node) => node.nodeId)),
    [drift]
  )

  const loadModel = useCallback(async () => {
    if (!projectPath) {
      const emptyModel = createEmptyModel('')
      modelRef.current = emptyModel
      setModel(emptyModel)
      setError('Architecture tabs need a worktree path.')
      return
    }
    try {
      setError('')
      const loaded = await window.api.architecture.readModel({ projectPath })
      modelRef.current = loaded
      setModel(loaded)
      setExpandedPath((current) => reconcileExpandedPath(loaded, current))
      setSelectedNodeId((current) =>
        current && loaded.nodes.some((node) => node.id === current)
          ? current
          : (loaded.nodes[0]?.id ?? null)
      )
      setSyncing(await window.api.architecture.isSyncing({ projectPath }))
      setMessage('Model loaded')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }, [projectPath])

  const persist = useCallback(
    async (nextModel: C4ModelData, nextMessage: string) => {
      if (!projectPath) {
        return
      }
      modelRef.current = nextModel
      setModel(nextModel)
      await window.api.architecture.writeModel({ projectPath, model: nextModel })
      setMessage(nextMessage)
    },
    [projectPath]
  )

  const applyModelChange = useCallback(
    async (change: C4ModelData | ModelUpdater, nextMessage: string) => {
      const current = modelRef.current
      if (!current) {
        return
      }
      const nextModel = typeof change === 'function' ? change(current) : change
      if (!nextModel) {
        return
      }
      await persist(nextModel, nextMessage)
    },
    [persist]
  )

  useEffect(() => {
    void loadModel()
  }, [loadModel])

  useEffect(() => {
    if (!projectPath) {
      return
    }
    void window.api.architecture.watchModel({ projectPath })
    return window.api.architecture.onModelChanged((event) => {
      if (event.projectPath === projectPath) {
        void loadModel()
      }
    })
  }, [loadModel, projectPath])

  useEffect(() => {
    if (!selectedNode) {
      setSourcePattern('')
      sourcePatternSyncRef.current = { nodeId: null, pattern: '' }
      return
    }
    const lastSynced = sourcePatternSyncRef.current
    if (lastSynced?.nodeId === selectedNode.id && lastSynced.pattern === selectedSourcePattern) {
      return
    }
    setSourcePattern(selectedSourcePattern)
    sourcePatternSyncRef.current = {
      nodeId: selectedNode.id,
      pattern: selectedSourcePattern
    }
  }, [selectedNode, selectedSourcePattern])

  useEffect(() => {
    setTargetNodeId('')
  }, [selectedNodeId])

  const addNode = useCallback(async () => {
    if (!model || syncing) {
      return
    }
    const node = createNodeForParent(model, selectedNode)
    const nextModel = { ...model, nodes: [...model.nodes, node] }
    await persist(nextModel, `Added ${node.data.name}`)
    setSelectedNodeId(node.id)
    if (selectedNode && !selectedNode.data.external && isExpandableKind(selectedNode.data.kind)) {
      setExpandedPath((current) =>
        current.at(-1) === selectedNode.id ? current : [...current, selectedNode.id]
      )
    }
  }, [model, persist, selectedNode, syncing])

  const updateSelectedNode = useCallback(
    async (patch: Partial<C4Node['data']>) => {
      if (!model || !selectedNode || syncing) {
        return
      }
      const nextModel = {
        ...model,
        nodes: model.nodes.map((node) =>
          node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node
        )
      }
      await persist(nextModel, `Saved ${selectedNode.data.name}`)
    },
    [model, persist, selectedNode, syncing]
  )

  const saveSourcePattern = useCallback(
    async (rawPattern: string) => {
      const current = modelRef.current ?? model
      if (!current || !selectedNode || syncing) {
        return
      }
      const sourceMap = { ...current.sourceMap }
      const pattern = rawPattern.trim()
      if (pattern) {
        sourceMap[selectedNode.id] = [{ pattern }]
      } else {
        delete sourceMap[selectedNode.id]
      }
      await persist({ ...current, sourceMap }, `Saved source map for ${selectedNode.data.name}`)
    },
    [model, persist, selectedNode, syncing]
  )

  const addEdge = useCallback(async () => {
    if (!model || !selectedNode || !targetNodeId || selectedNode.id === targetNodeId || syncing) {
      return
    }
    const id = `edge-${selectedNode.id}-${targetNodeId}`
    if (model.edges.some((edge) => edge.id === id)) {
      setMessage('Edge already exists')
      return
    }
    const edge: C4Edge = {
      id,
      source: selectedNode.id,
      target: targetNodeId,
      data: { label: 'depends on' }
    }
    await persist({ ...model, edges: [...model.edges, edge] }, 'Saved architecture edge')
  }, [model, persist, selectedNode, syncing, targetNodeId])

  const deleteSelected = useCallback(async () => {
    if (!model || !selectedNode || syncing) {
      return
    }
    const nextModel = deleteNodesFromModel(model, [selectedNode.id])
    await persist(nextModel, `Deleted ${selectedNode.data.name}`)
    setSelectedNodeId(nextModel.nodes[0]?.id ?? null)
  }, [model, persist, selectedNode, syncing])

  const runDriftCheck = useCallback(async () => {
    if (!projectPath) {
      return
    }
    const report = await window.api.architecture.checkDrift({ projectPath })
    setDrift(report)
    setMessage(
      report.nodes.length || report.structureChanged ? 'Code drift detected' : 'Model is synced'
    )
  }, [projectPath])

  const markSynced = useCallback(async () => {
    if (!projectPath) {
      return
    }
    await window.api.architecture.markSynced({ projectPath })
    setDrift({ nodes: [], structureChanged: false })
    setMessage('Marked architecture as synced')
  }, [projectPath])

  const openSourceLocation = useCallback(
    async (location: SourceLocation) => {
      if (!projectPath) {
        return
      }
      try {
        const files = await window.api.fs.listFiles({ rootPath: projectPath })
        const target = resolveSourceLocationTarget({ projectPath, files, location })
        if ('error' in target) {
          setError(target.error)
          toast.error(target.error)
          return
        }
        openFile(
          {
            filePath: target.absolutePath,
            relativePath: target.relativePath,
            worktreeId: workspace.worktreeId,
            language: detectLanguage(target.relativePath),
            mode: 'edit'
          },
          {
            preview: true,
            targetGroupId: useAppStore.getState().activeGroupIdByWorktree?.[workspace.worktreeId],
            recordReplacedPreview: true
          }
        )
        if (target.line !== undefined) {
          setPendingEditorReveal(null)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setPendingEditorReveal({
                filePath: target.absolutePath,
                line: target.line ?? 1,
                column: 1,
                matchLength: 0
              })
            })
          })
        }
      } catch (sourceError) {
        const text = sourceError instanceof Error ? sourceError.message : String(sourceError)
        setError(text)
        toast.error(text)
      }
    },
    [openFile, projectPath, setPendingEditorReveal, workspace.worktreeId]
  )

  const chooseAgent = useCallback((): TuiAgent => {
    if (settingsDefaultAgent && settingsDefaultAgent !== 'blank') {
      return settingsDefaultAgent
    }
    return detectedAgentIds?.[0] ?? 'codex'
  }, [detectedAgentIds, settingsDefaultAgent])

  const startSync = useCallback(async () => {
    if (!projectPath) {
      return
    }
    let began = false
    try {
      setError('')
      setSyncing(true)
      const result = await window.api.architecture.beginSync({
        projectPath,
        modelName: workspace.title
      })
      began = true
      setDrift(result.drift)
      const agent = chooseAgent()
      const launched = launchAgentInNewTab({
        agent,
        worktreeId: workspace.worktreeId,
        prompt: result.prompt,
        launchSource: 'unknown'
      })
      if (!launched) {
        throw new Error('Could not launch an Orca agent terminal for architecture sync.')
      }
      setMessage(`Sync prompt sent to ${agent}`)
    } catch (syncError) {
      if (began) {
        await window.api.architecture.cancelSync({ projectPath }).catch(() => null)
      }
      setSyncing(false)
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setError(text)
      toast.error(text)
    }
  }, [chooseAgent, projectPath, workspace.title, workspace.worktreeId])

  const cancelSync = useCallback(async () => {
    if (!projectPath) {
      return
    }
    try {
      const restored = await window.api.architecture.cancelSync({ projectPath })
      modelRef.current = restored
      setModel(restored)
      setSelectedNodeId((current) =>
        current && restored.nodes.some((node) => node.id === current)
          ? current
          : (restored.nodes[0]?.id ?? null)
      )
      setSyncing(false)
      setMessage('Restored pre-sync architecture model')
    } catch (syncError) {
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setError(text)
      toast.error(text)
    }
  }, [projectPath])

  const finishSync = useCallback(async () => {
    if (!projectPath) {
      return
    }
    try {
      await window.api.architecture.finishSync({ projectPath })
      setSyncing(false)
      setDrift({ nodes: [], structureChanged: false })
      setMessage('Architecture sync finished')
    } catch (syncError) {
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setError(text)
      toast.error(text)
    }
  }, [projectPath])

  return (
    <div
      className="absolute inset-0 flex min-h-0 min-w-0 bg-background text-foreground"
      data-testid="architecture-panel"
    >
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <Network className="size-4 text-emerald-500" />
          <span className="truncate text-sm font-medium">{workspace.title}</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{message}</span>
          <Button variant="outline" size="xs" onClick={() => void loadModel()}>
            <RefreshCw className="size-3" />
            Reload
          </Button>
          <Button variant="outline" size="xs" onClick={() => void runDriftCheck()}>
            <GitCompareArrows className="size-3" />
            Drift
          </Button>
          <Button variant="outline" size="xs" onClick={() => void markSynced()}>
            <ShieldCheck className="size-3" />
            Synced
          </Button>
          {syncing ? (
            <>
              <Button variant="outline" size="xs" onClick={() => void finishSync()}>
                <CheckCircle2 className="size-3" />
                Finish Sync
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="border-destructive/40 text-destructive hover:text-destructive"
                onClick={() => void cancelSync()}
                data-testid="architecture-cancel-sync"
              >
                <RotateCcw className="size-3" />
                Cancel Sync
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void startSync()}
              data-testid="architecture-start-sync"
            >
              <Play className="size-3" />
              Sync
            </Button>
          )}
        </div>

        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : model ? (
          <ArchitectureCanvas
            model={model}
            syncing={syncing}
            expandedPath={expandedPath}
            selectedNodeId={selectedNodeId}
            driftedNodeIds={driftedNodeIds}
            onExpandedPathChange={setExpandedPath}
            onSelectedNodeChange={setSelectedNodeId}
            onModelChange={applyModelChange}
            onOpenSourceLocation={openSourceLocation}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading architecture model...
          </div>
        )}
      </section>

      <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-border p-3 text-sm">
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            size="sm"
            onClick={() => void addNode()}
            data-testid="architecture-add-node"
            disabled={syncing}
          >
            <Plus className="size-3.5" />
            Add Node
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => model && void persist(model, 'Saved architecture model')}
            disabled={syncing}
          >
            <Save className="size-3.5" />
          </Button>
        </div>

        {selectedNode ? (
          <>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                className="rounded border border-border bg-background px-2 py-1"
                value={selectedNode.data.name}
                onChange={(event) =>
                  setModel((current) =>
                    current
                      ? {
                          ...current,
                          nodes: current.nodes.map((node) =>
                            node.id === selectedNode.id
                              ? { ...node, data: { ...node.data, name: event.target.value } }
                              : node
                          )
                        }
                      : current
                  )
                }
                onBlur={(event) => void updateSelectedNode({ name: event.currentTarget.value })}
                data-testid="architecture-node-name"
                disabled={syncing}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Description</span>
              <textarea
                className="min-h-20 rounded border border-border bg-background px-2 py-1"
                value={selectedNode.data.description}
                onChange={(event) =>
                  setModel((current) =>
                    current
                      ? {
                          ...current,
                          nodes: current.nodes.map((node) =>
                            node.id === selectedNode.id
                              ? { ...node, data: { ...node.data, description: event.target.value } }
                              : node
                          )
                        }
                      : current
                  )
                }
                onBlur={(event) =>
                  void updateSelectedNode({ description: event.currentTarget.value })
                }
                disabled={syncing}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select
                className="rounded border border-border bg-background px-2 py-1"
                value={selectedNode.data.status ?? ''}
                onChange={(event) =>
                  void updateSelectedNode({
                    status: event.target.value ? (event.target.value as Status) : undefined
                  })
                }
                disabled={syncing}
              >
                <option value="">none</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Source pattern</span>
              <input
                className="rounded border border-border bg-background px-2 py-1"
                value={sourcePattern}
                onChange={(event) => setSourcePattern(event.target.value)}
                onBlur={(event) => void saveSourcePattern(event.currentTarget.value)}
                placeholder="src/**/*.ts"
                data-testid="architecture-source-pattern"
                disabled={syncing}
              />
            </label>

            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Edge target</span>
              <div className="flex gap-2">
                <select
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
                  value={targetNodeId}
                  onChange={(event) => setTargetNodeId(event.target.value)}
                  data-testid="architecture-edge-target"
                  disabled={syncing}
                >
                  <option value="">Select target</option>
                  {(model?.nodes ?? [])
                    .filter((node) => node.id !== selectedNode.id)
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.data.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void addEdge()}
                  disabled={syncing}
                  data-testid="architecture-add-edge"
                >
                  Add
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:text-destructive"
              onClick={() => void deleteSelected()}
              disabled={syncing}
            >
              Delete node
            </Button>
          </>
        ) : (
          <div className="rounded border border-border p-3 text-xs text-muted-foreground">
            {model?.nodes.length
              ? 'Select a node to edit it.'
              : 'Add a node to start the architecture model.'}
          </div>
        )}

        {drift ? (
          <div
            className="rounded border border-border p-3 text-xs"
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
      </aside>
    </div>
  )
}
