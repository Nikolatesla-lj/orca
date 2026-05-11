import { watch, type FSWatcher } from 'fs'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  getProjectScryerDir,
  hasPreSyncSnapshot,
  isImplementing,
  markSynced,
  readModel,
  writeModel
} from '../scryer/model-store'
import { checkDrift } from '../scryer/drift'
import { callScryerTool } from '../scryer/mcp-tools'
import { beginSync, cancelSync, finishSync } from '../scryer/sync'
import type { C4ModelData, ScryerToolCall } from '../../shared/scryer/model-types'

const watchers = new Map<string, FSWatcher>()

function projectKey(projectPath: string): string {
  return getProjectScryerDir(projectPath)
}

function notifyModelChanged(event: IpcMainInvokeEvent | null, projectPath: string): void {
  event?.sender.send('architecture:modelChanged', {
    projectPath,
    fileName: 'model.scry'
  })
}

export function closeArchitectureWatchers(): void {
  for (const watcher of watchers.values()) {
    watcher.close()
  }
  watchers.clear()
}

export function registerArchitectureHandlers(): void {
  ipcMain.handle('architecture:readModel', (_event, args: { projectPath: string }) =>
    readModel(args.projectPath)
  )

  ipcMain.handle(
    'architecture:writeModel',
    async (event, args: { projectPath: string; model: C4ModelData }) => {
      await writeModel(args.projectPath, args.model)
      notifyModelChanged(event, args.projectPath)
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
      if (!filename || !String(filename).endsWith('.scry')) {
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
