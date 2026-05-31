import type {
  DiagramCacheClearRequest,
  DiagramCacheClearResult,
  DiagramCacheFailure,
  DiagramCacheReadRequest,
  DiagramCacheReadResult,
  DiagramCacheWriteRequest,
  DiagramCacheWriteResult
} from '../../../../shared/scryer/diagram-cache'
export {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  normalizeDiagramSourceForHash
} from '../../../../shared/scryer/diagram-cache'

export function readDiagramCache(
  request: DiagramCacheReadRequest
): Promise<DiagramCacheReadResult | DiagramCacheFailure> {
  return window.api.architecture.readDiagramCache(request)
}

export function writeDiagramCache(
  request: DiagramCacheWriteRequest
): Promise<DiagramCacheWriteResult | DiagramCacheFailure> {
  return window.api.architecture.writeDiagramCache(request)
}

export function clearDiagramCache(
  request: DiagramCacheClearRequest
): Promise<DiagramCacheClearResult | DiagramCacheFailure> {
  return window.api.architecture.clearDiagramCache(request)
}
