import { readFile } from 'node:fs/promises'
import type { C4ModelData, ScryerToolResult } from '../../shared/scryer/model-types'
import { parseModelData } from '../../shared/scryer/parse-model'
import { createScryerEngine, type ScryerOperationId } from './engine'
import { getProjectModelPath, getProjectScryerDir } from './model-store'

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

// Why: the MCP bridge only ever operates on the strict Scryer 0.3 model. It reads the
// planned layer (agent edits land there) and falls back to the committed layer, both as
// 0.3 files — never to a legacy C4 document. A project with no 0.3 model is an error, not
// a cue to synthesize or read a legacy model.
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
      // Try the next candidate.
    }
  }
  throw new Error('No Scryer 0.3 model found. Call set_model to create one first.')
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
