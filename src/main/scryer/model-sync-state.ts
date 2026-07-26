import { existsSync } from 'node:fs'
import { readFile, rm, stat } from 'node:fs/promises'
import type { C4ModelData } from '../../shared/scryer/model-types'
import { parseModelData, serializeModelData } from '../../shared/scryer/parse-model'
import {
  atomicWrite,
  getProjectBaselinePath,
  getProjectImplementingPath,
  getProjectModelPath,
  getProjectPreSyncSnapshotPath,
  getProjectSyncPath
} from './model-store-core'

export async function writeBaseline(projectPath: string, model: C4ModelData): Promise<void> {
  await atomicWrite(getProjectBaselinePath(projectPath), serializeModelData(model))
}

export async function writePreSyncSnapshot(projectPath: string, model: C4ModelData): Promise<void> {
  await atomicWrite(getProjectPreSyncSnapshotPath(projectPath), serializeModelData(model))
}

export async function readBaseline(projectPath: string): Promise<C4ModelData | null> {
  const baselinePath = getProjectBaselinePath(projectPath)
  if (!existsSync(baselinePath)) {
    return null
  }
  return parseModelData(await readFile(baselinePath, 'utf8'))
}

export async function readPreSyncSnapshot(projectPath: string): Promise<C4ModelData | null> {
  const snapshotPath = getProjectPreSyncSnapshotPath(projectPath)
  if (!existsSync(snapshotPath)) {
    return null
  }
  return parseModelData(await readFile(snapshotPath, 'utf8'))
}

export function hasPreSyncSnapshot(projectPath: string): boolean {
  return existsSync(getProjectPreSyncSnapshotPath(projectPath))
}

export async function clearPreSyncSnapshot(projectPath: string): Promise<void> {
  await rm(getProjectPreSyncSnapshotPath(projectPath), { force: true })
}

export async function markSynced(projectPath: string): Promise<void> {
  await atomicWrite(getProjectSyncPath(projectPath), new Date().toISOString())
}

export async function getModelBaselineMtime(projectPath: string): Promise<Date> {
  const candidates = [getProjectSyncPath(projectPath), getProjectModelPath(projectPath)]
  const mtimes: number[] = []
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      mtimes.push((await stat(candidate)).mtime.getTime())
    }
  }
  return new Date(Math.max(...mtimes, 0))
}

export async function setImplementing(projectPath: string, active: boolean): Promise<void> {
  const path = getProjectImplementingPath(projectPath)
  if (active) {
    await atomicWrite(path, '')
    return
  }
  if (existsSync(path)) {
    await rm(path, { force: true })
  }
}

export function isImplementing(projectPath: string): boolean {
  return existsSync(getProjectImplementingPath(projectPath))
}
