import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArchitectureWorkspace } from '../../../../shared/types'
import type { C4ModelData, C4NodeData } from '../../../../shared/scryer/model-types'
import { joinPath } from '../../lib/path'
import {
  hasRecentArchitectureSelfWrite,
  recordArchitectureSelfWrite
} from './architecture-self-write-registry'
import { createArchitecturePerformanceRecorder } from './architecture-performance'

export type ArchitectureProjectModelEntry = {
  name: string
  fileName: string
  path: string
  isDefault: boolean
  scope: 'project' | 'global'
}

export type ArchitectureTemplateEntry = {
  id: string
  name: string
}

export type ArchitectureModelDocument = {
  model: C4ModelData
  revision: string
}

type PendingModelWrite = {
  projectPath: string
  modelName: string
  model: C4ModelData
  baseRevision: string | null
}

export function sanitizeClientModelName(modelName?: string | null): string {
  const raw = (modelName ?? 'model').trim().replace(/\.scry$/i, '')
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'model'
}

export function useArchitectureModelSession({
  workspace,
  projectPath,
  setArchitectureModelRef,
  isActiveModelEditableTarget,
  onActiveModelReload,
  onActiveModelRemoved,
  onError
}: {
  workspace: ArchitectureWorkspace
  projectPath: string
  setArchitectureModelRef: (workspaceId: string, modelRef: string) => void
  isActiveModelEditableTarget: () => boolean
  onActiveModelReload: () => void
  onActiveModelRemoved: (
    removedModelName: string,
    knownModels: ArchitectureProjectModelEntry[]
  ) => void
  onError: (error: unknown) => void
}) {
  const activeModelNameRef = useRef(sanitizeClientModelName(workspace.modelRef))
  const revisionRef = useRef<string | null>(null)
  const pendingModelWriteRef = useRef<PendingModelWrite | null>(null)
  const pendingModelWriteTimerRef = useRef<number | null>(null)
  const [activeModelName, setActiveModelName] = useState(() =>
    sanitizeClientModelName(workspace.modelRef)
  )
  const [projectModels, setProjectModels] = useState<ArchitectureProjectModelEntry[]>([])
  const [templates, setTemplates] = useState<ArchitectureTemplateEntry[]>([])
  const performanceRecorderRef = useRef(createArchitecturePerformanceRecorder())

  const refreshProjectModels = useCallback(async () => {
    if (!projectPath) {
      setProjectModels([])
      setTemplates([])
      return
    }
    const [models, nextTemplates] = await Promise.all([
      window.api.architecture.listModels({ projectPath }),
      window.api.architecture.listTemplates()
    ])
    setProjectModels(models)
    setTemplates(nextTemplates)
  }, [projectPath])

  const readModelDocument = useCallback(
    (requestedModelName?: string | null) => {
      const modelName = sanitizeClientModelName(requestedModelName ?? activeModelNameRef.current)
      return window.api.architecture.readModelDocument({ projectPath, modelName })
    },
    [projectPath]
  )

  const acceptLoadedModelDocument = useCallback(
    (modelName: string, revision: string) => {
      const sanitized = sanitizeClientModelName(modelName)
      activeModelNameRef.current = sanitized
      revisionRef.current = revision
      setActiveModelName(sanitized)
      setArchitectureModelRef(workspace.id, sanitized)
    },
    [setArchitectureModelRef, workspace.id]
  )

  const writePendingModelNow = useCallback(async () => {
    const pending = pendingModelWriteRef.current
    if (!pending) {
      return
    }
    pendingModelWriteRef.current = null
    if (pendingModelWriteTimerRef.current !== null) {
      window.clearTimeout(pendingModelWriteTimerRef.current)
      pendingModelWriteTimerRef.current = null
    }
    try {
      const selfWritePath = joinPath(
        joinPath(pending.projectPath, '.scryer'),
        `${pending.modelName}.scry`
      )
      recordArchitectureSelfWrite(selfWritePath)
      const result = await performanceRecorderRef.current.measureAsync('save', () =>
        window.api.architecture.writeModelDocument({
          projectPath: pending.projectPath,
          model: pending.model,
          modelName: pending.modelName,
          baseRevision: pending.baseRevision
        })
      )
      revisionRef.current = result.revision
    } catch (writeError) {
      onError(writeError)
      throw writeError
    }
  }, [onError])

  const scheduleModelWrite = useCallback(
    (nextModel: C4ModelData) => {
      if (!projectPath) {
        return
      }
      pendingModelWriteRef.current = {
        projectPath,
        modelName: activeModelNameRef.current,
        model: nextModel,
        baseRevision: revisionRef.current
      }
      if (pendingModelWriteTimerRef.current !== null) {
        window.clearTimeout(pendingModelWriteTimerRef.current)
      }
      pendingModelWriteTimerRef.current = window.setTimeout(() => {
        void writePendingModelNow()
      }, 500)
    },
    [projectPath, writePendingModelNow]
  )

  const patchActiveNodeData = useCallback(
    async (
      nodeId: string,
      patch: Partial<C4NodeData>,
      baseNodeData: C4NodeData
    ): Promise<ArchitectureModelDocument> => {
      await writePendingModelNow()
      const selfWritePath = joinPath(
        joinPath(projectPath, '.scryer'),
        `${activeModelNameRef.current}.scry`
      )
      recordArchitectureSelfWrite(selfWritePath)
      const result = await window.api.architecture.patchNodeData({
        projectPath,
        modelName: activeModelNameRef.current,
        nodeId,
        patch,
        baseRevision: revisionRef.current,
        baseNodeData
      })
      revisionRef.current = result.revision
      return result
    },
    [projectPath, writePendingModelNow]
  )

  useEffect(
    () => () => {
      if (pendingModelWriteTimerRef.current !== null) {
        window.clearTimeout(pendingModelWriteTimerRef.current)
      }
      void writePendingModelNow()
    },
    [writePendingModelNow]
  )

  useEffect(() => {
    if (!projectPath) {
      return
    }
    void window.api.architecture.watchModel({ projectPath })
    return window.api.architecture.onModelChanged((event) => {
      if (event.projectPath !== projectPath) {
        return
      }
      const changedPath = joinPath(joinPath(event.projectPath, '.scryer'), event.fileName)
      if (hasRecentArchitectureSelfWrite(changedPath)) {
        return
      }
      if (event.fileName !== `${activeModelNameRef.current}.scry`) {
        void refreshProjectModels()
        return
      }
      void (async () => {
        const remaining = await window.api.architecture.listModels({ projectPath })
        if (!remaining.some((entry) => entry.fileName === event.fileName)) {
          setProjectModels(remaining)
          onActiveModelRemoved(activeModelNameRef.current, remaining)
          return
        }
        setProjectModels(remaining)
        if (isActiveModelEditableTarget()) {
          return
        }
        onActiveModelReload()
      })().catch(onError)
    })
  }, [
    isActiveModelEditableTarget,
    onActiveModelReload,
    onActiveModelRemoved,
    onError,
    projectPath,
    refreshProjectModels
  ])

  return {
    activeModelName,
    activeModelNameRef,
    projectModels,
    templates,
    readModelDocument,
    acceptLoadedModelDocument,
    refreshProjectModels,
    scheduleModelWrite,
    writePendingModelNow,
    patchActiveNodeData
  }
}
