import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import type { C4ModelData } from '../../shared/scryer/model-types'
import { parseModelData, serializeModelData } from '../../shared/scryer/parse-model'
import { getBuiltInScryerTemplate } from '../../shared/scryer/templates'

export type ProjectModelEntry = {
  name: string
  fileName: string
  path: string
  isDefault: boolean
  scope: 'project' | 'global'
}

export type ListProjectModelsOptions = {
  includeGlobal?: boolean
  globalHomePath?: string
}

export type GlobalModelOptions = {
  globalHomePath?: string
}

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

function normalizeModelForProject(projectPath: string, model: C4ModelData): C4ModelData {
  return {
    ...model,
    projectPath: resolve(projectPath),
    startingLevel: model.startingLevel ?? 'system',
    sourceMap: model.sourceMap ?? {},
    refPositions: model.refPositions ?? {},
    groups: model.groups ?? [],
    flows: model.flows ?? []
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(dirname(filePath), `.${Date.now()}-${globalThis.crypto.randomUUID()}.tmp`)
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)
}

export async function readModel(
  projectPath: string,
  modelName?: string | null
): Promise<C4ModelData> {
  const modelPath = getProjectModelPath(projectPath, modelName)
  if (!existsSync(modelPath)) {
    const blank = createBlankModel(projectPath)
    await writeModel(projectPath, blank, modelName)
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
  return normalizeModelForProject(projectPath, parsed)
}

export async function writeModel(
  projectPath: string,
  model: C4ModelData,
  modelName?: string | null
): Promise<void> {
  await atomicWrite(
    getProjectModelPath(projectPath, modelName),
    serializeModelData(normalizeModelForProject(projectPath, model))
  )
}

async function listModelFiles(
  dir: string,
  scope: ProjectModelEntry['scope']
): Promise<ProjectModelEntry[]> {
  if (!existsSync(dir)) {
    return []
  }
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.scry'))
    .filter((entry) => !entry.name.endsWith('.baseline.scry') && !entry.name.startsWith('.'))
    .map((entry) => {
      const name = entry.name.replace(/\.scry$/i, '')
      return {
        name,
        fileName: entry.name,
        path: join(dir, entry.name),
        isDefault: name === 'model',
        scope
      }
    })
}

function sortModelEntries(entries: ProjectModelEntry[]): ProjectModelEntry[] {
  return [...entries].sort(
    (left, right) =>
      Number(right.scope === 'project') - Number(left.scope === 'project') ||
      Number(right.isDefault) - Number(left.isDefault) ||
      left.name.localeCompare(right.name)
  )
}

export async function listGlobalModels(
  options: GlobalModelOptions = {}
): Promise<ProjectModelEntry[]> {
  return sortModelEntries(
    await listModelFiles(getGlobalScryerDir(options.globalHomePath), 'global')
  )
}

export async function listProjectModels(
  projectPath: string,
  options: ListProjectModelsOptions = {}
): Promise<ProjectModelEntry[]> {
  const projectModels = await listModelFiles(getProjectScryerDir(projectPath), 'project')
  const globalModels =
    options.includeGlobal === false
      ? []
      : await listGlobalModels({ globalHomePath: options.globalHomePath })
  const projectNames = new Set(projectModels.map((entry) => entry.name))
  return sortModelEntries([
    ...projectModels,
    ...globalModels.filter((entry) => !projectNames.has(entry.name))
  ])
}

export async function createProjectModel(
  projectPath: string,
  options: { modelName?: string | null; templateId?: string | null } = {}
): Promise<C4ModelData> {
  const template = options.templateId ? getBuiltInScryerTemplate(options.templateId) : null
  const model = template
    ? normalizeModelForProject(
        projectPath,
        JSON.parse(JSON.stringify(template.model)) as C4ModelData
      )
    : createBlankModel(projectPath)
  await writeModel(projectPath, model, options.modelName)
  return model
}

export async function createGlobalModel(
  globalHomePath: string,
  options: { modelName?: string | null; templateId?: string | null; model?: C4ModelData } = {}
): Promise<C4ModelData> {
  const template = options.templateId ? getBuiltInScryerTemplate(options.templateId) : null
  const model = options.model
    ? normalizeModelForProject(globalHomePath, options.model)
    : template
      ? normalizeModelForProject(
          globalHomePath,
          JSON.parse(JSON.stringify(template.model)) as C4ModelData
        )
      : createBlankModel(globalHomePath)
  await atomicWrite(
    getGlobalModelPath(options.modelName, globalHomePath),
    serializeModelData(normalizeModelForProject(globalHomePath, model))
  )
  return model
}

export async function migrateGlobalModelToProject(
  projectPath: string,
  modelName: string | null | undefined,
  options: GlobalModelOptions = {}
): Promise<{ modelName: string; model: C4ModelData }> {
  const sanitized = sanitizeProjectModelName(modelName)
  const globalPath = getGlobalModelPath(sanitized, options.globalHomePath)
  if (!existsSync(globalPath)) {
    throw new Error(`Global Scryer model '${sanitized}' not found`)
  }
  const parsed = parseModelData(await readFile(globalPath, 'utf8'))
  const model = normalizeModelForProject(projectPath, parsed)
  await writeModel(projectPath, model, sanitized)
  return { modelName: sanitized, model }
}

export async function saveProjectModelAs(
  projectPath: string,
  fromModelName: string | null | undefined,
  toModelName: string
): Promise<C4ModelData> {
  const model = await readModel(projectPath, fromModelName)
  await writeModel(projectPath, model, toModelName)
  return model
}

export async function deleteProjectModel(
  projectPath: string,
  modelName: string | null | undefined
): Promise<void> {
  await rm(getProjectModelPath(projectPath, modelName), { force: true })
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
