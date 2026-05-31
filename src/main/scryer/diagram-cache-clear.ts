import { constants } from 'fs'
import { access, rm } from 'fs/promises'
import { isAbsolute, relative, resolve } from 'path'
import type {
  DiagramCacheClearRequest,
  DiagramCacheClearResult,
  DiagramCacheFailure
} from '../../shared/scryer/diagram-cache'
import { sanitizeProjectModelName } from './model-store-core'

const DIAGRAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/

function failure(
  code: DiagramCacheFailure['code'],
  message: string,
  details?: unknown
): DiagramCacheFailure {
  return { ok: false, code, message, ...(details === undefined ? {} : { details }) }
}

function isDescendantOrEqual(target: string, base: string): boolean {
  if (target === base) {
    return true
  }
  const rel = relative(base, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && resolve(base, rel) === target
}

export async function clearDiagramCacheForMcp(
  request: DiagramCacheClearRequest
): Promise<DiagramCacheClearResult | DiagramCacheFailure> {
  if (request.diagramId !== undefined && !DIAGRAM_ID_PATTERN.test(request.diagramId)) {
    return failure('cache.invalid-diagram-id', 'Diagram cache id is invalid', {
      diagramId: request.diagramId
    })
  }

  const projectPath = resolve(request.projectPath)
  const cacheRoot = resolve(projectPath, '.scryer', 'cache', 'diagrams')
  const modelDir = resolve(cacheRoot, sanitizeProjectModelName(request.modelName))
  if (!isDescendantOrEqual(modelDir, cacheRoot)) {
    return failure('cache.path-outside-cache', 'Resolved model cache path escaped cache root', {
      cacheRoot,
      resolvedPath: modelDir
    })
  }

  const targetPath = request.diagramId ? resolve(modelDir, request.diagramId) : modelDir
  if (!isDescendantOrEqual(targetPath, modelDir)) {
    return failure('cache.path-outside-cache', 'Resolved diagram cache path escaped model cache', {
      cacheRoot,
      resolvedPath: targetPath
    })
  }

  try {
    await access(targetPath, constants.F_OK).catch(() => undefined)
    await rm(targetPath, { recursive: true, force: true })
    return { ok: true }
  } catch (error) {
    return failure('cache.clear-failed', 'Diagram cache clear failed', {
      modelName: request.modelName,
      diagramId: request.diagramId,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}
