import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ScryerEngineError } from './engine-error'
import { SCRY_VERSION, type ScryModel } from './model'
import { scryModelSchema } from './model-schemas'

export function serializeScryerModel(model: ScryModel): string {
  return `${JSON.stringify(model, null, 2)}\n`
}

export function stateIoDetails(
  target: string,
  operation: 'read' | 'write' | 'rename' | 'mkdir' | 'append' | 'lock',
  path: string,
  error?: unknown
): Record<string, unknown> {
  return {
    target,
    operation,
    path,
    ...(error ? { cause: error instanceof Error ? error.message : String(error) } : {})
  }
}

function formatZodPath(path: unknown[], key?: string): string {
  const base = path
    .map((part) => (typeof part === 'number' ? `[${part}]` : String(part)))
    .join('.')
    .replaceAll('.[', '[')
  return key ? (base ? `${base}.${key}` : key) : base || 'input'
}

function fieldErrorsFromZod(error: {
  issues?: unknown
}): { path: string; message: string; code?: string }[] {
  const issues = Array.isArray(error.issues)
    ? (error.issues as { path?: unknown[]; message?: string; code?: string; keys?: string[] }[])
    : []
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      return issue.keys.map((key) => ({
        path: formatZodPath(issue.path ?? [], key),
        message: issue.message ?? 'Unrecognized key',
        code: issue.code
      }))
    }
    return [
      {
        path: formatZodPath(issue.path ?? []),
        message: issue.message ?? 'Invalid value',
        ...(issue.code ? { code: issue.code } : {})
      }
    ]
  })
}

function hasUnrecognizedKeys(error: { issues?: unknown }): boolean {
  return Array.isArray(error.issues)
    ? (error.issues as { code?: string }[]).some((issue) => issue.code === 'unrecognized_keys')
    : false
}

function parseModel(raw: string, filePath: string): ScryModel {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Failed to parse Scryer model at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { path: filePath, expectedVersion: SCRY_VERSION, reason: 'invalid_json' }
    )
  }
  if (typeof value !== 'object' || value === null) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Scryer model at ${filePath} is not an object`,
      { path: filePath, expectedVersion: SCRY_VERSION, reason: 'invalid_json' }
    )
  }
  const record = value as Record<string, unknown>
  const version = typeof record.version === 'string' ? record.version : undefined
  if (version !== SCRY_VERSION) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Model file uses schema version '${version ?? '<missing>'}', but this engine requires '${SCRY_VERSION}'.`,
      {
        path: filePath,
        expectedVersion: SCRY_VERSION,
        actualVersion: version,
        reason: version ? 'unsupported_version' : 'missing_version'
      }
    )
  }
  const parsed = scryModelSchema.safeParse(record)
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromZod(parsed.error)
    throw new ScryerEngineError(
      'incompatible_model',
      `Scryer model at ${filePath} failed schema validation`,
      {
        path: filePath,
        expectedVersion: SCRY_VERSION,
        reason: hasUnrecognizedKeys(parsed.error) ? 'unknown_fields' : 'invalid_schema',
        fields: fieldErrors.map((error) => error.path)
      },
      false,
      fieldErrors
    )
  }
  return parsed.data
}

export function plannedSeedFromCommitted(committed: ScryModel): ScryModel {
  return {
    ...JSON.parse(JSON.stringify(committed)),
    sourceMap: {},
    boundaries: {}
  } as ScryModel
}

export async function atomicWriteStateFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(
    dirname(filePath),
    `.tmp.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)
}

export async function readOptionalStateFile(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, 'utf8') : null
}

export async function restoreStateFile(path: string, raw: string | null): Promise<void> {
  if (raw === null) {
    await rm(path, { force: true })
    return
  }
  await atomicWriteStateFile(path, raw)
}

export async function readScryerModelFile(
  path: string,
  target: 'model' | 'planned'
): Promise<ScryModel> {
  if (!existsSync(path)) {
    throw new ScryerEngineError('incompatible_model', `Missing Scryer ${target} file at ${path}`, {
      path,
      expectedVersion: SCRY_VERSION,
      reason: 'invalid_json'
    })
  }
  try {
    return parseModel(await readFile(path, 'utf8'), path)
  } catch (error) {
    if (error instanceof ScryerEngineError) {
      throw error
    }
    throw new ScryerEngineError(
      'io_error',
      `Failed to read Scryer ${target} file`,
      stateIoDetails(target, 'read', path, error)
    )
  }
}
