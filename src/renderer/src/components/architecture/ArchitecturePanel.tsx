/* eslint-disable max-lines -- Why: this first real architecture surface keeps load/save, canvas interaction, and inspector state together so the Scryer model loop is auditable while the migration is still narrow. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  GitCompareArrows,
  Link,
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
  C4Kind,
  C4ModelData,
  C4Node,
  DriftReport,
  SourceLocation,
  Status
} from '../../../../shared/scryer/model-types'
import { resolveSourceLocationTarget } from '../../../../shared/scryer/source-map-paths'
import { Button } from '../ui/button'

type DragState = {
  nodeId: string
  startX: number
  startY: number
  originX: number
  originY: number
}

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

function nextKind(parent?: C4Node | null): C4Kind {
  if (!parent) {
    return 'system'
  }
  if (parent.data.kind === 'system') {
    return 'container'
  }
  if (parent.data.kind === 'container') {
    return 'component'
  }
  return 'operation'
}

function nodeTypeForKind(kind: C4Kind): C4Node['type'] {
  if (kind === 'operation' || kind === 'process' || kind === 'model') {
    return kind
  }
  return 'c4'
}

function nodeWidth(node: C4Node): number {
  return node.data.kind === 'system' ? 220 : node.data.kind === 'container' ? 200 : 180
}

function nodeHeight(node: C4Node): number {
  return node.data.kind === 'operation' ? 78 : 96
}

function defaultPosition(kind: C4Kind, index: number): { x: number; y: number } {
  const y = kind === 'system' ? 80 : kind === 'container' ? 230 : kind === 'component' ? 380 : 520
  return { x: 80 + (index % 4) * 250, y }
}

function edgeCenter(node: C4Node): { x: number; y: number } {
  const position = node.position ?? { x: 0, y: 0 }
  return {
    x: position.x + nodeWidth(node) / 2,
    y: position.y + nodeHeight(node) / 2
  }
}

function statusClass(status?: Status): string {
  if (status === 'implemented') {
    return 'border-emerald-500/70 bg-emerald-500/10 text-emerald-100'
  }
  if (status === 'verified') {
    return 'border-sky-500/70 bg-sky-500/10 text-sky-100'
  }
  if (status === 'vagrant') {
    return 'border-zinc-500/70 bg-zinc-500/10 text-zinc-200'
  }
  return 'border-amber-500/70 bg-amber-500/10 text-amber-100'
}

function makeNode(model: C4ModelData, parent: C4Node | null): C4Node {
  const kind = nextKind(parent)
  const sameKindCount = model.nodes.filter((node) => node.data.kind === kind).length
  const id = `node-${Date.now().toString(36)}-${sameKindCount + 1}`
  return {
    id,
    type: nodeTypeForKind(kind),
    parentId: parent?.id,
    position: defaultPosition(kind, sameKindCount),
    data: {
      name: `${kind[0].toUpperCase()}${kind.slice(1)} ${sameKindCount + 1}`,
      description: '',
      kind,
      status:
        kind === 'person' || (kind === 'system' && parent?.data.external) ? undefined : 'proposed',
      contract: { expect: [], ask: [], never: [] },
      notes: []
    }
  }
}

function modelWithNode(model: C4ModelData, node: C4Node): C4ModelData {
  return { ...model, nodes: [...model.nodes, node] }
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [targetNodeId, setTargetNodeId] = useState<string>('')
  const [sourcePattern, setSourcePattern] = useState('')
  const [drift, setDrift] = useState<DriftReport | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const dragRef = useRef<DragState | null>(null)

  const selectedNode = useMemo(
    () => model?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [model, selectedNodeId]
  )

  const nodeById = useMemo(
    () => new Map((model?.nodes ?? []).map((node) => [node.id, node])),
    [model]
  )

  const loadModel = useCallback(async () => {
    if (!projectPath) {
      setModel(createEmptyModel(''))
      setError('Architecture tabs need a worktree path.')
      return
    }
    try {
      setError('')
      const loaded = await window.api.architecture.readModel({ projectPath })
      setModel(loaded)
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
      setModel(nextModel)
      await window.api.architecture.writeModel({ projectPath, model: nextModel })
      setMessage(nextMessage)
    },
    [projectPath]
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
    if (!selectedNode || !model) {
      setSourcePattern('')
      return
    }
    setSourcePattern(model.sourceMap?.[selectedNode.id]?.[0]?.pattern ?? '')
    setTargetNodeId('')
  }, [model, selectedNode])

  const addNode = useCallback(async () => {
    if (!model || syncing) {
      return
    }
    const node = makeNode(model, selectedNode)
    const nextModel = modelWithNode(model, node)
    await persist(nextModel, `Added ${node.data.name}`)
    setSelectedNodeId(node.id)
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

  const saveSourcePattern = useCallback(async () => {
    if (!model || !selectedNode || syncing) {
      return
    }
    const sourceMap = { ...model.sourceMap }
    if (sourcePattern.trim()) {
      sourceMap[selectedNode.id] = [{ pattern: sourcePattern.trim() }]
    } else {
      delete sourceMap[selectedNode.id]
    }
    await persist({ ...model, sourceMap }, `Saved source map for ${selectedNode.data.name}`)
  }, [model, persist, selectedNode, sourcePattern, syncing])

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
    const toDelete = new Set<string>([selectedNode.id])
    let changed = true
    while (changed) {
      changed = false
      for (const node of model.nodes) {
        if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(node.id)) {
          toDelete.add(node.id)
          changed = true
        }
      }
    }
    const sourceMap = { ...model.sourceMap }
    for (const id of toDelete) {
      delete sourceMap[id]
    }
    const nextModel = {
      ...model,
      nodes: model.nodes.filter((node) => !toDelete.has(node.id)),
      edges: model.edges.filter((edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)),
      sourceMap
    }
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

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || !model || syncing) {
        return
      }
      const drag = dragRef.current
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      setModel({
        ...model,
        nodes: model.nodes.map((node) =>
          node.id === drag.nodeId
            ? { ...node, position: { x: drag.originX + dx, y: drag.originY + dy } }
            : node
        )
      })
    },
    [model, syncing]
  )

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && model) {
      void persist(model, 'Saved canvas layout')
    }
  }, [model, persist])

  const canvasSize = useMemo(() => {
    const nodes = model?.nodes ?? []
    return {
      width: Math.max(900, ...nodes.map((node) => (node.position?.x ?? 0) + nodeWidth(node) + 160)),
      height: Math.max(
        620,
        ...nodes.map((node) => (node.position?.y ?? 0) + nodeHeight(node) + 160)
      )
    }
  }, [model])

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
        ) : (
          <div
            className="relative flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.18)_1px,transparent_0)] [background-size:24px_24px]"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            data-testid="architecture-canvas"
          >
            <div
              className="relative"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              <svg className="absolute inset-0 size-full" aria-hidden="true">
                {(model?.edges ?? []).map((edge) => {
                  const source = nodeById.get(edge.source)
                  const target = nodeById.get(edge.target)
                  if (!source || !target) {
                    return null
                  }
                  const a = edgeCenter(source)
                  const b = edgeCenter(target)
                  return (
                    <g key={edge.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="rgba(148,163,184,0.65)"
                        strokeWidth="2"
                      />
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 6}
                        className="fill-muted-foreground text-[11px]"
                      >
                        {edge.data?.label ?? ''}
                      </text>
                    </g>
                  )
                })}
              </svg>
              {(model?.nodes ?? []).map((node) => {
                const position = node.position ?? { x: 0, y: 0 }
                const selected = selectedNodeId === node.id
                return (
                  <div
                    key={node.id}
                    className={`absolute rounded-md border bg-background/95 p-3 shadow-sm transition ${selected ? 'border-emerald-400 ring-1 ring-emerald-400/60' : 'border-border'}`}
                    style={{
                      width: nodeWidth(node),
                      minHeight: nodeHeight(node),
                      transform: `translate(${position.x}px, ${position.y}px)`
                    }}
                    data-testid="architecture-node"
                    data-node-id={node.id}
                    onPointerDown={(event) => {
                      setSelectedNodeId(node.id)
                      if (syncing) {
                        return
                      }
                      dragRef.current = {
                        nodeId: node.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: position.x,
                        originY: position.y
                      }
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Boxes className="size-3.5 text-emerald-400" />
                      <span className="truncate text-sm font-medium">{node.data.name}</span>
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-muted-foreground">
                      {node.data.kind}
                    </div>
                    {node.data.status ? (
                      <div
                        className={`mt-2 inline-flex rounded border px-1.5 py-0.5 text-[11px] ${statusClass(node.data.status)}`}
                      >
                        {node.data.status}
                      </div>
                    ) : null}
                    {node.data.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {node.data.description}
                      </p>
                    ) : null}
                    {(model?.sourceMap?.[node.id] ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(model?.sourceMap?.[node.id] ?? []).map((location, index) => (
                          <Button
                            key={`${location.pattern}-${index}`}
                            variant="outline"
                            size="xs"
                            className="h-6 max-w-full justify-start px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              void openSourceLocation(location)
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            data-testid="architecture-source-link"
                            title={location.pattern}
                          >
                            <Link className="size-3" />
                            <span className="truncate">{location.pattern}</span>
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
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
                onBlur={() => void saveSourcePattern()}
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
