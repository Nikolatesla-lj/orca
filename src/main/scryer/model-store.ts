import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import type { C4ModelData } from '../../shared/scryer/model-types'
import { parseModelData, serializeModelData } from '../../shared/scryer/parse-model'

export function getProjectScryerDir(projectPath: string): string {
  return join(resolve(projectPath), '.scryer')
}

export function getProjectModelPath(projectPath: string): string {
  return join(getProjectScryerDir(projectPath), 'model.scry')
}

export function getProjectBaselinePath(projectPath: string): string {
  return join(getProjectScryerDir(projectPath), 'model.baseline.scry')
}

export function getProjectSyncPath(projectPath: string): string {
  return join(getProjectScryerDir(projectPath), '.sync')
}

export function getProjectImplementingPath(projectPath: string): string {
  return join(getProjectScryerDir(projectPath), '.implementing')
}

export function getProjectPreSyncSnapshotPath(projectPath: string): string {
  return join(getProjectScryerDir(projectPath), 'model.presync.scry')
}

export function createBlankModel(projectPath: string): C4ModelData {
  return {
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    projectPath: resolve(projectPath),
    refPositions: {},
    groups: [],
    flows: []
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(dirname(filePath), `.${Date.now()}-${globalThis.crypto.randomUUID()}.tmp`)
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)
}

export async function readModel(projectPath: string): Promise<C4ModelData> {
  const modelPath = getProjectModelPath(projectPath)
  if (!existsSync(modelPath)) {
    const blank = createBlankModel(projectPath)
    await writeModel(projectPath, blank)
    return blank
  }
  let raw: string
  try {
    raw = await readFile(modelPath, 'utf8')
  } catch (error) {
    throw new Error(
      `Failed to read Scryer model: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const parsed = parseModelData(raw)
  return {
    ...parsed,
    projectPath: parsed.projectPath ?? resolve(projectPath)
  }
}

export async function writeModel(projectPath: string, model: C4ModelData): Promise<void> {
  const normalized: C4ModelData = {
    ...model,
    projectPath: model.projectPath ?? resolve(projectPath),
    startingLevel: model.startingLevel ?? 'system',
    sourceMap: model.sourceMap ?? {},
    refPositions: model.refPositions ?? {},
    groups: model.groups ?? [],
    flows: model.flows ?? []
  }
  await atomicWrite(getProjectModelPath(projectPath), serializeModelData(normalized))
}

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
