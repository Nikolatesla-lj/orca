/* eslint-disable max-lines -- Why: S7A keeps cache request validation, path containment, and read/write/clear IPC service logic together until S7B wires the UI consumers. */
import { constants } from 'fs'
import { access, mkdir, readFile, rename, rm, unlink, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import type { Store } from '../persistence'
import { isDescendantOrEqual } from './filesystem-auth'
import { sanitizeProjectModelName } from '../scryer/model-store'
import { assertAuthorizedArchitectureProjectPath } from './architecture-project-auth'
import type {
  DiagramCacheClearRequest,
  DiagramCacheClearResult,
  DiagramCacheFailure,
  DiagramCacheOutputProfile,
  DiagramCacheReadRequest,
  DiagramCacheReadResult,
  DiagramCacheWriteRequest,
  DiagramCacheWriteResult
} from '../../shared/scryer/diagram-cache'
export {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  normalizeDiagramSourceForHash
} from '../../shared/scryer/diagram-cache'

export const MAX_DIAGRAM_CACHE_SVG_BYTES = 2 * 1024 * 1024
export const MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES = 10 * 1024 * 1024

const DIAGRAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const CACHE_KEY_PATTERN = /^sha256:[0-9a-f]{64}$/
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

type CachePathContext = {
  cacheRoot: string
  modelDir: string
  diagramDir?: string
  filePath?: string
}

type DiagramCacheFs = {
  access: typeof access
  mkdir: typeof mkdir
  readFile: typeof readFile
  rename: typeof rename
  rm: typeof rm
  unlink: typeof unlink
  writeFile: typeof writeFile
}

type DiagramCacheServiceOptions = {
  fs?: Partial<DiagramCacheFs>
}

const defaultCacheFs: DiagramCacheFs = {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile
}

function resolveCacheFs(options?: DiagramCacheServiceOptions): DiagramCacheFs {
  return { ...defaultCacheFs, ...options?.fs }
}

function failure(
  code: DiagramCacheFailure['code'],
  message: string,
  details?: unknown
): DiagramCacheFailure {
  return { ok: false, code, message, ...(details === undefined ? {} : { details }) }
}

function validateDiagramId(diagramId: string | undefined): DiagramCacheFailure | null {
  if (diagramId === undefined) {
    return null
  }
  if (!DIAGRAM_ID_PATTERN.test(diagramId)) {
    return failure('cache.invalid-diagram-id', 'Diagram cache id is invalid', { diagramId })
  }
  return null
}

function validateCacheKey(cacheKey: string): DiagramCacheFailure | null {
  if (!CACHE_KEY_PATTERN.test(cacheKey)) {
    return failure('cache.invalid-cache-key', 'Diagram cache key is invalid', { cacheKey })
  }
  return null
}

function filenameForCacheKey(
  cacheKey: `sha256:${string}`,
  outputProfile: DiagramCacheOutputProfile
): string {
  const hash = cacheKey.replace('sha256:', '')
  switch (outputProfile) {
    case 'review':
      return `${hash}.svg`
    case 'thumbnail':
      return `${hash}.thumbnail.png.txt`
    case 'export':
      return `${hash}.export.png.txt`
  }
}

async function resolveCachePathContext(
  request: DiagramCacheReadRequest | DiagramCacheClearRequest,
  store: Store,
  cacheKey?: `sha256:${string}`,
  outputProfile?: DiagramCacheOutputProfile
): Promise<CachePathContext | DiagramCacheFailure> {
  let authorizedProjectPath: string
  try {
    authorizedProjectPath = await assertAuthorizedArchitectureProjectPath(
      request.projectPath,
      store
    )
  } catch (error) {
    return failure(
      'cache.unauthorized-project',
      'Project path is not authorized for diagram cache',
      {
        projectPath: request.projectPath,
        reason: error instanceof Error ? error.message : String(error)
      }
    )
  }

  const normalizedModelName = sanitizeProjectModelName(request.modelName)
  const cacheRoot = resolve(authorizedProjectPath, '.scryer', 'cache', 'diagrams')
  const modelDir = resolve(cacheRoot, normalizedModelName)
  if (!isDescendantOrEqual(modelDir, cacheRoot)) {
    return failure('cache.path-outside-cache', 'Resolved model cache path escaped cache root', {
      cacheRoot,
      resolvedPath: modelDir
    })
  }

  if (!('diagramId' in request) || !request.diagramId) {
    return { cacheRoot, modelDir }
  }

  const diagramDir = resolve(modelDir, request.diagramId)
  if (!isDescendantOrEqual(diagramDir, modelDir)) {
    return failure('cache.path-outside-cache', 'Resolved diagram cache path escaped model cache', {
      cacheRoot,
      resolvedPath: diagramDir
    })
  }

  if (!cacheKey || !outputProfile) {
    return { cacheRoot, modelDir, diagramDir }
  }

  const filePath = resolve(diagramDir, filenameForCacheKey(cacheKey, outputProfile))
  if (!isDescendantOrEqual(filePath, diagramDir)) {
    return failure('cache.path-outside-cache', 'Resolved cache file escaped diagram cache', {
      cacheRoot,
      resolvedPath: filePath
    })
  }
  return { cacheRoot, modelDir, diagramDir, filePath }
}

function isFailure(value: CachePathContext | DiagramCacheFailure): value is DiagramCacheFailure {
  return 'ok' in value && value.ok === false
}

function validateWritePayload(request: DiagramCacheWriteRequest): DiagramCacheFailure | null {
  const hasSvg = typeof request.svg === 'string' && request.svg.length > 0
  const hasPng = typeof request.pngDataUrl === 'string' && request.pngDataUrl.length > 0
  if (!hasSvg && !hasPng) {
    return failure('cache.empty-payload', 'Diagram cache write payload is empty', {
      diagramId: request.diagramId,
      cacheKey: request.cacheKey
    })
  }
  if (request.outputProfile === 'review' && (!hasSvg || hasPng)) {
    return failure(
      'cache.payload-profile-mismatch',
      'Review cache writes require SVG payload only',
      {
        outputProfile: request.outputProfile,
        providedPayloadKeys: Object.keys(request).filter(
          (key) => key === 'svg' || key === 'pngDataUrl'
        )
      }
    )
  }
  if (request.outputProfile !== 'review' && (!hasPng || hasSvg)) {
    return failure(
      'cache.payload-profile-mismatch',
      'Thumbnail and export cache writes require PNG data URL payload only',
      {
        outputProfile: request.outputProfile,
        providedPayloadKeys: Object.keys(request).filter(
          (key) => key === 'svg' || key === 'pngDataUrl'
        )
      }
    )
  }
  const payload = request.outputProfile === 'review' ? request.svg! : request.pngDataUrl!
  const maxBytes =
    request.outputProfile === 'review'
      ? MAX_DIAGRAM_CACHE_SVG_BYTES
      : MAX_DIAGRAM_CACHE_PNG_DATA_URL_BYTES
  const byteLength = Buffer.byteLength(payload, 'utf8')
  if (byteLength > maxBytes) {
    return failure('cache.payload-too-large', 'Diagram cache payload is too large', {
      outputProfile: request.outputProfile,
      byteLength,
      limit: maxBytes
    })
  }
  return null
}

function isValidPayload(outputProfile: DiagramCacheOutputProfile, payload: string): boolean {
  if (outputProfile === 'review') {
    return payload.length > 0 && payload.includes('<svg')
  }
  return payload.startsWith(PNG_DATA_URL_PREFIX)
}

export async function readDiagramCache(
  request: DiagramCacheReadRequest,
  store: Store,
  options?: DiagramCacheServiceOptions
): Promise<DiagramCacheReadResult | DiagramCacheFailure> {
  const fs = resolveCacheFs(options)
  const diagramIdFailure = validateDiagramId(request.diagramId)
  if (diagramIdFailure) {
    return diagramIdFailure
  }
  const cacheKeyFailure = validateCacheKey(request.cacheKey)
  if (cacheKeyFailure) {
    return cacheKeyFailure
  }

  const context = await resolveCachePathContext(
    request,
    store,
    request.cacheKey,
    request.outputProfile
  )
  if (isFailure(context)) {
    return context
  }
  try {
    const payload = await fs.readFile(context.filePath!, 'utf8')
    if (!isValidPayload(request.outputProfile, payload)) {
      return { ok: true, hit: false, outputProfile: request.outputProfile, code: 'cache.read-miss' }
    }
    if (request.outputProfile === 'review') {
      return { ok: true, hit: true, outputProfile: 'review', svg: payload }
    }
    return { ok: true, hit: true, outputProfile: request.outputProfile, pngDataUrl: payload }
  } catch {
    return { ok: true, hit: false, outputProfile: request.outputProfile, code: 'cache.read-miss' }
  }
}

export async function writeDiagramCache(
  request: DiagramCacheWriteRequest,
  store: Store,
  options?: DiagramCacheServiceOptions
): Promise<DiagramCacheWriteResult | DiagramCacheFailure> {
  const fs = resolveCacheFs(options)
  const diagramIdFailure = validateDiagramId(request.diagramId)
  if (diagramIdFailure) {
    return diagramIdFailure
  }
  const cacheKeyFailure = validateCacheKey(request.cacheKey)
  if (cacheKeyFailure) {
    return cacheKeyFailure
  }
  const payloadFailure = validateWritePayload(request)
  if (payloadFailure) {
    return payloadFailure
  }

  const context = await resolveCachePathContext(
    request,
    store,
    request.cacheKey,
    request.outputProfile
  )
  if (isFailure(context)) {
    return context
  }

  const payload = request.outputProfile === 'review' ? request.svg! : request.pngDataUrl!
  const tempPath = `${context.filePath!}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.mkdir(dirname(context.filePath!), { recursive: true })
    await fs.writeFile(tempPath, payload, 'utf8')
    await fs.rename(tempPath, context.filePath!)
    return { ok: true }
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    return failure('cache.write-failed', 'Diagram cache write failed', {
      diagramId: request.diagramId,
      cacheKey: request.cacheKey,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function clearDiagramCache(
  request: DiagramCacheClearRequest,
  store: Store,
  options?: DiagramCacheServiceOptions
): Promise<DiagramCacheClearResult | DiagramCacheFailure> {
  const fs = resolveCacheFs(options)
  const diagramIdFailure = validateDiagramId(request.diagramId)
  if (diagramIdFailure) {
    return diagramIdFailure
  }
  const context = await resolveCachePathContext(request, store)
  if (isFailure(context)) {
    return context
  }
  const targetPath = request.diagramId ? context.diagramDir! : context.modelDir
  try {
    await fs.access(targetPath, constants.F_OK).catch(() => undefined)
    await fs.rm(targetPath, { recursive: true, force: true })
    return { ok: true }
  } catch (error) {
    return failure('cache.clear-failed', 'Diagram cache clear failed', {
      modelName: request.modelName,
      diagramId: request.diagramId,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}
