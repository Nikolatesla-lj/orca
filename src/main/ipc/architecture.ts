/* eslint-disable max-lines -- Why: this IPC registrar remains a compatibility facade for Scryer model, drift, sync, MCP, and prompt handlers while the backing services are split behind injectable deps. */
import { watch, type FSWatcher } from 'fs'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  createProjectModel,
  deleteProjectModel,
  getProjectScryerDir,
  hasPreSyncSnapshot,
  isImplementing,
  listProjectModels,
  migrateGlobalModelToProject,
  markSynced,
  patchNodeData,
  readModel,
  readModelDocument,
  saveProjectModelAs,
  sanitizeProjectModelName,
  writeModel,
  writeModelDocument
} from '../scryer/model-store'
import { checkDrift } from '../scryer/drift'
import { callScryerTool } from '../scryer/mcp-tools'
import { writeArchitectureMcpConfig } from '../scryer/mcp-config'
import { beginSync, cancelSync, finishSync } from '../scryer/sync'
import { createScryerEngine, type ScryerOperationId } from '../scryer/engine'
import {
  advisorPrompt,
  initialModelPrompt,
  nodeFillPrompt,
  serializeModelForPrompt
} from '../../shared/scryer/prompts'
import type { C4ModelData, C4NodeData, ScryerToolCall } from '../../shared/scryer/model-types'
import { BUILT_IN_SCRYER_TEMPLATES } from '../../shared/scryer/templates'

const watchers = new Map<string, FSWatcher>()
const scryerEngine = createScryerEngine()
const SCRYER_WRITE_OPERATIONS = new Set<ScryerOperationId>([
  'scryer.node.update',
  'scryer.link.add',
  'scryer.link.delete',
  'scryer.plan.fold'
])

export type ArchitectureIpcRegistrar = {
  handle: <Args>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, args: Args) => unknown
  ) => void
}

export type ArchitectureHandlerDeps = {
  createProjectModel: typeof createProjectModel
  deleteProjectModel: typeof deleteProjectModel
  getProjectScryerDir: typeof getProjectScryerDir
  hasPreSyncSnapshot: typeof hasPreSyncSnapshot
  isImplementing: typeof isImplementing
  listProjectModels: typeof listProjectModels
  migrateGlobalModelToProject: typeof migrateGlobalModelToProject
  markSynced: typeof markSynced
  patchNodeData: typeof patchNodeData
  readModel: typeof readModel
  readModelDocument: typeof readModelDocument
  saveProjectModelAs: typeof saveProjectModelAs
  sanitizeProjectModelName: typeof sanitizeProjectModelName
  writeModel: typeof writeModel
  writeModelDocument: typeof writeModelDocument
  checkDrift: typeof checkDrift
  callScryerTool: typeof callScryerTool
  writeArchitectureMcpConfig: typeof writeArchitectureMcpConfig
  beginSync: typeof beginSync
  cancelSync: typeof cancelSync
  finishSync: typeof finishSync
}

const defaultArchitectureDeps: ArchitectureHandlerDeps = {
  createProjectModel,
  deleteProjectModel,
  getProjectScryerDir,
  hasPreSyncSnapshot,
  isImplementing,
  listProjectModels,
  migrateGlobalModelToProject,
  markSynced,
  patchNodeData,
  readModel,
  readModelDocument,
  saveProjectModelAs,
  sanitizeProjectModelName,
  writeModel,
  writeModelDocument,
  checkDrift,
  callScryerTool,
  writeArchitectureMcpConfig,
  beginSync,
  cancelSync,
  finishSync
}

export function shouldNotifyModelFile(filename: string | Buffer): boolean {
  const name = String(filename)
  if (!name || name.startsWith('.') || name.endsWith('.tmp')) {
    return false
  }
  if (!name.endsWith('.scry')) {
    return false
  }
  return !name.endsWith('.baseline.scry') && !name.endsWith('.presync.scry')
}

function projectKey(projectPath: string, deps: ArchitectureHandlerDeps): string {
  return deps.getProjectScryerDir(projectPath)
}

