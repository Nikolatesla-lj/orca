/* eslint-disable max-lines -- Why: this hook centralizes Scryer's model storage, selection, history, drift, and sync controller logic before it is split into narrower hooks. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { detectLanguage } from '../../lib/language-detect'
import { launchAgentInNewTab } from '../../lib/launch-agent-in-new-tab'
import { useAppStore } from '../../store'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { ArchitectureWorkspace } from '../../../../shared/types'
import {
  parseModelData,
  pruneDiagramRefsForDeletedTarget,
  serializeModelData
} from '../../../../shared/scryer/parse-model'
import type {
  C4Edge,
  C4Kind,
  C4ModelData,
  C4ModelDataV2,
  C4Node,
  C4NodeData,
  Diagram,
  DiagramRef,
  DiagramRefTarget,
  DiagramKind,
  DriftReport,
  Flow,
  Group,
  SourceLocation
} from '../../../../shared/scryer/model-types'
import { SCRY_SCHEMA_VERSION as CURRENT_SCRY_SCHEMA_VERSION } from '../../../../shared/scryer/model-types'
import {
  resolveSourceLocationTarget,
  uniqueSourceRootCandidates
} from '../../../../shared/scryer/source-map-paths'
import type { ModelUpdater } from './ArchitectureCanvas'
import type { SyncStatus } from './SyncBar'
import {
  addMembersToGroupInModel,
  analyzeExternalModelUpdate,
  createGroupFromSelectedNodes,
  createNodeForParent,
  deleteEdgesFromModel,
  deleteNodesFromModel,
  isExpandableKind,
  reconcileExpandedPath,
  updateEdgeDataInModel
} from './c4-model'
import { sortDiagramsForLibrary } from '../../../../shared/scryer/diagram-ids'
import {
  createDefaultDiagramSource,
  createDiagram as createDiagramInModel,
  createDiagramRef as createDiagramRefInModel,
  createDiagramExternalReloadConflict,
  deleteDiagram as deleteDiagramInModel,
  deleteDiagramRefs as deleteDiagramRefsInModel,
  DiagramControllerError,
  renameDiagram as renameDiagramInModel,
  shouldPromptForDiagramDraftSwitch,
  upsertDiagramRefs as upsertDiagramRefsInModel,
  updateDiagramSource as updateDiagramSourceInModel,
  type ArchitectureNavigationTarget,
  type CreateDiagramRefInput,
  type DiagramExternalReloadConflict,
  type DiagramDraftStateSnapshot,
  type DiagramExternalReloadResolution
} from './diagram-controller'
import {
  sanitizeClientModelName,
  useArchitectureModelSession,
  type ArchitectureProjectModelEntry
} from './useArchitectureModelSession'
import { useArchitectureAiRunSession } from './useArchitectureAiRunSession'

export type {
  ArchitectureProjectModelEntry,
  ArchitectureTemplateEntry
} from './useArchitectureModelSession'

export type ArchitectureMode = 'topology' | 'flows' | 'groups' | 'diagram'

export type DiagramDraftSwitchDialog = {
  diagramId: string
  target: ArchitectureNavigationTarget
  error: string | null
}

export type DiagramSourceOpenLocation = {
  relativePath: string
  line?: number
  endLine?: number
}

export type DiagramSourceTargetPickerState = {
  projectPath: string
  locations: DiagramSourceOpenLocation[]
}

type DiagramSourceTargetOpenResult =
  | { ok: true; action: 'opened' | 'selection-required'; locations: DiagramSourceOpenLocation[] }
  | {
      ok: false
      code: 'controller.invalid-source-target' | 'controller.source-open-failed'
      reason: string
      rejectedPattern: string
    }

type SyncSessionStatus = SyncStatus
const EMPTY_PTY_IDS: string[] = []
export const ARCHITECTURE_HISTORY_LIMIT = 10
export const ARCHITECTURE_HISTORY_BATCH_MS = 1_000

type ActiveArchitectureSyncTerminal = {
  projectPath: string
  tabId: string
  ptyIds: Set<string>
  startedAt: number
  finishing: boolean
}

export function pushArchitectureUndoSnapshot(
  stack: C4ModelData[],
  snapshot: C4ModelData,
  args: { batchStartedAt: number | null; now: number }
): { stack: C4ModelData[]; batchStartedAt: number; captured: boolean } {
  if (
    args.batchStartedAt !== null &&
    args.now - args.batchStartedAt < ARCHITECTURE_HISTORY_BATCH_MS
  ) {
    return { stack, batchStartedAt: args.batchStartedAt, captured: false }
  }

  return {
    stack: [...stack, snapshot].slice(-ARCHITECTURE_HISTORY_LIMIT),
    batchStartedAt: args.now,
    captured: true
  }
}

const activeArchitectureSyncTerminals = new Map<string, ActiveArchitectureSyncTerminal>()
let syncTerminalStoreUnsubscribe: (() => void) | null = null
let syncTerminalExitUnsubscribe: (() => void) | null = null

function cleanupArchitectureSyncTerminalWatchers(): void {
  if (activeArchitectureSyncTerminals.size > 0) {
    return
  }
  syncTerminalStoreUnsubscribe?.()
  syncTerminalStoreUnsubscribe = null
  syncTerminalExitUnsubscribe?.()
  syncTerminalExitUnsubscribe = null
}

export function findCompletedArchitectureSyncPane(args: {
  tabId: string
  startedAt: number
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
}): { paneKey: string; interrupted: boolean } | null {
  const panePrefix = `${args.tabId}:`
  for (const [paneKey, entry] of Object.entries(args.agentStatusByPaneKey)) {
    if (!paneKey.startsWith(panePrefix)) {
      continue
    }
    if (entry.updatedAt < args.startedAt) {
      continue
    }
    if (entry.state === 'done') {
      return { paneKey, interrupted: entry.interrupted === true }
    }
  }
  return null
}

function finishTrackedArchitectureSync(
  tabId: string,
  session: ActiveArchitectureSyncTerminal
): void {
  if (session.finishing) {
    return
  }
  session.finishing = true
  void window.api.architecture
    .finishSync({ projectPath: session.projectPath })
    .catch((error: unknown) => {
      console.error('[architecture] auto finish sync failed', error)
    })
    .finally(() => {
      activeArchitectureSyncTerminals.delete(tabId)
      cleanupArchitectureSyncTerminalWatchers()
    })
}

function ensureArchitectureSyncTerminalWatchers(): void {
  if (!syncTerminalStoreUnsubscribe) {
    syncTerminalStoreUnsubscribe = useAppStore.subscribe((state) => {
      for (const [tabId, session] of activeArchitectureSyncTerminals) {
        for (const ptyId of state.ptyIdsByTabId[session.tabId] ?? []) {
          session.ptyIds.add(ptyId)
        }
        const completed = findCompletedArchitectureSyncPane({
          tabId: session.tabId,
          startedAt: session.startedAt,
          agentStatusByPaneKey: state.agentStatusByPaneKey
        })
        if (!completed) {
          continue
        }
        if (completed.interrupted) {
          activeArchitectureSyncTerminals.delete(tabId)
          cleanupArchitectureSyncTerminalWatchers()
          continue
        }
        finishTrackedArchitectureSync(tabId, session)
      }
    })
  }

  if (!syncTerminalExitUnsubscribe) {
    syncTerminalExitUnsubscribe = window.api.pty.onExit(({ id, code }) => {
      for (const [tabId, session] of activeArchitectureSyncTerminals) {
        if (!session.ptyIds.has(id)) {
          continue
        }
        session.ptyIds.delete(id)
        if (code === 0) {
          finishTrackedArchitectureSync(tabId, session)
          return
        }
        activeArchitectureSyncTerminals.delete(tabId)
        cleanupArchitectureSyncTerminalWatchers()
      }
    })
  }
}

function trackArchitectureSyncTerminal(projectPath: string, tabId: string): void {
  const state = useAppStore.getState()
  const session: ActiveArchitectureSyncTerminal = {
    projectPath,
    tabId,
    ptyIds: new Set(state.ptyIdsByTabId[tabId] ?? []),
    startedAt: Date.now(),
    finishing: false
  }
  activeArchitectureSyncTerminals.set(tabId, session)
  ensureArchitectureSyncTerminalWatchers()
}

function readInitialFollowExternalChanges(): boolean {
  try {
    return window.localStorage.getItem('orca-scryer:follow-external-changes') !== 'false'
  } catch {
    return true
  }
}

function createFlowId(): string {
  return `flow-${globalThis.crypto.randomUUID()}`
}

function rootPathForSourceTarget(absolutePath: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\//g, absolutePath.includes('\\') ? '\\' : '/')
  return absolutePath.endsWith(normalizedRelative)
    ? absolutePath.slice(0, -normalizedRelative.length).replace(/[\\/]+$/, '')
    : absolutePath
}

function buildAncestorPath(model: C4ModelData, nodeId: string): string[] {
  const path: string[] = []
  let current = model.nodes.find((node) => node.id === nodeId)?.parentId ?? undefined
  while (current) {
    path.unshift(current)
    current = model.nodes.find((node) => node.id === current)?.parentId
  }
  return path
}

export function createEmptyArchitectureModel(projectPath: string): C4ModelDataV2 {
  return {
    schemaVersion: CURRENT_SCRY_SCHEMA_VERSION,
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    projectPath,
    refPositions: {},
    groups: [],
    flows: [],
    diagrams: [],
    diagramRefs: []
  }
}

function stableFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableFingerprintValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const nextValue = (value as Record<string, unknown>)[key]
    if (nextValue !== undefined && typeof nextValue !== 'function') {
      result[key] = stableFingerprintValue(nextValue)
    }
  }
  return result
}

export function fingerprintArchitectureModel(model: C4ModelData): string {
  return JSON.stringify(stableFingerprintValue(parseModelData(serializeModelData(model))))
}

function fingerprintNodeData(data: C4NodeData): string {
  return JSON.stringify(stableFingerprintValue(data))
}

function nodeDiffDismissalKey(modelName: string, nodeId: string): string {
  return `${sanitizeClientModelName(modelName)}:${nodeId}`
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function collectFlowStepIds(steps: Flow['steps']): Set<string> {
  const ids = new Set<string>()
  const visit = (nestedSteps: Flow['steps']): void => {
    for (const step of nestedSteps) {
      ids.add(step.id)
      for (const branch of step.branches ?? []) {
        visit(branch.steps)
      }
    }
  }
  visit(steps)
  return ids
}

function isArchitecturePanelEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tagName = target.tagName.toLowerCase()
  return (
    !!target.closest('[data-testid="architecture-panel"]') &&
    (tagName === 'input' || tagName === 'textarea' || target.isContentEditable)
  )
}

function toDiagramPersistError(error: unknown, operation: string): DiagramControllerError {
  if (error instanceof DiagramControllerError) {
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  const code = message.toLowerCase().includes('changed on disk')
    ? 'controller.revision-conflict'
    : 'controller.persist-failed'
  return new DiagramControllerError(code, message, { operation })
}

export function useArchitectureModelController({
  workspace
}: {
  workspace: ArchitectureWorkspace
}) {
  const projectPath = workspace.projectPath ?? ''
  const openFile = useAppStore((state) => state.openFile)
  const setPendingEditorReveal = useAppStore((state) => state.setPendingEditorReveal)
  const setArchitectureModelRef = useAppStore((state) => state.setArchitectureModelRef)
  const settingsDefaultAgent = useAppStore((state) => state.settings?.defaultTuiAgent)
  const detectedAgentIds = useAppStore((state) => state.detectedAgentIds)
  const [model, setModel] = useState<C4ModelData | null>(null)
  const modelRef = useRef<C4ModelData | null>(null)
  const loadRequestIdRef = useRef(0)
  const lastKnownModelFingerprintRef = useRef('')
  const undoStackRef = useRef<C4ModelData[]>([])
  const redoStackRef = useRef<C4ModelData[]>([])
  const historyBatchStartedAtRef = useRef<number | null>(null)
  const expandedPathRef = useRef<string[]>([])
  const lastCodeLevelParentIdRef = useRef<string | null>(null)
  const followExternalChangesRef = useRef(true)
  const selectedNodeIdRef = useRef<string | null>(null)
  const sourcePatternSyncRef = useRef<{ nodeId: string | null; pattern: string } | null>(null)
  const selectedEdgeIdRef = useRef<string | null>(null)
  const syncTerminalHadPtyRef = useRef(false)
  const syncTerminalPtyIdsRef = useRef<Set<string>>(new Set())
  const autoFinishingSyncRef = useRef(false)
  const syncResolutionRef = useRef<'cancel' | 'finish' | null>(null)
  const activeModelReloadRef = useRef<() => void>(() => {})
  const activeModelRemovedRef = useRef<
    (removedModelName: string, knownModels: ArchitectureProjectModelEntry[]) => void
  >(() => {})
  const [architectureMode, setArchitectureMode] = useState<ArchitectureMode>('topology')
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null)
  const diagramDraftStateRef = useRef<DiagramDraftStateSnapshot | null>(null)
  const externalDiagramReloadDiskModelRef = useRef<{
    modelName: string
    model: C4ModelData
    revision: string
  } | null>(null)
  const [externalDiagramReloadConflict, setExternalDiagramReloadConflict] =
    useState<DiagramExternalReloadConflict | null>(null)
  const pendingDiagramNavigationRef = useRef<{
    target: ArchitectureNavigationTarget
    resolve: (allowed: boolean) => void
  } | null>(null)
  const [diagramDraftSwitchDialog, setDiagramDraftSwitchDialog] =
    useState<DiagramDraftSwitchDialog | null>(null)
  const [diagramSourceTargetPicker, setDiagramSourceTargetPicker] =
    useState<DiagramSourceTargetPickerState | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<string[]>([])
  const [totalSelected, setTotalSelected] = useState(0)
  const [expandedPath, setExpandedPath] = useState<string[]>([])
  const [followExternalChanges, setFollowExternalChanges] = useState(
    readInitialFollowExternalChanges
  )
  const [changedNodeIds, setChangedNodeIds] = useState<Set<string>>(new Set())
  const [nodeDiffs, setNodeDiffs] = useState<Map<string, C4NodeData>>(new Map())
  const dismissedNodeDiffKeysRef = useRef<Map<string, string>>(new Map())
  const [targetNodeId, setTargetNodeId] = useState<string>('')
  const [sourcePattern, setSourcePattern] = useState('')
  const [drift, setDrift] = useState<DriftReport | null>(null)
  const [implementing, setImplementing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncSessionStatus>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [syncTerminalTabId, setSyncTerminalTabId] = useState<string | null>(null)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const aiRunSession = useArchitectureAiRunSession()

  const handleModelSessionError = useCallback((sessionError: unknown) => {
    setError(sessionError instanceof Error ? sessionError.message : String(sessionError))
  }, [])

  const modelSession = useArchitectureModelSession({
    workspace,
    projectPath,
    setArchitectureModelRef,
    isActiveModelEditableTarget: () => isArchitecturePanelEditableTarget(document.activeElement),
    onActiveModelReload: () => activeModelReloadRef.current(),
    onActiveModelRemoved: (removedModelName, knownModels) =>
      activeModelRemovedRef.current(removedModelName, knownModels),
    onError: handleModelSessionError
  })
  const {
    activeModelName,
    activeModelNameRef,
    projectModels,
    templates,
    readModelDocument,
    acceptLoadedModelDocument,
    prepareActiveModelName,
    refreshProjectModels,
    scheduleModelWrite,
    writePendingModelNow,
    getActiveModelRevision,
    patchActiveNodeData
  } = modelSession

  const currentParentId = expandedPath.at(-1)
  const currentParent = useMemo(
    () => model?.nodes.find((node) => node.id === currentParentId) ?? null,
    [currentParentId, model]
  )
  const currentParentKind = currentParent?.data.kind
  const canShowGroups = currentParentKind === 'system' || currentParentKind === 'container'
  const canGroupMultiSelection =
    architectureMode === 'topology' &&
    !!currentParentId &&
    currentParentKind !== 'component' &&
    multiSelectedNodeIds.length >= 2

  const selectedNodeById = useMemo(
    () => model?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [model, selectedNodeId]
  )
  const selectedEdge = useMemo(
    () => model?.edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [model, selectedEdgeId]
  )
  const selectedGroup = useMemo(
    () => model?.groups?.find((group) => group.id === selectedGroupId) ?? null,
    [model, selectedGroupId]
  )

  const driftedNodeIds = useMemo(
    () => new Set((drift?.nodes ?? []).map((node) => node.nodeId)),
    [drift]
  )

  const activeFlow = useMemo(
    () => (model?.flows ?? []).find((flow) => flow.id === activeFlowId) ?? null,
    [activeFlowId, model]
  )
  const codeLevelNodes = useMemo(
    () =>
      model && currentParentKind === 'component' && currentParentId
        ? model.nodes.filter(
            (node) =>
              node.parentId === currentParentId &&
              (node.data.kind === 'operation' ||
                node.data.kind === 'process' ||
                node.data.kind === 'model')
          )
        : [],
    [currentParentId, currentParentKind, model]
  )
  const selectedNode = useMemo(() => {
    if (selectedNodeById) {
      return selectedNodeById
    }
    if (currentParentKind !== 'component') {
      return null
    }
    return (
      codeLevelNodes.find((node) => node.id === selectedNodeIdRef.current) ??
      codeLevelNodes[0] ??
      null
    )
  }, [codeLevelNodes, currentParentKind, selectedNodeById])
  const selectedSourcePattern = selectedNode
    ? (model?.sourceMap?.[selectedNode.id]?.[0]?.pattern ?? '')
    : ''

  const activeAgent = useMemo(() => {
    if (!projectPath) {
      return null
    }
    const name =
      settingsDefaultAgent && settingsDefaultAgent !== 'blank'
        ? settingsDefaultAgent
        : (detectedAgentIds?.[0] ?? 'codex')
    return { name, available: true }
  }, [detectedAgentIds, projectPath, settingsDefaultAgent])

  const editingLocked = syncStatus === 'running' || implementing
  const syncTerminalPtyIds = useAppStore((state) =>
    syncTerminalTabId ? (state.ptyIdsByTabId[syncTerminalTabId] ?? EMPTY_PTY_IDS) : EMPTY_PTY_IDS
  )
  const syncTerminalPtyIdsKey = syncTerminalPtyIds.join('\0')
  const syncTerminalPtyCount = syncTerminalPtyIds.length
  const canUndo = historyRevision >= 0 && undoStackRef.current.length > 0
  const canRedo = historyRevision >= 0 && redoStackRef.current.length > 0

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId
  }, [selectedEdgeId])

  useEffect(() => {
    expandedPathRef.current = expandedPath
  }, [expandedPath])

  useEffect(() => {
    if (currentParentKind === 'component' && currentParentId) {
      lastCodeLevelParentIdRef.current = currentParentId
    }
  }, [currentParentId, currentParentKind])

  useEffect(() => {
    followExternalChangesRef.current = followExternalChanges
    try {
      window.localStorage.setItem(
        'orca-scryer:follow-external-changes',
        String(followExternalChanges)
      )
    } catch {
      // Storage can be unavailable in constrained test windows; the current state still works.
    }
  }, [followExternalChanges])

  useEffect(() => {
    if (architectureMode !== 'topology') {
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setMultiSelectedNodeIds([])
      setTotalSelected(0)
    }
    if (architectureMode !== 'groups') {
      setSelectedGroupId(null)
    }
  }, [architectureMode])

  const loadModel = useCallback(
    async (requestedModelName?: string | null) => {
      const requestId = loadRequestIdRef.current + 1
      loadRequestIdRef.current = requestId
      if (!projectPath) {
        const emptyModel = createEmptyArchitectureModel('')
        if (requestId !== loadRequestIdRef.current) {
          return
        }
        modelRef.current = emptyModel
        setModel(emptyModel)
        setError('Architecture tabs need a worktree path.')
        externalDiagramReloadDiskModelRef.current = null
        setExternalDiagramReloadConflict(null)
        diagramDraftStateRef.current = null
        setActiveDiagramId(null)
        return
      }
      const nextActiveModelName = sanitizeClientModelName(
        requestedModelName ?? activeModelNameRef.current
      )
      try {
        setError('')
        const knownModels = await window.api.architecture.listModels({ projectPath })
        const projectModelNames = new Set(
          knownModels.filter((entry) => entry.scope === 'project').map((entry) => entry.name)
        )
        if (
          !projectModelNames.has(nextActiveModelName) &&
          !knownModels.some((entry) => entry.scope === 'project')
        ) {
          const emptyModel = createEmptyArchitectureModel(projectPath)
          const emptyFingerprint = fingerprintArchitectureModel(emptyModel)
          if (requestId !== loadRequestIdRef.current) {
            return
          }
          modelRef.current = emptyModel
          lastKnownModelFingerprintRef.current = emptyFingerprint
          externalDiagramReloadDiskModelRef.current = null
          setExternalDiagramReloadConflict(null)
          diagramDraftStateRef.current = null
          selectedNodeIdRef.current = null
          selectedEdgeIdRef.current = null
          undoStackRef.current = []
          redoStackRef.current = []
          historyBatchStartedAtRef.current = null
          setHistoryRevision((revision) => revision + 1)
          setModel(emptyModel)
          setExpandedPath([])
          setActiveFlowId(null)
          setActiveDiagramId(null)
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
          setSelectedGroupId(null)
          setMultiSelectedNodeIds([])
          setTotalSelected(0)
          setChangedNodeIds(new Set())
          setNodeDiffs(new Map())
          setImplementing(false)
          setSyncStatus((current) => (current === 'running' ? 'idle' : current))
          void refreshProjectModels()
          setMessage(`Model ready: ${nextActiveModelName}`)
          return
        }
        const modelNameToLoad = projectModelNames.has(nextActiveModelName)
          ? nextActiveModelName
          : (knownModels.find((entry) => entry.scope === 'project')?.name ?? nextActiveModelName)
        const loadedDocument = await readModelDocument(modelNameToLoad)
        if (requestId !== loadRequestIdRef.current) {
          return
        }
        const loaded = loadedDocument.model
        const loadedFingerprint = fingerprintArchitectureModel(loaded)
        const previous = modelRef.current
        const currentSelectedNodeId = selectedNodeIdRef.current
        const currentSelectedEdgeId = selectedEdgeIdRef.current
        const nodeStillSelected =
          !!currentSelectedNodeId && loaded.nodes.some((node) => node.id === currentSelectedNodeId)
        const edgeStillSelected =
          !!currentSelectedEdgeId && loaded.edges.some((edge) => edge.id === currentSelectedEdgeId)

        let nextModel = loaded
        let nextExpandedPath: string[] | null = null
        let nextExternalNodeId: string | null = null
        if (
          previous &&
          lastKnownModelFingerprintRef.current &&
          loadedFingerprint !== lastKnownModelFingerprintRef.current
        ) {
          const summary = analyzeExternalModelUpdate({
            previous,
            incoming: loaded,
            expandedPath: expandedPathRef.current,
            followExternalChanges: followExternalChangesRef.current
          })
          nextModel = summary.model
          nextExpandedPath = summary.expandedPath
          if (followExternalChangesRef.current) {
            nextExternalNodeId =
              summary.nodeDiffs.keys().next().value ??
              [...summary.changedNodeIds].find((nodeId) =>
                nextModel.nodes.some((node) => node.id === nodeId)
              ) ??
              null
          }
          if (summary.changedNodeIds.size > 0) {
            setChangedNodeIds((current) => new Set([...current, ...summary.changedNodeIds]))
          }
          if (summary.nodeDiffs.size > 0) {
            setNodeDiffs((current) => {
              const merged = new Map(current)
              for (const [nodeId, oldData] of summary.nodeDiffs) {
                const currentNode = nextModel.nodes.find((node) => node.id === nodeId)
                if (
                  currentNode &&
                  dismissedNodeDiffKeysRef.current.get(
                    nodeDiffDismissalKey(modelNameToLoad, nodeId)
                  ) === fingerprintNodeData(currentNode.data)
                ) {
                  continue
                }
                if (!merged.has(nodeId)) {
                  merged.set(nodeId, oldData)
                }
              }
              return merged
            })
          }
        }

        const [nextImplementing, hasPreSyncSnapshot] = await Promise.all([
          window.api.architecture.isSyncing({ projectPath }),
          window.api.architecture.hasPreSyncSnapshot({ projectPath })
        ])
        if (requestId !== loadRequestIdRef.current) {
          return
        }

        lastKnownModelFingerprintRef.current = loadedFingerprint
        acceptLoadedModelDocument(modelNameToLoad, loadedDocument.revision)
        modelRef.current = nextModel
        externalDiagramReloadDiskModelRef.current = null
        setExternalDiagramReloadConflict(null)
        diagramDraftStateRef.current = null
        setModel(nextModel)
        setExpandedPath((current) => nextExpandedPath ?? reconcileExpandedPath(nextModel, current))
        setActiveFlowId((current) =>
          current && (nextModel.flows ?? []).some((flow) => flow.id === current)
            ? current
            : (nextModel.flows?.[0]?.id ?? null)
        )
        setActiveDiagramId((current) =>
          current && (nextModel.diagrams ?? []).some((diagram) => diagram.id === current)
            ? current
            : null
        )
        const nextSelectedNodeId =
          nextExternalNodeId ??
          (nodeStillSelected
            ? currentSelectedNodeId
            : edgeStillSelected
              ? null
              : (nextModel.nodes[0]?.id ?? null))
        const nextSelectedEdgeId = nextSelectedNodeId
          ? null
          : edgeStillSelected
            ? currentSelectedEdgeId
            : null
        selectedNodeIdRef.current = nextSelectedNodeId
        selectedEdgeIdRef.current = nextSelectedEdgeId
        setSelectedNodeId(nextSelectedNodeId)
        setSelectedEdgeId(nextSelectedEdgeId)
        setSelectedGroupId((current) =>
          current && (nextModel.groups ?? []).some((group) => group.id === current) ? current : null
        )
        setImplementing(nextImplementing)
        setSyncStatus((current) => {
          if (nextImplementing && hasPreSyncSnapshot) {
            return 'running'
          }
          return current === 'running' ? 'idle' : current
        })
        if (nextImplementing && hasPreSyncSnapshot) {
          setSyncLog((current) =>
            current.length > 0 ? current : ['Architecture sync is still in progress']
          )
        }
        void refreshProjectModels()
        setMessage(`Model loaded: ${modelNameToLoad}`)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    },
    [
      acceptLoadedModelDocument,
      activeModelNameRef,
      projectPath,
      readModelDocument,
      refreshProjectModels
    ]
  )

  const reloadActiveModel = useCallback(async () => {
    const snapshot = diagramDraftStateRef.current
    const modelNameToLoad = sanitizeClientModelName(activeModelNameRef.current)
    if (!snapshot?.dirty) {
      await loadModel(modelNameToLoad)
      return
    }
    try {
      setError('')
      const loadedDocument = await readModelDocument(modelNameToLoad)
      const diskDiagram =
        loadedDocument.model.diagrams?.find((diagram) => diagram.id === snapshot.diagramId) ?? null
      const conflict = createDiagramExternalReloadConflict({
        modelName: modelNameToLoad,
        snapshot,
        diskDiagram,
        baseRevision: getActiveModelRevision() ?? '',
        diskRevision: loadedDocument.revision
      })
      if (!conflict) {
        await loadModel(modelNameToLoad)
        return
      }
      externalDiagramReloadDiskModelRef.current = {
        modelName: modelNameToLoad,
        model: loadedDocument.model,
        revision: loadedDocument.revision
      }
      setExternalDiagramReloadConflict(conflict)
      setMessage('Diagram source changed on disk')
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : String(reloadError))
    }
  }, [activeModelNameRef, getActiveModelRevision, loadModel, readModelDocument])

  const loadFallbackModelAfterRemoval = useCallback(
    async (removedModelName: string, knownModels?: ArchitectureProjectModelEntry[]) => {
      if (!projectPath) {
        return
      }
      const remaining = knownModels ?? (await window.api.architecture.listModels({ projectPath }))
      const nextName =
        remaining.find((entry) => entry.name !== removedModelName)?.name ??
        remaining[0]?.name ??
        'model'
      if (remaining.length === 0) {
        await window.api.architecture.createModel({ projectPath, modelName: nextName })
      }
      await loadModel(nextName)
      void refreshProjectModels()
    },
    [loadModel, projectPath, refreshProjectModels]
  )

  const persist = useCallback(
    async (
      nextModel: C4ModelData,
      nextMessage: string,
      options: { captureHistory?: boolean } = {}
    ) => {
      if (!projectPath) {
        return
      }
      const current = modelRef.current
      if (
        options.captureHistory !== false &&
        current &&
        fingerprintArchitectureModel(current) !== fingerprintArchitectureModel(nextModel)
      ) {
        const history = pushArchitectureUndoSnapshot(undoStackRef.current, current, {
          batchStartedAt: historyBatchStartedAtRef.current,
          now: Date.now()
        })
        undoStackRef.current = history.stack
        historyBatchStartedAtRef.current = history.batchStartedAt
        redoStackRef.current = []
        setHistoryRevision((revision) => revision + 1)
      }
      const nextFingerprint = fingerprintArchitectureModel(nextModel)
      modelRef.current = nextModel
      setModel(nextModel)
      lastKnownModelFingerprintRef.current = nextFingerprint
      scheduleModelWrite(nextModel)
      setMessage(nextMessage)
    },
    [projectPath, scheduleModelWrite]
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

  const undoModelChange = useCallback(async () => {
    if (editingLocked) {
      return
    }
    const current = modelRef.current
    const snapshot = undoStackRef.current.at(-1)
    if (!current || !snapshot) {
      return
    }
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, current].slice(-ARCHITECTURE_HISTORY_LIMIT)
    historyBatchStartedAtRef.current = null
    setHistoryRevision((revision) => revision + 1)
    await persist(snapshot, 'Undid architecture change', { captureHistory: false })
    setExpandedPath((path) => reconcileExpandedPath(snapshot, path))
    setSelectedNodeId((selected) =>
      selected && snapshot.nodes.some((node) => node.id === selected)
        ? selected
        : (snapshot.nodes[0]?.id ?? null)
    )
    setSelectedEdgeId((selected) =>
      selected && snapshot.edges.some((edge) => edge.id === selected) ? selected : null
    )
  }, [editingLocked, persist])

  const redoModelChange = useCallback(async () => {
    if (editingLocked) {
      return
    }
    const current = modelRef.current
    const snapshot = redoStackRef.current.at(-1)
    if (!current || !snapshot) {
      return
    }
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, current].slice(-ARCHITECTURE_HISTORY_LIMIT)
    historyBatchStartedAtRef.current = null
    setHistoryRevision((revision) => revision + 1)
    await persist(snapshot, 'Redid architecture change', { captureHistory: false })
    setExpandedPath((path) => reconcileExpandedPath(snapshot, path))
    setSelectedNodeId((selected) =>
      selected && snapshot.nodes.some((node) => node.id === selected)
        ? selected
        : (snapshot.nodes[0]?.id ?? null)
    )
    setSelectedEdgeId((selected) =>
      selected && snapshot.edges.some((edge) => edge.id === selected) ? selected : null
    )
  }, [editingLocked, persist])

  useEffect(() => {
    void loadModel()
  }, [loadModel])

  useEffect(() => {
    activeModelReloadRef.current = () => void reloadActiveModel()
    activeModelRemovedRef.current = (removedModelName, knownModels) => {
      void loadFallbackModelAfterRemoval(removedModelName, knownModels)
    }
  }, [loadFallbackModelAfterRemoval, reloadActiveModel])

  const createBlankProjectModel = useCallback(
    async (modelName: string, targetProjectPath?: string) => {
      const nextProjectPath = targetProjectPath ?? projectPath
      if (!nextProjectPath || editingLocked) {
        return sanitizeClientModelName(modelName)
      }
      const result = await window.api.architecture.createModel({
        projectPath: nextProjectPath,
        modelName
      })
      undoStackRef.current = []
      redoStackRef.current = []
      historyBatchStartedAtRef.current = null
      setHistoryRevision((revision) => revision + 1)
      if (nextProjectPath === projectPath) {
        await loadModel(result.modelName)
      } else {
        prepareActiveModelName(result.modelName)
      }
      void refreshProjectModels()
      return result.modelName
    },
    [editingLocked, loadModel, prepareActiveModelName, projectPath, refreshProjectModels]
  )

  const createModelFromTemplate = useCallback(
    async (templateId: string, modelName: string) => {
      if (!projectPath || editingLocked) {
        return
      }
      const result = await window.api.architecture.createModel({
        projectPath,
        modelName,
        templateId
      })
      undoStackRef.current = []
      redoStackRef.current = []
      historyBatchStartedAtRef.current = null
      setHistoryRevision((revision) => revision + 1)
      await loadModel(result.modelName)
    },
    [editingLocked, loadModel, projectPath]
  )

  const openProjectModel = useCallback(
    async (modelName: string, scope: ArchitectureProjectModelEntry['scope'] = 'project') => {
      if (editingLocked) {
        return
      }
      undoStackRef.current = []
      redoStackRef.current = []
      historyBatchStartedAtRef.current = null
      setHistoryRevision((revision) => revision + 1)
      await writePendingModelNow()
      if (projectPath && scope === 'global') {
        const result = await window.api.architecture.migrateGlobalModel({ projectPath, modelName })
        await loadModel(result.modelName)
        return
      }
      await loadModel(modelName)
    },
    [editingLocked, loadModel, projectPath, writePendingModelNow]
  )

  const saveCurrentModelAs = useCallback(
    async (modelName: string) => {
      if (!projectPath || editingLocked) {
        return
      }
      await writePendingModelNow()
      const result = await window.api.architecture.saveModelAs({
        projectPath,
        fromModelName: activeModelNameRef.current,
        toModelName: modelName
      })
      undoStackRef.current = []
      redoStackRef.current = []
      historyBatchStartedAtRef.current = null
      setHistoryRevision((revision) => revision + 1)
      await loadModel(result.modelName)
    },
    [activeModelNameRef, editingLocked, loadModel, projectPath, writePendingModelNow]
  )

  const deleteProjectModelByName = useCallback(
    async (modelName: string) => {
      if (!projectPath || editingLocked) {
        return
      }
      await writePendingModelNow()
      const removedModelName = sanitizeClientModelName(modelName)
      await window.api.architecture.deleteModel({ projectPath, modelName })
      await loadFallbackModelAfterRemoval(removedModelName)
    },
    [editingLocked, loadFallbackModelAfterRemoval, projectPath, writePendingModelNow]
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return
      }
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        void undoModelChange()
      } else if (
        event.key.toLowerCase() === 'y' ||
        (event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault()
        void redoModelChange()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [redoModelChange, undoModelChange])

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

  useEffect(() => {
    if (
      currentParentKind !== 'component' ||
      selectedNodeId ||
      selectedEdgeId ||
      codeLevelNodes.length === 0
    ) {
      return
    }
    const fallbackNodeId =
      codeLevelNodes.find((node) => node.id === selectedNodeIdRef.current)?.id ??
      codeLevelNodes[0]?.id
    if (!fallbackNodeId) {
      return
    }
    selectedNodeIdRef.current = fallbackNodeId
    setSelectedNodeId(fallbackNodeId)
  }, [codeLevelNodes, currentParentKind, selectedEdgeId, selectedNodeId])

  useEffect(() => {
    if (selectedNodeId || selectedEdgeId || architectureMode !== 'topology' || !model) {
      return
    }
    const lastCodeLevelParentId = lastCodeLevelParentIdRef.current
    if (!lastCodeLevelParentId) {
      return
    }
    const lastParent = model.nodes.find((node) => node.id === lastCodeLevelParentId)
    if (!lastParent || lastParent.data.kind !== 'component') {
      return
    }
    const children = model.nodes.filter((node) => node.parentId === lastCodeLevelParentId)
    if (children.length === 0) {
      return
    }
    const nextExpandedPath = [
      ...buildAncestorPath(model, lastCodeLevelParentId),
      lastCodeLevelParentId
    ]
    const fallbackNodeId =
      children.find((node) => node.id === selectedNodeIdRef.current)?.id ?? children[0]!.id
    selectedNodeIdRef.current = fallbackNodeId
    setExpandedPath((current) =>
      stringArraysEqual(current, nextExpandedPath) ? current : nextExpandedPath
    )
    setSelectedNodeId(fallbackNodeId)
  }, [architectureMode, model, selectedEdgeId, selectedNodeId])

  const addNode = useCallback(async () => {
    if (!model || editingLocked) {
      return
    }
    const node = createNodeForParent(model, selectedNode)
    const nextModel = { ...model, nodes: [...model.nodes, node] }
    selectedNodeIdRef.current = node.id
    selectedEdgeIdRef.current = null
    await persist(nextModel, `Added ${node.data.name}`)
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    if (selectedNode && !selectedNode.data.external && isExpandableKind(selectedNode.data.kind)) {
      setExpandedPath((current) =>
        current.at(-1) === selectedNode.id ? current : [...current, selectedNode.id]
      )
    }
  }, [editingLocked, model, persist, selectedNode])

  const persistNodePatchById = useCallback(
    async (nodeId: string, patch: Partial<C4Node['data']>) => {
      const current = modelRef.current ?? model
      if (!current || editingLocked) {
        return
      }
      const target = current.nodes.find((node) => node.id === nodeId)
      if (!target) {
        return
      }
      if (
        fingerprintArchitectureModel(current) !==
        fingerprintArchitectureModel({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
          )
        })
      ) {
        const history = pushArchitectureUndoSnapshot(undoStackRef.current, current, {
          batchStartedAt: historyBatchStartedAtRef.current,
          now: Date.now()
        })
        undoStackRef.current = history.stack
        historyBatchStartedAtRef.current = history.batchStartedAt
        redoStackRef.current = []
        setHistoryRevision((revision) => revision + 1)
      }
      try {
        const result = await patchActiveNodeData(nodeId, patch, target.data)
        const nextFingerprint = fingerprintArchitectureModel(result.model)
        modelRef.current = result.model
        setModel(result.model)
        lastKnownModelFingerprintRef.current = nextFingerprint
        setMessage(`Saved ${target.data.name}`)
      } catch (patchError) {
        const text = patchError instanceof Error ? patchError.message : String(patchError)
        setError(text)
        toast.error(text)
      }
    },
    [editingLocked, model, patchActiveNodeData]
  )

  const updateSelectedNode = useCallback(
    async (patch: Partial<C4Node['data']>) => {
      if (!selectedNode) {
        return
      }
      await persistNodePatchById(selectedNode.id, patch)
    },
    [persistNodePatchById, selectedNode]
  )

  const updateSelectedNodeDraft = useCallback((nodeId: string, patch: Partial<C4Node['data']>) => {
    setModel((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
            )
          }
        : current
    )
  }, [])

  const selectNode = useCallback((nodeId: string | null) => {
    selectedNodeIdRef.current = nodeId
    setSelectedNodeId(nodeId)
    if (nodeId) {
      setSelectedGroupId(null)
    }
    setMultiSelectedNodeIds((current) => (current.length === 0 ? current : []))
    setTotalSelected(nodeId ? 1 : 0)
    if (nodeId) {
      selectedEdgeIdRef.current = null
      setSelectedEdgeId(null)
    }
  }, [])

  const selectEdge = useCallback((edgeId: string | null) => {
    selectedEdgeIdRef.current = edgeId
    setSelectedEdgeId(edgeId)
    if (edgeId) {
      setSelectedGroupId(null)
    }
    setMultiSelectedNodeIds((current) => (current.length === 0 ? current : []))
    setTotalSelected(edgeId ? 1 : 0)
    if (edgeId) {
      selectedNodeIdRef.current = null
      setSelectedNodeId(null)
    }
  }, [])

  const selectManyNodes = useCallback((nodeIds: string[], selectedCount: number) => {
    setMultiSelectedNodeIds((current) => (stringArraysEqual(current, nodeIds) ? current : nodeIds))
    setTotalSelected(selectedCount)
    if (nodeIds.length >= 2) {
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedGroupId(null)
    }
  }, [])

  const updateSelectedEdge = useCallback(
    async (patch: { label?: string; method?: string }) => {
      if (!modelRef.current || !selectedEdge || editingLocked) {
        return
      }
      await persist(
        updateEdgeDataInModel(modelRef.current, selectedEdge.id, patch),
        `Saved ${selectedEdge.id}`
      )
    },
    [editingLocked, persist, selectedEdge]
  )

  const saveSourcePattern = useCallback(
    async (rawPattern: string) => {
      const current = modelRef.current ?? model
      if (!current || !selectedNode || editingLocked) {
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
    [editingLocked, model, persist, selectedNode]
  )

  const saveSourceLocations = useCallback(
    async (nodeId: string, locations: SourceLocation[]) => {
      const current = modelRef.current ?? model
      if (!current || editingLocked) {
        return
      }
      const node = current.nodes.find((candidate) => candidate.id === nodeId)
      const sourceMap = { ...current.sourceMap }
      if (locations.length > 0) {
        sourceMap[nodeId] = locations
      } else {
        delete sourceMap[nodeId]
      }
      await persist({ ...current, sourceMap }, `Saved source map for ${node?.data.name ?? nodeId}`)
    },
    [editingLocked, model, persist]
  )

  const addEdge = useCallback(
    async (requestedSourceNodeId?: string, requestedTargetNodeId?: string) => {
      const current = modelRef.current ?? model
      const sourceNodeId = requestedSourceNodeId ?? selectedNode?.id
      const nextTargetNodeId = requestedTargetNodeId ?? targetNodeId
      if (!current || editingLocked) {
        return
      }
      if (!sourceNodeId || !nextTargetNodeId) {
        setMessage('Select a relationship target')
        return
      }
      if (sourceNodeId === nextTargetNodeId) {
        setMessage('Choose a different relationship target')
        return
      }
      const sourceNode = current.nodes.find((node) => node.id === sourceNodeId)
      const targetNode = current.nodes.find((node) => node.id === nextTargetNodeId)
      if (!sourceNode || !targetNode) {
        setMessage('Relationship source or target is no longer available')
        return
      }
      const id = `edge-${sourceNodeId}-${nextTargetNodeId}`
      if (current.edges.some((edge) => edge.id === id)) {
        setMessage('Edge already exists')
        return
      }
      const edge: C4Edge = {
        id,
        source: sourceNodeId,
        target: nextTargetNodeId,
        data: { label: 'depends on' }
      }
      await persist({ ...current, edges: [...current.edges, edge] }, 'Saved architecture edge')
    },
    [editingLocked, model, persist, selectedNode, targetNodeId]
  )

  const deleteSelected = useCallback(async () => {
    if (!model || !selectedNode || editingLocked) {
      return
    }
    const nextModel = deleteNodesFromModel(model, [selectedNode.id])
    let diagramRefs = nextModel.diagramRefs ?? []
    const remainingNodeIds = new Set(nextModel.nodes.map((node) => node.id))
    const remainingEdgeIds = new Set(nextModel.edges.map((edge) => edge.id))
    for (const node of model.nodes) {
      if (!remainingNodeIds.has(node.id)) {
        diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
          type: 'node',
          id: node.id
        }).diagramRefs
      }
    }
    for (const edge of model.edges) {
      if (!remainingEdgeIds.has(edge.id)) {
        diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
          type: 'edge',
          id: edge.id
        }).diagramRefs
      }
    }
    await persist({ ...nextModel, diagramRefs }, `Deleted ${selectedNode.data.name}`)
    setSelectedNodeId(nextModel.nodes[0]?.id ?? null)
    setSelectedEdgeId(null)
  }, [editingLocked, model, persist, selectedNode])

  const deleteSelectedEdge = useCallback(async () => {
    if (!model || !selectedEdge || editingLocked) {
      return
    }
    const nextModel = deleteEdgesFromModel(model, [selectedEdge.id])
    const pruned = pruneDiagramRefsForDeletedTarget(nextModel.diagramRefs ?? [], {
      type: 'edge',
      id: selectedEdge.id
    })
    await persist({ ...nextModel, diagramRefs: pruned.diagramRefs }, `Deleted ${selectedEdge.id}`)
    setSelectedEdgeId(null)
  }, [editingLocked, model, persist, selectedEdge])

  const addCodeLevelNode = useCallback(
    async (kind: C4Kind) => {
      const current = modelRef.current
      if (!current || !currentParent || editingLocked) {
        return
      }
      const node = createNodeForParent(current, currentParent, kind)
      const nextModel = { ...current, nodes: [...current.nodes, node] }
      selectedNodeIdRef.current = node.id
      selectedEdgeIdRef.current = null
      await persist(nextModel, `Added ${node.data.name}`)
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
    },
    [currentParent, editingLocked, persist]
  )

  const deleteNodeById = useCallback(
    async (nodeId: string) => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const target = current.nodes.find((node) => node.id === nodeId)
      const nextModel = deleteNodesFromModel(current, [nodeId])
      let diagramRefs = nextModel.diagramRefs ?? []
      const remainingNodeIds = new Set(nextModel.nodes.map((node) => node.id))
      const remainingEdgeIds = new Set(nextModel.edges.map((edge) => edge.id))
      for (const node of current.nodes) {
        if (!remainingNodeIds.has(node.id)) {
          diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
            type: 'node',
            id: node.id
          }).diagramRefs
        }
      }
      for (const edge of current.edges) {
        if (!remainingEdgeIds.has(edge.id)) {
          diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
            type: 'edge',
            id: edge.id
          }).diagramRefs
        }
      }
      await persist(
        { ...nextModel, diagramRefs },
        target ? `Deleted ${target.data.name}` : 'Deleted node'
      )
      setSelectedNodeId((selected) =>
        selected === nodeId ? (nextModel.nodes[0]?.id ?? null) : selected
      )
      setSelectedEdgeId(null)
    },
    [editingLocked, persist]
  )

  const runDriftCheck = useCallback(async () => {
    if (!projectPath) {
      return
    }
    const report = await window.api.architecture.checkDrift({ projectPath })
    setDrift(report)
    setSyncMessage(
      report.nodes.length || report.structureChanged ? 'Code drift detected' : 'Model is synced'
    )
  }, [projectPath])

  const markSynced = useCallback(async () => {
    if (!projectPath) {
      return
    }
    await window.api.architecture.markSynced({ projectPath })
    setDrift({ nodes: [], structureChanged: false })
    setSyncMessage('Marked architecture as synced')
  }, [projectPath])

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const current = modelRef.current ?? model
      if (!current || !current.nodes.some((node) => node.id === nodeId)) {
        return
      }
      setArchitectureMode('topology')
      setExpandedPath(buildAncestorPath(current, nodeId))
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
    },
    [model]
  )

  const drillIntoNode = useCallback(
    (nodeId: string) => {
      const current = modelRef.current ?? model
      const node = current?.nodes.find((entry) => entry.id === nodeId)
      if (!current || !node || !isExpandableKind(node.data.kind)) {
        return
      }
      setArchitectureMode('topology')
      setExpandedPath([...buildAncestorPath(current, nodeId), nodeId])
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
    },
    [model]
  )

  const createFlow = useCallback(async () => {
    const current = modelRef.current
    if (!current || editingLocked) {
      return
    }
    const id = createFlowId()
    const flow: Flow = {
      id,
      name: `Flow ${((current.flows ?? []).length ?? 0) + 1}`,
      description: '',
      steps: []
    }
    await persist({ ...current, flows: [...(current.flows ?? []), flow] }, `Created ${flow.name}`)
    setActiveFlowId(id)
    setArchitectureMode('flows')
  }, [editingLocked, persist])

  const updateFlow = useCallback(
    async (updated: Flow) => {
      if (editingLocked) {
        return
      }
      await applyModelChange((current) => {
        const flows = current.flows ?? []
        const previousFlow = flows.find((flow) => flow.id === updated.id)
        let found = false
        const nextFlows = flows.map((flow) => {
          if (flow.id !== updated.id) {
            return flow
          }
          found = true
          return updated
        })
        if (!found) {
          nextFlows.push(updated)
        }
        let diagramRefs = current.diagramRefs ?? []
        if (previousFlow) {
          const nextStepIds = collectFlowStepIds(updated.steps)
          for (const previousStepId of collectFlowStepIds(previousFlow.steps)) {
            if (!nextStepIds.has(previousStepId)) {
              diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
                type: 'flowStep',
                flowId: previousFlow.id,
                stepId: previousStepId,
                flow: previousFlow
              }).diagramRefs
            }
          }
        }
        return { ...current, flows: nextFlows, diagramRefs }
      }, `Saved ${updated.name}`)
    },
    [applyModelChange, editingLocked]
  )

  const deleteActiveFlow = useCallback(async () => {
    const current = modelRef.current
    const targetId = activeFlowId ?? current?.flows?.[0]?.id ?? null
    if (!current || !targetId || editingLocked) {
      return
    }
    const flows = current.flows ?? []
    const targetIndex = flows.findIndex((flow) => flow.id === targetId)
    if (targetIndex < 0) {
      return
    }
    const nextFlows = flows.filter((flow) => flow.id !== targetId)
    const nextActive = nextFlows[Math.min(targetIndex, nextFlows.length - 1)]?.id ?? null
    const sourceMap = { ...current.sourceMap }
    delete sourceMap[targetId]
    const pruned = pruneDiagramRefsForDeletedTarget(current.diagramRefs ?? [], {
      type: 'flow',
      id: targetId
    })
    await persist(
      {
        ...current,
        flows: nextFlows,
        sourceMap,
        diagramRefs: pruned.diagramRefs
      },
      `Deleted ${flows[targetIndex].name}`
    )
    setActiveFlowId(nextActive)
  }, [activeFlowId, editingLocked, persist])

  const persistDiagramModel = useCallback(
    async (nextModel: C4ModelData, nextMessage: string, operation: string) => {
      const previous = modelRef.current
      try {
        scheduleModelWrite(nextModel)
        await writePendingModelNow()
        if (
          previous &&
          fingerprintArchitectureModel(previous) !== fingerprintArchitectureModel(nextModel)
        ) {
          const history = pushArchitectureUndoSnapshot(undoStackRef.current, previous, {
            batchStartedAt: historyBatchStartedAtRef.current,
            now: Date.now()
          })
          undoStackRef.current = history.stack
          historyBatchStartedAtRef.current = history.batchStartedAt
          redoStackRef.current = []
          setHistoryRevision((revision) => revision + 1)
        }
        modelRef.current = nextModel
        setModel(nextModel)
        lastKnownModelFingerprintRef.current = fingerprintArchitectureModel(nextModel)
        setMessage(nextMessage)
      } catch (mutationError) {
        setError('')
        throw toDiagramPersistError(mutationError, operation)
      }
    },
    [scheduleModelWrite, writePendingModelNow]
  )

  const createDiagram = useCallback(
    async (
      options: { name?: string; kind?: DiagramKind; activate?: boolean } = {}
    ): Promise<Diagram | null> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return null
      }
      const name = options.name?.trim() || `Diagram ${(current.diagrams ?? []).length + 1}`
      const kind = options.kind ?? 'flowchart'
      const source = createDefaultDiagramSource(kind, name)
      const result = createDiagramInModel(current, {
        name,
        kind,
        notation: 'mermaid',
        source
      })
      await persistDiagramModel(result.model, `Created ${name}`, 'create')
      const diagram = result.model.diagrams?.find(
        (entry) => entry.id === result.changedDiagramIds[0]
      )
      if (diagram && options.activate !== false) {
        setActiveDiagramId(diagram.id)
        setArchitectureMode('diagram')
      }
      return diagram ?? null
    },
    [editingLocked, persistDiagramModel]
  )

  const renameDiagram = useCallback(
    async (diagramId: string, name: string): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const result = renameDiagramInModel(current, diagramId, name)
      await persistDiagramModel(result.model, `Renamed ${name.trim()}`, 'rename')
    },
    [editingLocked, persistDiagramModel]
  )

  const updateDiagramSource = useCallback(
    async (diagramId: string, source: string): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const result = updateDiagramSourceInModel(current, diagramId, source)
      await persistDiagramModel(result.model, 'Saved diagram source', 'updateSource')
      const saved = result.model.diagrams?.find((diagram) => diagram.id === diagramId)
      if (saved) {
        diagramDraftStateRef.current = {
          diagramId,
          persistedSource: saved.source,
          draftSource: saved.source,
          dirty: false
        }
        externalDiagramReloadDiskModelRef.current = null
        setExternalDiagramReloadConflict((current) =>
          current?.diagramId === diagramId ? null : current
        )
      }
    },
    [editingLocked, persistDiagramModel]
  )

  const deleteDiagram = useCallback(
    async (diagramId: string): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const sortedBeforeDelete = sortDiagramsForLibrary(current.diagrams ?? [])
      const deletedIndex = sortedBeforeDelete.findIndex((diagram) => diagram.id === diagramId)
      const result = deleteDiagramInModel(current, diagramId)
      await persistDiagramModel(result.model, 'Deleted diagram', 'delete')
      if (projectPath) {
        try {
          const cacheResult = await window.api.architecture.clearDiagramCache({
            projectPath,
            modelName: activeModelNameRef.current,
            diagramId
          })
          if (!cacheResult.ok) {
            const text = `${cacheResult.code}: ${cacheResult.message}`
            setError(text)
            toast.warning(text)
          }
        } catch (cacheError) {
          const text = `cache.clear-failed: ${
            cacheError instanceof Error ? cacheError.message : String(cacheError)
          }`
          setError(text)
          toast.warning(text)
        }
      }
      if (activeDiagramId === diagramId) {
        const remaining = sortDiagramsForLibrary(result.model.diagrams ?? [])
        const fallback = remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)]
        diagramDraftStateRef.current = null
        setActiveDiagramId(fallback?.id ?? null)
        setArchitectureMode(fallback ? 'diagram' : 'topology')
      }
    },
    [activeDiagramId, activeModelNameRef, editingLocked, persistDiagramModel, projectPath]
  )

  const createDiagramRef = useCallback(
    async (input: CreateDiagramRefInput): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const result = createDiagramRefInModel(current, input)
      await persistDiagramModel(result.model, 'Linked diagram reference', 'createRef')
    },
    [editingLocked, persistDiagramModel]
  )

  const upsertDiagramRefs = useCallback(
    async (refs: DiagramRef[]): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const result = upsertDiagramRefsInModel(current, refs)
      await persistDiagramModel(result.model, 'Saved diagram references', 'upsertRefs')
    },
    [editingLocked, persistDiagramModel]
  )

  const deleteDiagramRefs = useCallback(
    async (refIds: string[]): Promise<void> => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const result = deleteDiagramRefsInModel(current, refIds)
      await persistDiagramModel(result.model, 'Removed diagram reference', 'deleteRefs')
    },
    [editingLocked, persistDiagramModel]
  )

  const selectDiagram = useCallback((diagramId: string): void => {
    const current = modelRef.current
    if (!current?.diagrams?.some((diagram) => diagram.id === diagramId)) {
      return
    }
    setArchitectureMode('diagram')
    setActiveDiagramId(diagramId)
    setSelectedEdgeId(null)
  }, [])

  const applyArchitectureNavigationTarget = useCallback(
    (target: ArchitectureNavigationTarget): void => {
      if (target.type === 'diagram') {
        setExternalDiagramReloadConflict((current) =>
          current?.diagramId === target.diagramId ? current : null
        )
        selectDiagram(target.diagramId)
        return
      }
      externalDiagramReloadDiskModelRef.current = null
      setExternalDiagramReloadConflict(null)
      setActiveDiagramId(null)
      if (target.type === 'flows') {
        if (target.flowId !== undefined) {
          setActiveFlowId(target.flowId)
        }
        setArchitectureMode('flows')
        return
      }
      setArchitectureMode(target.type)
    },
    [selectDiagram]
  )

  const requestArchitectureNavigation = useCallback(
    async (target: ArchitectureNavigationTarget): Promise<boolean> => {
      const snapshot = diagramDraftStateRef.current
      if (!snapshot || !shouldPromptForDiagramDraftSwitch(snapshot, target)) {
        applyArchitectureNavigationTarget(target)
        return true
      }
      if (pendingDiagramNavigationRef.current) {
        pendingDiagramNavigationRef.current.resolve(false)
      }
      return new Promise<boolean>((resolve) => {
        pendingDiagramNavigationRef.current = { target, resolve }
        setDiagramDraftSwitchDialog({ diagramId: snapshot.diagramId, target, error: null })
      })
    },
    [applyArchitectureNavigationTarget]
  )

  const resolveDiagramDraftSwitch = useCallback(
    async (action: 'save' | 'discard' | 'cancel'): Promise<void> => {
      const pending = pendingDiagramNavigationRef.current
      const snapshot = diagramDraftStateRef.current
      if (!pending || !snapshot) {
        setDiagramDraftSwitchDialog(null)
        return
      }
      if (action === 'cancel') {
        pendingDiagramNavigationRef.current = null
        setDiagramDraftSwitchDialog(null)
        pending.resolve(false)
        return
      }
      if (action === 'discard') {
        diagramDraftStateRef.current = {
          ...snapshot,
          draftSource: snapshot.persistedSource,
          dirty: false
        }
        externalDiagramReloadDiskModelRef.current = null
        setExternalDiagramReloadConflict(null)
        pendingDiagramNavigationRef.current = null
        setDiagramDraftSwitchDialog(null)
        applyArchitectureNavigationTarget(pending.target)
        pending.resolve(true)
        return
      }
      try {
        await updateDiagramSource(snapshot.diagramId, snapshot.draftSource)
        pendingDiagramNavigationRef.current = null
        setDiagramDraftSwitchDialog(null)
        applyArchitectureNavigationTarget(pending.target)
        pending.resolve(true)
      } catch (saveError) {
        const nextError = saveError instanceof Error ? saveError.message : String(saveError)
        setDiagramDraftSwitchDialog({
          diagramId: snapshot.diagramId,
          target: pending.target,
          error: nextError
        })
      }
    },
    [applyArchitectureNavigationTarget, updateDiagramSource]
  )

  const setDiagramDraftState = useCallback((snapshot: DiagramDraftStateSnapshot): void => {
    diagramDraftStateRef.current = snapshot
  }, [])

  const resolveExternalDiagramReload = useCallback(
    async (diagramId: string, resolution: DiagramExternalReloadResolution): Promise<void> => {
      const conflict = externalDiagramReloadConflict
      if (!conflict || conflict.diagramId !== diagramId) {
        return
      }
      const currentModelName = sanitizeClientModelName(activeModelNameRef.current)
      if (conflict.modelName !== currentModelName) {
        externalDiagramReloadDiskModelRef.current = null
        setExternalDiagramReloadConflict(null)
        setMessage('Ignored stale diagram reload conflict for another model')
        return
      }
      if (resolution === 'compare-changes' || resolution === 'cancel') {
        return
      }
      if (resolution === 'keep-draft') {
        setMessage('Keeping local diagram draft')
        return
      }
      if (resolution === 'discard-deleted' && conflict.diskState !== 'deleted') {
        return
      }
      if (resolution === 'reload-from-disk' && conflict.diskState !== 'modified') {
        return
      }

      const storedDisk = externalDiagramReloadDiskModelRef.current
      const diskDocument =
        storedDisk?.modelName === conflict.modelName
          ? { model: storedDisk.model, revision: storedDisk.revision }
          : await readModelDocument(conflict.modelName)
      const previousSorted = sortDiagramsForLibrary(modelRef.current?.diagrams ?? [])
      const previousIndex = previousSorted.findIndex((diagram) => diagram.id === conflict.diagramId)
      const diskModel = diskDocument.model
      const diskFingerprint = fingerprintArchitectureModel(diskModel)

      acceptLoadedModelDocument(conflict.modelName, diskDocument.revision)
      modelRef.current = diskModel
      lastKnownModelFingerprintRef.current = diskFingerprint
      setModel(diskModel)
      externalDiagramReloadDiskModelRef.current = null
      setExternalDiagramReloadConflict(null)

      if (resolution === 'reload-from-disk') {
        const diskDiagram =
          diskModel.diagrams?.find((diagram) => diagram.id === conflict.diagramId) ?? null
        diagramDraftStateRef.current = diskDiagram
          ? {
              diagramId: diskDiagram.id,
              persistedSource: diskDiagram.source,
              draftSource: diskDiagram.source,
              dirty: false
            }
          : null
        setActiveDiagramId(diskDiagram?.id ?? null)
        setArchitectureMode(diskDiagram ? 'diagram' : 'topology')
        setMessage('Reloaded diagram source from disk')
        return
      }

      const remaining = sortDiagramsForLibrary(diskModel.diagrams ?? [])
      const fallback = remaining[Math.min(Math.max(previousIndex, 0), remaining.length - 1)]
      diagramDraftStateRef.current = null
      setActiveDiagramId(fallback?.id ?? null)
      setArchitectureMode(fallback ? 'diagram' : 'topology')
      setMessage('Accepted diagram deletion from disk')
    },
    [
      acceptLoadedModelDocument,
      activeModelNameRef,
      externalDiagramReloadConflict,
      readModelDocument
    ]
  )

  const updateGroups = useCallback(
    (updater: (prev: Group[]) => Group[]) => {
      const current = modelRef.current
      if (!current || editingLocked) {
        return
      }
      const nextGroups = updater(current.groups ?? [])
      let diagramRefs = current.diagramRefs ?? []
      const nextGroupIds = new Set(nextGroups.map((group) => group.id))
      for (const group of current.groups ?? []) {
        if (!nextGroupIds.has(group.id)) {
          diagramRefs = pruneDiagramRefsForDeletedTarget(diagramRefs, {
            type: 'group',
            id: group.id
          }).diagramRefs
        }
      }
      void persist({ ...current, groups: nextGroups, diagramRefs }, 'Saved architecture groups')
      setSelectedGroupId((selected) =>
        selected && nextGroups.some((group) => group.id === selected) ? selected : null
      )
    },
    [editingLocked, persist]
  )

  const createGroupFromSelection = useCallback(
    async (name: string) => {
      const current = modelRef.current
      if (!current || editingLocked || multiSelectedNodeIds.length < 2) {
        return
      }
      const id = `group-${globalThis.crypto.randomUUID()}`
      const nextModel = createGroupFromSelectedNodes(current, {
        id,
        name,
        memberIds: multiSelectedNodeIds
      })
      await persist(nextModel, `Created ${name.trim() || 'New group'}`)
      setSelectedGroupId(id)
      setMultiSelectedNodeIds([])
      setTotalSelected(0)
    },
    [editingLocked, multiSelectedNodeIds, persist]
  )

  const addSelectionToGroup = useCallback(
    async (groupId: string) => {
      const current = modelRef.current
      if (!current || editingLocked || multiSelectedNodeIds.length < 2) {
        return
      }
      const nextModel = addMembersToGroupInModel(current, groupId, multiSelectedNodeIds)
      await persist(nextModel, 'Added selected nodes to group')
      setSelectedGroupId(groupId)
      setMultiSelectedNodeIds([])
      setTotalSelected(0)
    },
    [editingLocked, multiSelectedNodeIds, persist]
  )

  const patchSelectedGroup = useCallback(
    async (patch: Partial<Group>) => {
      const current = modelRef.current
      if (!current || !selectedGroup || editingLocked) {
        return
      }
      await persist(
        {
          ...current,
          groups: (current.groups ?? []).map((group) =>
            group.id === selectedGroup.id ? { ...group, ...patch } : group
          )
        },
        `Saved ${selectedGroup.name}`
      )
    },
    [editingLocked, persist, selectedGroup]
  )

  const removeSelectedGroupMember = useCallback(
    async (nodeId: string) => {
      const current = modelRef.current
      if (!current || !selectedGroup || editingLocked) {
        return
      }
      await persist(
        {
          ...current,
          groups: (current.groups ?? []).map((group) =>
            group.id === selectedGroup.id
              ? { ...group, memberIds: group.memberIds.filter((memberId) => memberId !== nodeId) }
              : group
          )
        },
        `Saved ${selectedGroup.name}`
      )
    },
    [editingLocked, persist, selectedGroup]
  )

  const deleteSelectedGroup = useCallback(async () => {
    const current = modelRef.current
    if (!current || !selectedGroup || editingLocked) {
      return
    }
    await persist(
      {
        ...current,
        groups: (current.groups ?? [])
          .filter((group) => group.id !== selectedGroup.id)
          .map((group) =>
            group.parentGroupId === selectedGroup.id
              ? { ...group, parentGroupId: selectedGroup.parentGroupId }
              : group
          ),
        diagramRefs: pruneDiagramRefsForDeletedTarget(current.diagramRefs ?? [], {
          type: 'group',
          id: selectedGroup.id
        }).diagramRefs
      },
      `Deleted ${selectedGroup.name}`
    )
    setSelectedGroupId(null)
  }, [editingLocked, persist, selectedGroup])

  const toggleLock = useCallback(async () => {
    if (!projectPath) {
      return
    }
    const nextActive = !implementing
    try {
      const result = (await window.api.architecture.callTool({
        projectPath,
        call: {
          toolName: 'set_implementing',
          arguments: { active: nextActive }
        }
      })) as { ok?: boolean; content?: string }
      if (result.ok === false) {
        throw new Error(result.content ?? 'Could not toggle drift detection lock.')
      }
      setImplementing(nextActive)
      setSyncMessage(nextActive ? 'Drift detection locked' : 'Drift detection resumed')
      if (!nextActive) {
        await runDriftCheck()
      }
    } catch (syncError) {
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setSyncStatus('error')
      setSyncMessage(text)
      toast.error(text)
    }
  }, [implementing, projectPath, runDriftCheck])

  const openResolvedSourceLocation = useCallback(
    (rootPath: string, location: DiagramSourceOpenLocation): void => {
      const absolutePath = `${rootPath.replace(/[\\/]+$/, '')}/${location.relativePath}`
      openFile(
        {
          filePath: absolutePath,
          relativePath: location.relativePath,
          worktreeId: workspace.worktreeId,
          language: detectLanguage(location.relativePath),
          mode: 'edit'
        },
        {
          preview: true,
          targetGroupId: useAppStore.getState().activeGroupIdByWorktree?.[workspace.worktreeId],
          recordReplacedPreview: true
        }
      )
      if (location.line !== undefined) {
        setPendingEditorReveal(null)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPendingEditorReveal({
              filePath: absolutePath,
              line: location.line ?? 1,
              column: 1,
              matchLength: 0
            })
          })
        })
      }
    },
    [openFile, setPendingEditorReveal, workspace.worktreeId]
  )

  const openSourceLocation = useCallback(
    async (location: SourceLocation) => {
      if (!projectPath) {
        return
      }
      try {
        const modelProjectPath = modelRef.current?.projectPath
        const candidateProjectPaths = uniqueSourceRootCandidates([modelProjectPath, projectPath])
        let target: ReturnType<typeof resolveSourceLocationTarget> | null = null
        let lastError = ''
        for (const rootPath of candidateProjectPaths) {
          try {
            const files = await window.api.fs.listFiles({ rootPath })
            const candidate = resolveSourceLocationTarget({
              projectPath: rootPath,
              files,
              location
            })
            if (!('error' in candidate)) {
              target = candidate
              break
            }
            lastError = candidate.error
          } catch (candidateError) {
            lastError =
              candidateError instanceof Error ? candidateError.message : String(candidateError)
          }
        }
        target ??= {
          error:
            lastError || `No file in this worktree matches source pattern '${location.pattern}'.`
        }
        if ('error' in target) {
          setError(target.error)
          toast.error(target.error)
          return
        }
        openResolvedSourceLocation(
          rootPathForSourceTarget(target.absolutePath, target.relativePath),
          {
            relativePath: target.relativePath,
            ...(target.line === undefined ? {} : { line: target.line }),
            ...(target.endLine === undefined ? {} : { endLine: target.endLine })
          }
        )
      } catch (sourceError) {
        const text = sourceError instanceof Error ? sourceError.message : String(sourceError)
        setError(text)
        toast.error(text)
      }
    },
    [openResolvedSourceLocation, projectPath]
  )

  const chooseDiagramSourceTarget = useCallback(
    (location: DiagramSourceOpenLocation): void => {
      if (!diagramSourceTargetPicker) {
        return
      }
      openResolvedSourceLocation(diagramSourceTargetPicker.projectPath, location)
      setDiagramSourceTargetPicker(null)
    },
    [diagramSourceTargetPicker, openResolvedSourceLocation]
  )

  const navigateDiagramRefTarget = useCallback(
    async (target: DiagramRefTarget): Promise<void> => {
      const current = modelRef.current ?? model
      if (!current) {
        return
      }
      switch (target.type) {
        case 'node':
          if (await requestArchitectureNavigation({ type: 'topology' })) {
            navigateToNode(target.id)
          }
          return
        case 'edge':
          if (current.edges.some((edge) => edge.id === target.id)) {
            const allowed = await requestArchitectureNavigation({ type: 'topology' })
            if (allowed) {
              setSelectedNodeId(null)
              selectedEdgeIdRef.current = target.id
              setSelectedEdgeId(target.id)
            }
          }
          return
        case 'group':
          if ((current.groups ?? []).some((group) => group.id === target.id)) {
            const allowed = await requestArchitectureNavigation({ type: 'groups' })
            if (allowed) {
              setSelectedGroupId(target.id)
            }
          }
          return
        case 'flow':
          if ((current.flows ?? []).some((flow) => flow.id === target.id)) {
            await requestArchitectureNavigation({ type: 'flows', flowId: target.id })
          }
          return
        case 'flowStep':
          if ((current.flows ?? []).some((flow) => flow.id === target.flowId)) {
            await requestArchitectureNavigation({ type: 'flows', flowId: target.flowId })
          }
          return
        case 'source': {
          const sourceProjectPath = current.projectPath || projectPath
          if (!sourceProjectPath) {
            setError('No project path is available for source target navigation.')
            return
          }
          const result = (await window.api.architecture.openDiagramSourceTarget({
            projectPath: sourceProjectPath,
            target
          })) as DiagramSourceTargetOpenResult
          if (!result.ok) {
            const text = `${result.code}: ${result.reason}`
            setError(text)
            toast.error(text)
            return
          }
          if (result.action === 'selection-required') {
            setDiagramSourceTargetPicker({
              projectPath: sourceProjectPath,
              locations: result.locations
            })
            return
          }
          const [location] = result.locations
          if (location) {
            openResolvedSourceLocation(sourceProjectPath, location)
          }
        }
      }
    },
    [model, navigateToNode, openResolvedSourceLocation, projectPath, requestArchitectureNavigation]
  )

  const launchArchitectureAgentPrompt = useCallback(
    (prompt: string, failureMessage: string) => {
      const agent = activeAgent?.name ?? 'codex'
      const launched = launchAgentInNewTab({
        agent,
        worktreeId: workspace.worktreeId,
        prompt,
        launchSource: 'unknown'
      })
      if (!launched) {
        throw new Error(failureMessage)
      }
      return launched
    },
    [activeAgent, workspace.worktreeId]
  )

  const startInitialModel = useCallback(async () => {
    if (!projectPath) {
      return
    }
    if (!aiRunSession.beginRun('build', 'Preparing Build with AI prompt')) {
      return
    }
    try {
      await writePendingModelNow()
      const result = await window.api.architecture.prepareInitialModelPrompt({
        projectPath,
        modelName: activeModelNameRef.current
      })
      launchArchitectureAgentPrompt(
        result.prompt,
        'Could not launch an Orca agent terminal for architecture modeling.'
      )
      setMessage('Build with AI prompt sent')
      aiRunSession.markRun('build', 'done', 'Build with AI prompt sent')
    } catch (aiError) {
      const text = aiError instanceof Error ? aiError.message : String(aiError)
      setError(text)
      aiRunSession.markRun('build', 'failed', text)
      toast.error(text)
    }
  }, [
    activeModelNameRef,
    aiRunSession,
    launchArchitectureAgentPrompt,
    projectPath,
    writePendingModelNow
  ])

  const startDeepModel = useCallback(async () => {
    if (!projectPath) {
      return
    }
    if (!aiRunSession.beginRun('build', 'Preparing Deep Build with AI prompt')) {
      return
    }
    try {
      await writePendingModelNow()
      const result = await window.api.architecture.prepareDeepModelPrompt({
        projectPath,
        modelName: activeModelNameRef.current
      })
      launchArchitectureAgentPrompt(
        result.prompt,
        'Could not launch an Orca agent terminal for deep architecture modeling.'
      )
      setMessage('Deep Build with AI prompt sent')
      aiRunSession.markRun('build', 'done', 'Deep Build with AI prompt sent')
    } catch (aiError) {
      const text = aiError instanceof Error ? aiError.message : String(aiError)
      setError(text)
      aiRunSession.markRun('build', 'failed', text)
      toast.error(text)
    }
  }, [
    activeModelNameRef,
    aiRunSession,
    launchArchitectureAgentPrompt,
    projectPath,
    writePendingModelNow
  ])

  const fillNodeWithAi = useCallback(
    async (nodeId: string) => {
      if (!projectPath) {
        return
      }
      if (!aiRunSession.beginRun('fill', 'Preparing Fill with AI prompt')) {
        return
      }
      try {
        await writePendingModelNow()
        const result = await window.api.architecture.prepareNodeFillPrompt({
          projectPath,
          modelName: activeModelNameRef.current,
          nodeId
        })
        launchArchitectureAgentPrompt(
          result.prompt,
          'Could not launch an Orca agent terminal for architecture node fill.'
        )
        setMessage('Fill with AI prompt sent')
        aiRunSession.markRun('fill', 'done', 'Fill with AI prompt sent')
      } catch (aiError) {
        const text = aiError instanceof Error ? aiError.message : String(aiError)
        setError(text)
        aiRunSession.markRun('fill', 'failed', text)
        toast.error(text)
      }
    },
    [
      activeModelNameRef,
      aiRunSession,
      launchArchitectureAgentPrompt,
      projectPath,
      writePendingModelNow
    ]
  )

  const startAdvisorReview = useCallback(async () => {
    if (!projectPath) {
      return
    }
    if (!aiRunSession.beginRun('review', 'Preparing advisor review prompt')) {
      return
    }
    try {
      await writePendingModelNow()
      const result = await window.api.architecture.prepareAdvisorPrompt({
        projectPath,
        modelName: activeModelNameRef.current
      })
      launchArchitectureAgentPrompt(
        result.prompt,
        'Could not launch an Orca agent terminal for architecture review.'
      )
      setMessage('Advisor review prompt sent')
      aiRunSession.markRun('review', 'done', 'Advisor review prompt sent')
    } catch (aiError) {
      const text = aiError instanceof Error ? aiError.message : String(aiError)
      setError(text)
      aiRunSession.markRun('review', 'failed', text)
      toast.error(text)
    }
  }, [
    activeModelNameRef,
    aiRunSession,
    launchArchitectureAgentPrompt,
    projectPath,
    writePendingModelNow
  ])

  const writeMcpConfig = useCallback(async () => {
    if (!projectPath) {
      return
    }
    try {
      const result = await window.api.architecture.writeMcpConfig({ projectPath })
      setMessage('MCP config written')
      toast.success('MCP config written', {
        description: `${result.claudePath}\n${result.codexPath}`
      })
    } catch (configError) {
      const text = configError instanceof Error ? configError.message : String(configError)
      setError(text)
      toast.error(text)
    }
  }, [projectPath])

  const startSync = useCallback(async () => {
    if (!projectPath || syncStatus === 'running') {
      return
    }
    if (!aiRunSession.beginRun('sync', 'Preparing architecture sync prompt')) {
      return
    }
    let began = false
    try {
      setError('')
      await writePendingModelNow()
      syncResolutionRef.current = null
      setSyncStatus('running')
      setSyncMessage(null)
      setSyncLog(['Preparing architecture sync prompt'])
      const result = await window.api.architecture.beginSync({
        projectPath,
        modelName: activeModelNameRef.current
      })
      began = true
      setImplementing(true)
      setDrift(result.drift)
      const agent = activeAgent?.name ?? 'codex'
      const launched = launchAgentInNewTab({
        agent,
        worktreeId: workspace.worktreeId,
        prompt: result.prompt,
        launchSource: 'unknown'
      })
      if (!launched) {
        throw new Error('Could not launch an Orca agent terminal for architecture sync.')
      }
      aiRunSession.markRun('sync', 'running', 'Architecture sync is running')
      syncTerminalHadPtyRef.current = false
      setSyncTerminalTabId(launched.tabId)
      trackArchitectureSyncTerminal(projectPath, launched.tabId)
      setSyncLog((current) => [...current, `Sync prompt sent to ${agent}`])
    } catch (syncError) {
      if (began) {
        await window.api.architecture.cancelSync({ projectPath }).catch(() => null)
      }
      setSyncStatus('error')
      setImplementing(false)
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setError(text)
      setSyncMessage(text)
      aiRunSession.markRun('sync', 'failed', text)
      toast.error(text)
    }
  }, [
    activeAgent,
    activeModelNameRef,
    aiRunSession,
    projectPath,
    syncStatus,
    workspace.worktreeId,
    writePendingModelNow
  ])

  const cancelSync = useCallback(async () => {
    if (!projectPath) {
      return
    }
    if (syncResolutionRef.current) {
      return
    }
    syncResolutionRef.current = 'cancel'
    try {
      const restored = await window.api.architecture.cancelSync({ projectPath })
      modelRef.current = restored
      setModel(restored)
      setChangedNodeIds(new Set())
      setNodeDiffs(new Map())
      setSelectedNodeId((current) =>
        current && restored.nodes.some((node) => node.id === current)
          ? current
          : (restored.nodes[0]?.id ?? null)
      )
      setSelectedEdgeId(null)
      setSyncStatus('idle')
      setSyncLog([])
      setSyncTerminalTabId(null)
      setImplementing(false)
      setSyncMessage('Restored pre-sync architecture model')
      aiRunSession.markRun('sync', 'cancelled', 'Architecture sync cancelled')
    } catch (syncError) {
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setSyncStatus('error')
      setSyncMessage(text)
      setError(text)
      aiRunSession.markRun('sync', 'failed', text)
      toast.error(text)
    } finally {
      syncResolutionRef.current = null
    }
  }, [aiRunSession, projectPath])

  const finishSync = useCallback(async () => {
    if (!projectPath) {
      return
    }
    if (syncResolutionRef.current) {
      return
    }
    syncResolutionRef.current = 'finish'
    try {
      await window.api.architecture.finishSync({ projectPath })
      setSyncStatus('idle')
      setSyncLog([])
      setSyncTerminalTabId(null)
      setImplementing(false)
      setDrift({ nodes: [], structureChanged: false })
      setChangedNodeIds(new Set())
      setNodeDiffs(new Map())
      setSyncMessage('Architecture sync finished')
      aiRunSession.markRun('sync', 'done', 'Architecture sync finished')
    } catch (syncError) {
      const text = syncError instanceof Error ? syncError.message : String(syncError)
      setSyncStatus('error')
      setSyncMessage(text)
      setError(text)
      aiRunSession.markRun('sync', 'failed', text)
      toast.error(text)
    } finally {
      syncResolutionRef.current = null
    }
  }, [aiRunSession, projectPath])

  const dismissSyncMessage = useCallback(() => {
    setSyncMessage(null)
    if (syncStatus === 'error') {
      setSyncStatus('idle')
    }
  }, [syncStatus])

  useEffect(() => {
    if (syncStatus !== 'running' || !syncTerminalTabId) {
      syncTerminalPtyIdsRef.current = new Set()
      return
    }
    if (syncTerminalPtyIds.length === 0) {
      return
    }
    const next = new Set(syncTerminalPtyIdsRef.current)
    for (const ptyId of syncTerminalPtyIds) {
      next.add(ptyId)
    }
    syncTerminalPtyIdsRef.current = next
  }, [syncStatus, syncTerminalPtyIds, syncTerminalPtyIdsKey, syncTerminalTabId])

  useEffect(() => {
    if (syncStatus !== 'running' || !syncTerminalTabId || !projectPath) {
      return
    }
    return window.api.pty.onExit(({ id, code }) => {
      if (!syncTerminalPtyIdsRef.current.has(id)) {
        return
      }
      syncTerminalPtyIdsRef.current.delete(id)
      if (code === 0) {
        if (autoFinishingSyncRef.current) {
          return
        }
        autoFinishingSyncRef.current = true
        setSyncLog((current) => [
          ...current,
          'Agent terminal exited cleanly. Finishing architecture sync.'
        ])
        setSyncMessage('Agent terminal exited cleanly. Finishing architecture sync.')
        void finishSync().finally(() => {
          autoFinishingSyncRef.current = false
        })
        return
      }

      syncTerminalHadPtyRef.current = false
      setSyncLog((current) => [
        ...current,
        `Agent terminal exited with code ${code}. Review model changes, then finish or cancel sync.`
      ])
      setSyncMessage(
        `Agent terminal exited with code ${code}. Review changes, then finish or cancel sync.`
      )
    })
  }, [finishSync, projectPath, syncStatus, syncTerminalTabId])

  useEffect(() => {
    if (syncStatus !== 'running' || !syncTerminalTabId) {
      syncTerminalHadPtyRef.current = false
      return
    }
    if (syncTerminalPtyCount > 0) {
      syncTerminalHadPtyRef.current = true
      return
    }
    if (!syncTerminalHadPtyRef.current) {
      return
    }
    if (autoFinishingSyncRef.current) {
      return
    }
    syncTerminalHadPtyRef.current = false
    setSyncLog((current) => [
      ...current,
      'Agent terminal exited. Review model changes, then finish or cancel sync.'
    ])
    setSyncMessage('Agent terminal exited. Review changes, then finish or cancel sync.')
  }, [syncStatus, syncTerminalPtyCount, syncTerminalTabId])

  const dismissNodeDiff = useCallback(
    (nodeId: string) => {
      setNodeDiffs((current) => {
        const previousData = current.get(nodeId)
        const currentNode = modelRef.current?.nodes.find((node) => node.id === nodeId)
        if (previousData && currentNode) {
          dismissedNodeDiffKeysRef.current.set(
            nodeDiffDismissalKey(activeModelNameRef.current, nodeId),
            fingerprintNodeData(currentNode.data)
          )
        }
        const next = new Map(current)
        next.delete(nodeId)
        setChangedNodeIds((changed) => {
          if (!changed.has(nodeId)) {
            return changed
          }
          const nextChanged = new Set(changed)
          nextChanged.delete(nodeId)
          return nextChanged
        })
        return next
      })
    },
    [activeModelNameRef]
  )

  const flows = model?.flows ?? []
  const activeDiagram =
    activeDiagramId && model?.diagrams
      ? (model.diagrams.find((diagram) => diagram.id === activeDiagramId) ?? null)
      : null

  return {
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
    activeDiagram,
    activeDiagramId,
    setActiveDiagramId,
    externalDiagramReloadConflict,
    diagramDraftSwitchDialog,
    diagramSourceTargetPicker,
    requestArchitectureNavigation,
    resolveDiagramDraftSwitch,
    chooseDiagramSourceTarget,
    cancelDiagramSourceTargetPicker: () => setDiagramSourceTargetPicker(null),
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
    reloadActiveModel,
    refreshProjectModels,
    writePendingModelNow,
    createBlankProjectModel,
    createModelFromTemplate,
    openProjectModel,
    saveCurrentModelAs,
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
    createDiagram,
    renameDiagram,
    updateDiagramSource,
    deleteDiagram,
    createDiagramRef,
    upsertDiagramRefs,
    deleteDiagramRefs,
    navigateDiagramRefTarget,
    selectDiagram,
    setDiagramDraftState,
    resolveExternalDiagramReload,
    updateGroups,
    createGroupFromSelection,
    addSelectionToGroup,
    patchSelectedGroup,
    removeSelectedGroupMember,
    deleteSelectedGroup,
    toggleLock,
    openSourceLocation,
    startInitialModel,
    startDeepModel,
    fillNodeWithAi,
    startAdvisorReview,
    writeMcpConfig,
    startSync,
    cancelSync,
    finishSync,
    dismissSyncMessage,
    dismissNodeDiff
  }
}
