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
  readModel,
  saveProjectModelAs,
  sanitizeProjectModelName,
  writeModel
} from '../scryer/model-store'
import { checkDrift } from '../scryer/drift'
import { callScryerTool } from '../scryer/mcp-tools'
import { writeArchitectureMcpConfig } from '../scryer/mcp-config'
import { beginSync, cancelSync, finishSync } from '../scryer/sync'
import {
  advisorPrompt,
  initialModelPrompt,
  nodeFillPrompt,
  serializeModelForPrompt
} from '../../shared/scryer/prompts'
import type { C4ModelData, ScryerToolCall } from '../../shared/scryer/model-types'
import { BUILT_IN_SCRYER_TEMPLATES } from '../../shared/scryer/templates'

const watchers = new Map<string, FSWatcher>()

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

function projectKey(projectPath: string): string {
  return getProjectScryerDir(projectPath)
}

function notifyModelChanged(
  event: IpcMainInvokeEvent | null,
  projectPath: string,
  modelName?: string | null
): void {
  event?.sender.send('architecture:modelChanged', {
    projectPath,
    fileName: `${sanitizeProjectModelName(modelName)}.scry`
  })
}

export function closeArchitectureWatchers(): void {
  for (const watcher of watchers.values()) {
    watcher.close()
  }
  watchers.clear()
}

export function registerArchitectureHandlers(): void {
  ipcMain.handle(
    'architecture:readModel',
    (_event, args: { projectPath: string; modelName?: string | null }) =>
      readModel(args.projectPath, args.modelName)
  )

  ipcMain.handle(
    'architecture:writeModel',
    async (event, args: { projectPath: string; model: C4ModelData; modelName?: string | null }) => {
      await writeModel(args.projectPath, args.model, args.modelName)
      notifyModelChanged(event, args.projectPath, args.modelName)
    }
  )

  ipcMain.handle('architecture:listModels', (_event, args: { projectPath: string }) =>
    listProjectModels(args.projectPath)
  )

  ipcMain.handle(
    'architecture:migrateGlobalModel',
    async (event, args: { projectPath: string; modelName: string }) => {
      const result = await migrateGlobalModelToProject(args.projectPath, args.modelName)
      notifyModelChanged(event, args.projectPath, result.modelName)
      return result
    }
  )

  ipcMain.handle(
    'architecture:createModel',
    async (
      event,
      args: { projectPath: string; modelName?: string | null; templateId?: string | null }
    ) => {
      const model = await createProjectModel(args.projectPath, {
        modelName: args.modelName,
        templateId: args.templateId
      })
      notifyModelChanged(event, args.projectPath, args.modelName)
      return { modelName: sanitizeProjectModelName(args.modelName), model }
    }
  )

  ipcMain.handle(
    'architecture:saveModelAs',
    async (
      event,
      args: { projectPath: string; fromModelName?: string | null; toModelName: string }
    ) => {
      const model = await saveProjectModelAs(args.projectPath, args.fromModelName, args.toModelName)
      notifyModelChanged(event, args.projectPath, args.toModelName)
      return { modelName: sanitizeProjectModelName(args.toModelName), model }
    }
  )

  ipcMain.handle(
    'architecture:deleteModel',
    async (event, args: { projectPath: string; modelName: string }) => {
      await deleteProjectModel(args.projectPath, args.modelName)
      notifyModelChanged(event, args.projectPath, args.modelName)
    }
  )

  ipcMain.handle('architecture:listTemplates', () =>
    BUILT_IN_SCRYER_TEMPLATES.map((template) => ({ id: template.id, name: template.name }))
  )

  ipcMain.handle('architecture:writeMcpConfig', (_event, args: { projectPath: string }) =>
    writeArchitectureMcpConfig(args.projectPath)
  )

  ipcMain.handle(
    'architecture:prepareInitialModelPrompt',
    (_event, args: { projectPath: string; modelName: string }) => ({
      prompt: initialModelPrompt(args.modelName, args.projectPath)
    })
  )

  ipcMain.handle(
    'architecture:prepareNodeFillPrompt',
    async (_event, args: { projectPath: string; modelName?: string | null; nodeId: string }) => {
      const model = await readModel(args.projectPath, args.modelName)
      const node = model.nodes.find((candidate) => candidate.id === args.nodeId)
      if (!node) {
        throw new Error(`Node '${args.nodeId}' not found`)
      }
      return {
        prompt: nodeFillPrompt({
          modelName: sanitizeProjectModelName(args.modelName),
          cwd: args.projectPath,
          nodeId: node.id,
          nodeName: node.data.name,
          nodeKind: node.data.kind,
          modelJson: serializeModelForPrompt(model)
        })
      }
    }
  )

  ipcMain.handle(
    'architecture:prepareAdvisorPrompt',
    async (_event, args: { projectPath: string; modelName?: string | null }) => {
      const model = await readModel(args.projectPath, args.modelName)
      return {
        prompt: advisorPrompt({
          modelName: sanitizeProjectModelName(args.modelName),
          cwd: args.projectPath,
          modelJson: serializeModelForPrompt(model)
        })
      }
    }
  )

  ipcMain.handle('architecture:checkDrift', (_event, args: { projectPath: string }) =>
    checkDrift(args.projectPath)
  )

  ipcMain.handle('architecture:markSynced', async (_event, args: { projectPath: string }) => {
    await markSynced(args.projectPath)
  })

  ipcMain.handle('architecture:isSyncing', (_event, args: { projectPath: string }) =>
    isImplementing(args.projectPath)
  )

  ipcMain.handle('architecture:hasPreSyncSnapshot', (_event, args: { projectPath: string }) =>
    hasPreSyncSnapshot(args.projectPath)
  )

  ipcMain.handle(
    'architecture:beginSync',
    (_event, args: { projectPath: string; modelName?: string }) =>
      beginSync(args.projectPath, { modelName: args.modelName })
  )

  ipcMain.handle('architecture:cancelSync', (_event, args: { projectPath: string }) =>
    cancelSync(args.projectPath)
  )

  ipcMain.handle('architecture:finishSync', async (_event, args: { projectPath: string }) => {
    await finishSync(args.projectPath)
  })

  ipcMain.handle(
    'architecture:callTool',
    async (event, args: { projectPath: string; call: ScryerToolCall }) => {
      const result = await callScryerTool(args.projectPath, args.call)
      if (result.ok) {
        notifyModelChanged(event, args.projectPath)
      }
      return result
    }
  )

  ipcMain.handle('architecture:watchModel', async (event, args: { projectPath: string }) => {
    const key = projectKey(args.projectPath)
    if (watchers.has(key)) {
      return
    }
    await readModel(args.projectPath)
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
