import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { C4ModelData, C4NodeData } from '../../shared/scryer/model-types'
import { parseModelData, serializeModelData } from '../../shared/scryer/parse-model'
import {
  atomicWrite,
  createBlankModel,
  getProjectModelPath,
  normalizeModelForProject
} from './model-store-core'

export type ModelDocument = {
  model: C4ModelData
  revision: string
}

function revisionForContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function readModel(
  projectPath: string,
  modelName?: string | null
): Promise<C4ModelData> {
  return (await readModelDocument(projectPath, modelName)).model
}

export async function readModelDocument(
  projectPath: string,
  modelName?: string | null
): Promise<ModelDocument> {
  const modelPath = getProjectModelPath(projectPath, modelName)
  if (!existsSync(modelPath)) {
    const blank = createBlankModel(projectPath)
    await writeModel(projectPath, blank, modelName)
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
    model: normalizeModelForProject(projectPath, parsed),
    revision: revisionForContent(raw)
  }
}

export async function writeModel(
  projectPath: string,
  model: C4ModelData,
  modelName?: string | null
): Promise<void> {
  await writeModelDocument(projectPath, model, modelName)
}

export async function writeModelDocument(
  projectPath: string,
  model: C4ModelData,
  modelName?: string | null,
  options: { baseRevision?: string | null } = {}
): Promise<ModelDocument> {
  if (options.baseRevision) {
    const current = await readModelDocument(projectPath, modelName)
    if (current.revision !== options.baseRevision) {
      throw new Error('Scryer model changed on disk. Reload or merge before saving.')
    }
  }
  const content = serializeModelData(normalizeModelForProject(projectPath, model))
  await atomicWrite(getProjectModelPath(projectPath, modelName), content)
  return {
    model: normalizeModelForProject(projectPath, model),
    revision: revisionForContent(content)
  }
}

export async function patchNodeData(
  projectPath: string,
  args: {
    nodeId: string
    patch: Partial<C4NodeData>
    modelName?: string | null
    baseRevision?: string | null
    baseNodeData?: C4NodeData | null
  }
): Promise<ModelDocument> {
  const current = await readModelDocument(projectPath, args.modelName)
  const target = current.model.nodes.find((node) => node.id === args.nodeId)
  if (!target) {
    throw new Error(`Node '${args.nodeId}' not found`)
  }
  if (args.baseRevision && args.baseRevision !== current.revision && args.baseNodeData) {
    const conflictingKeys = Object.keys(args.patch).filter((key) => {
      const patchKey = key as keyof C4NodeData
      return (
        JSON.stringify(target.data[patchKey]) !== JSON.stringify(args.baseNodeData?.[patchKey]) &&
        JSON.stringify(target.data[patchKey]) !== JSON.stringify(args.patch[patchKey])
      )
    })
    if (conflictingKeys.length > 0) {
      throw new Error(
        `Scryer model changed on disk for ${conflictingKeys.join(', ')}. Reload before saving.`
      )
    }
  }
  const nextModel = {
    ...current.model,
    nodes: current.model.nodes.map((node) =>
      node.id === args.nodeId ? { ...node, data: { ...node.data, ...args.patch } } : node
    )
  }
  return writeModelDocument(projectPath, nextModel, args.modelName)
}
