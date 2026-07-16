import type { DriftReport } from '../../shared/scryer/model-types'
import type { ScryerEngine, ScryerOperationContext } from './engine'

// Why: the renderer's drift UI consumes the legacy DriftReport shape. This adapts the
// cataloged Engine drift result into that shape at the product seam so no caller reaches
// for the legacy checkDrift reader/validator.
export function driftReportFromEngineResult(result: unknown): DriftReport | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const record = result as {
    clean?: unknown
    scopes?: Record<string, unknown>[]
  }
  if (!Array.isArray(record.scopes)) {
    return null
  }
  return {
    nodes: record.scopes.map((scope) => ({
      nodeId: String(scope.nodeId),
      nodeName: typeof scope.nodeName === 'string' ? scope.nodeName : '',
      patterns:
        typeof scope.path === 'string'
          ? [scope.path]
          : Array.isArray(scope.changedFiles)
            ? scope.changedFiles.filter((item): item is string => typeof item === 'string')
            : []
    })),
    structureChanged: record.clean === false && record.scopes.length === 0
  }
}

export async function readDriftReport(
  engine: ScryerEngine,
  context: ScryerOperationContext
): Promise<DriftReport> {
  const result = await engine.executeOperation('scryer.drift.get', {}, context)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return driftReportFromEngineResult(result.result) ?? { nodes: [], structureChanged: false }
}
