import { readFile } from 'node:fs/promises'
import type { C4ModelData, ScryerToolResult } from '../../shared/scryer/model-types'
import { parseModelData } from '../../shared/scryer/parse-model'
import { createScryerEngine, type ScryerOperationId } from './engine'
import { getProjectModelPath, getProjectScryerDir, readModel } from './model-store'

export const defaultScryerEngine = createScryerEngine()

export function ok(content: string, data?: unknown): ScryerToolResult {
  return { ok: true, content, data }
}

export function fail(content: string, data?: unknown): ScryerToolResult {
  return { ok: false, content, data }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
}

export async function isStrictScryerModel(projectPath: string): Promise<boolean> {
  const candidates = [
    `${getProjectScryerDir(projectPath)}/planned.scry`,
    getProjectModelPath(projectPath)
  ]
  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(await readFile(candidate, 'utf8')) as unknown
      if (isRecord(raw) && raw.version === '0.3') {
        return true
      }
    } catch {
      // Try the next candidate.
    }
  }
  return false
}

export async function readMcpCompatibleModel(projectPath: string): Promise<C4ModelData> {
  const candidates = [
    `${getProjectScryerDir(projectPath)}/planned.scry`,
    getProjectModelPath(projectPath)
  ]
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, 'utf8')
      const data = JSON.parse(raw) as unknown
      if (isRecord(data) && data.version === '0.3') {
        return { ...parseModelData(raw), projectPath }
      }
    } catch {
      // Fall through to the next candidate, then legacy model storage.
    }
  }
  return readModel(projectPath)
}

export function scryerOperationContext(projectPath: string, requestId: string) {
  return {
    requestId,
    transport: 'agent' as const,
    caller: 'agent' as const,
    cwd: projectPath,
    projectRoot: projectPath
  }
}

export async function executeStrictScryerOperation(
  projectPath: string,
  operationId: ScryerOperationId,
  input: Record<string, unknown>,
  content: string
): Promise<ScryerToolResult> {
  const result = await defaultScryerEngine.executeOperation(
    operationId,
    input,
    scryerOperationContext(projectPath, `mcp-${operationId.replaceAll('.', '-')}-${Date.now()}`)
  )
  if (!result.ok) {
    return fail(result.error.message, result.error)
  }
  return ok(content, result.result)
}