function notifyModelChanged(
  event: IpcMainInvokeEvent | null,
  projectPath: string,
  modelName: string | null | undefined,
  deps: ArchitectureHandlerDeps
): void {
  event?.sender.send('architecture:modelChanged', {
    projectPath,
    fileName: `${deps.sanitizeProjectModelName(modelName)}.scry`
  })
}

export function closeArchitectureWatchers(): void {
  for (const watcher of watchers.values()) {
    watcher.close()
  }
  watchers.clear()
}

export function registerArchitectureHandlers(
  registrar: ArchitectureIpcRegistrar = ipcMain,
  deps: ArchitectureHandlerDeps = defaultArchitectureDeps
): void {
  registrar.handle(
    'architecture:readModel',
    (_event, args: { projectPath: string; modelName?: string | null }) =>
      deps.readModel(args.projectPath, args.modelName)
  )

  registrar.handle(
    'architecture:readModelDocument',
    (_event, args: { projectPath: string; modelName?: string | null }) =>
      deps.readModelDocument(args.projectPath, args.modelName)
  )

  registrar.handle(
    'architecture:writeModel',
    async (event, args: { projectPath: string; model: C4ModelData; modelName?: string | null }) => {
      await deps.writeModel(args.projectPath, args.model, args.modelName)
      notifyModelChanged(event, args.projectPath, args.modelName, deps)
    }
  )

  registrar.handle(
    'architecture:writeModelDocument',
    async (
      event,
      args: {
        projectPath: string
        model: C4ModelData
        modelName?: string | null
        baseRevision?: string | null
      }
    ) => {
      const result = await deps.writeModelDocument(args.projectPath, args.model, args.modelName, {
        baseRevision: args.baseRevision
      })
      notifyModelChanged(event, args.projectPath, args.modelName, deps)
      return result
    }
  )

  registrar.handle(
    'architecture:patchNodeData',
    async (
      event,
      args: {
        projectPath: string
        nodeId: string
        patch: Partial<C4NodeData>
        modelName?: string | null
        baseRevision?: string | null
        baseNodeData?: C4NodeData | null
      }
    ) => {
      const result = await deps.patchNodeData(args.projectPath, args)
      notifyModelChanged(event, args.projectPath, args.modelName, deps)
      return result
    }
  )

  registrar.handle('architecture:listModels', (_event, args: { projectPath: string }) =>
    deps.listProjectModels(args.projectPath)
  )

  registrar.handle(
    'architecture:migrateGlobalModel',
    async (event, args: { projectPath: string; modelName: string }) => {
      const result = await deps.migrateGlobalModelToProject(args.projectPath, args.modelName)
      notifyModelChanged(event, args.projectPath, result.modelName, deps)
      return result
    }
  )

  registrar.handle(
    'architecture:createModel',
    async (
      event,
      args: { projectPath: string; modelName?: string | null; templateId?: string | null }
    ) => {
      const model = await deps.createProjectModel(args.projectPath, {
        modelName: args.modelName,
        templateId: args.templateId
      })
      notifyModelChanged(event, args.projectPath, args.modelName, deps)
      return { modelName: deps.sanitizeProjectModelName(args.modelName), model }
    }
  )

  registrar.handle(
    'architecture:saveModelAs',
    async (
      event,
      args: { projectPath: string; fromModelName?: string | null; toModelName: string }
    ) => {
      const model = await deps.saveProjectModelAs(
        args.projectPath,
        args.fromModelName,
        args.toModelName
      )
      notifyModelChanged(event, args.projectPath, args.toModelName, deps)
      return { modelName: deps.sanitizeProjectModelName(args.toModelName), model }
    }
  )

  registrar.handle(
    'architecture:deleteModel',
    async (event, args: { projectPath: string; modelName: string }) => {
      await deps.deleteProjectModel(args.projectPath, args.modelName)
      notifyModelChanged(event, args.projectPath, args.modelName, deps)
    }
  )

  registrar.handle('architecture:listTemplates', () =>
    BUILT_IN_SCRYER_TEMPLATES.map((template) => ({ id: template.id, name: template.name }))
  )

  registrar.handle('architecture:writeMcpConfig', (_event, args: { projectPath: string }) =>
    deps.writeArchitectureMcpConfig(args.projectPath)
  )

  registrar.handle(
    'architecture:prepareInitialModelPrompt',
    (_event, args: { projectPath: string; modelName: string }) => ({
      prompt: initialModelPrompt(args.modelName, args.projectPath)
    })
  )

  registrar.handle(
    'architecture:prepareNodeFillPrompt',
    async (_event, args: { projectPath: string; modelName?: string | null; nodeId: string }) => {
      const model = await deps.readModel(args.projectPath, args.modelName)
      const node = model.nodes.find((candidate) => candidate.id === args.nodeId)
      if (!node) {
        throw new Error(`Node '${args.nodeId}' not found`)
      }
      return {
        prompt: nodeFillPrompt({
          modelName: deps.sanitizeProjectModelName(args.modelName),
          cwd: args.projectPath,
          nodeId: node.id,
          nodeName: node.data.name,
          nodeKind: node.data.kind,
          modelJson: serializeModelForPrompt(model)
        })
      }
    }
  )

  registrar.handle(
    'architecture:prepareAdvisorPrompt',
    async (_event, args: { projectPath: string; modelName?: string | null }) => {
      const model = await deps.readModel(args.projectPath, args.modelName)
      return {
        prompt: advisorPrompt({
          modelName: deps.sanitizeProjectModelName(args.modelName),
          cwd: args.projectPath,
          modelJson: serializeModelForPrompt(model)
        })
      }
    }
  )

  registrar.handle('architecture:checkDrift', (_event, args: { projectPath: string }) =>
    deps.checkDrift(args.projectPath)
  )

  registrar.handle('architecture:markSynced', async (_event, args: { projectPath: string }) => {
    await deps.markSynced(args.projectPath)
  })

  registrar.handle('architecture:isSyncing', (_event, args: { projectPath: string }) =>
    deps.isImplementing(args.projectPath)
  )

  registrar.handle('architecture:hasPreSyncSnapshot', (_event, args: { projectPath: string }) =>
    deps.hasPreSyncSnapshot(args.projectPath)
  )

  registrar.handle(
    'architecture:beginSync',
    (_event, args: { projectPath: string; modelName?: string }) =>
      deps.beginSync(args.projectPath, { modelName: args.modelName })
  )

  registrar.handle('architecture:cancelSync', (_event, args: { projectPath: string }) =>
    deps.cancelSync(args.projectPath)
  )

  registrar.handle('architecture:finishSync', async (_event, args: { projectPath: string }) => {
    await deps.finishSync(args.projectPath)
  })

  registrar.handle(
    'architecture:callTool',
    async (event, args: { projectPath: string; call: ScryerToolCall }) => {
      const result = await deps.callScryerTool(args.projectPath, args.call)
      if (result.ok) {
        notifyModelChanged(event, args.projectPath, undefined, deps)
      }
      return result
    }
  )

  registrar.handle(
    'architecture:executeScryerOperation',
    async (
      event,
      args: {
        projectPath: string
        operationId: ScryerOperationId
        input?: unknown
        requestId?: string
        leaseToken?: string
      }
    ) => {
      const result = await scryerEngine.executeOperation(args.operationId, args.input ?? {}, {
        requestId: args.requestId ?? `ipc-${Date.now()}`,
        transport: 'ipc',
        caller: 'human',
        cwd: args.projectPath,
        projectRoot: args.projectPath,
        leaseToken: args.leaseToken
      })
      if (result.ok && SCRYER_WRITE_OPERATIONS.has(args.operationId)) {
        notifyModelChanged(event, args.projectPath, undefined, deps)
      }
      return result
    }
  )

  registrar.handle('architecture:watchModel', async (event, args: { projectPath: string }) => {
    const key = projectKey(args.projectPath, deps)
    if (watchers.has(key)) {
      return
    }
    await deps.readModel(args.projectPath)
    const watcher = watch(key, { persistent: false }, (_eventType, filename) => {
      if (!filename || !shouldNotifyModelFile(filename)) {
        return
      }
      event.sender.send('architecture:modelChanged', {
        projectPath: args.projectPath,
        fileName: String(filename)
      })
    })
    watcher.on('error', () => {
      watchers.delete(key)
    })
    watchers.set(key, watcher)
  })
}
