import { mkdir, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import {
  SCRY_SCHEMA_VERSION,
  type C4ModelData,
  type C4ModelDataV2
} from '../../shared/scryer/model-types'

export function getProjectScryerDir(projectPath: string): string {
  return join(resolve(projectPath), '.scryer')
}

export function getGlobalScryerDir(globalHomePath = homedir()): string {
  return join(resolve(globalHomePath), '.scryer')
}

export function sanitizeProjectModelName(modelName?: string | null): string {
  const raw = (modelName ?? 'model').trim().replace(/\.scry$/i, '')
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'model'
}

export function getProjectModelPath(projectPath: string, modelName?: string | null): string {
  return join(getProjectScryerDir(projectPath), `${sanitizeProjectModelName(modelName)}.scry`)
}

export function getGlobalModelPath(modelName?: string | null, globalHomePath = homedir()): string {
  return join(getGlobalScryerDir(globalHomePath), `${sanitizeProjectModelName(modelName)}.scry`)
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

export function createBlankModel(projectPath: string): C4ModelDataV2 {
  return {
    schemaVersion: SCRY_SCHEMA_VERSION,
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    projectPath: resolve(projectPath),
    refPositions: {},
    groups: [],
    flows: [],
    diagrams: [],
    diagramRefs: []
  }
}

export function normalizeModelForProject(projectPath: string, model: C4ModelData): C4ModelDataV2 {
  return {
    ...model,
    schemaVersion: SCRY_SCHEMA_VERSION,
    projectPath: resolve(projectPath),
    startingLevel: model.startingLevel ?? 'system',
    sourceMap: model.sourceMap ?? {},
    refPositions: model.refPositions ?? {},
    groups: model.groups ?? [],
    flows: model.flows ?? [],
    diagrams: model.diagrams ?? [],
    diagramRefs: model.diagramRefs ?? []
  }
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(dirname(filePath), `.${Date.now()}-${globalThis.crypto.randomUUID()}.tmp`)
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)
}
