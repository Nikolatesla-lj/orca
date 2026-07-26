import { existsSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { C4ModelData } from '../../shared/scryer/model-types'
import { parseModelData, serializeModelData } from '../../shared/scryer/parse-model'
import { getBuiltInScryerTemplate } from '../../shared/scryer/templates'
import { readModel, writeModel } from './model-document-store'
import {
  atomicWrite,
  createBlankModel,
  getGlobalModelPath,
  getGlobalScryerDir,
  getProjectModelPath,
  getProjectScryerDir,
  normalizeModelForProject,
  sanitizeProjectModelName
} from './model-store-core'

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
