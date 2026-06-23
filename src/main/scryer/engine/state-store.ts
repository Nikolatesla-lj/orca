import { mkdir, open, readFile, rename, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { emptyScryModel, SCRY_VERSION, type ScryModel } from './model'
import { scryerPaths, type ScryerPaths } from './paths'
import { ScryerEngineError } from './pipeline'

export type ModelEditLease = {
  token: string
  owner?: 'agent' | 'human' | 'system'
  agentRunId?: string
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = join(dirname(filePath), `.tmp.${Date.now()}-${globalThis.crypto.randomUUID()}`)
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, filePath)
}

function parseModel(raw: string, filePath: string): ScryModel {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Failed to parse Scryer model at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  if (typeof value !== 'object' || value === null) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Scryer model at ${filePath} is not an object`
    )
  }
  const record = value as Record<string, unknown>
  const version = typeof record.version === 'string' ? record.version : ''
  if (version !== SCRY_VERSION) {
    throw new ScryerEngineError(
      'incompatible_model',
      `Model file uses schema version '${version || '<missing>'}', but this version of scryer requires '${SCRY_VERSION}'. Legacy models cannot be loaded.`,
      { path: filePath, version: version || '<missing>', requiredVersion: SCRY_VERSION }
    )
  }
  return {
    version: SCRY_VERSION,
    nodes: Array.isArray(record.nodes) ? (record.nodes as ScryModel['nodes']) : [],
    links: Array.isArray(record.links) ? (record.links as ScryModel['links']) : [],
    groups: Array.isArray(record.groups) ? (record.groups as ScryModel['groups']) : [],
    sourceMap:
      typeof record.sourceMap === 'object' && record.sourceMap !== null
        ? (record.sourceMap as ScryModel['sourceMap'])
        : {},
    boundaries:
      typeof record.boundaries === 'object' && record.boundaries !== null
        ? (record.boundaries as ScryModel['boundaries'])
        : {}
  }
}

function serializeModel(model: ScryModel): string {
  return `${JSON.stringify(model, null, 2)}\n`
}

export type ScryerStateStore = {
  paths(projectRoot: string): ScryerPaths
  readCommitted(projectRoot: string): Promise<ScryModel>
  readPlanned(projectRoot: string): Promise<ScryModel>
  readPlannedForEdit(projectRoot: string): Promise<ScryModel>
  writeCommitted(projectRoot: string, model: ScryModel): Promise<void>
  writePlanned(projectRoot: string, model: ScryModel): Promise<void>
  writeBaseline(projectRoot: string, model: ScryModel): Promise<void>
  appendHistory(projectRoot: string, event: Record<string, unknown>): Promise<void>
  readActiveLease(projectRoot: string): Promise<ModelEditLease | null>
  withWriteLock<T>(projectRoot: string, action: () => Promise<T>): Promise<T>
}

export function createScryerStateStore(): ScryerStateStore {
  async function ensureCommitted(paths: ScryerPaths): Promise<void> {
    if (existsSync(paths.modelPath)) {
      return
    }
    await atomicWrite(paths.modelPath, serializeModel(emptyScryModel()))
  }

  return {
    paths: scryerPaths,
    async readCommitted(projectRoot) {
      const paths = scryerPaths(projectRoot)
      await ensureCommitted(paths)
      return parseModel(await readFile(paths.modelPath, 'utf8'), paths.modelPath)
    },
    async readPlanned(projectRoot) {
      const paths = scryerPaths(projectRoot)
      if (!existsSync(paths.plannedPath)) {
        return this.readCommitted(projectRoot)
      }
      return parseModel(await readFile(paths.plannedPath, 'utf8'), paths.plannedPath)
    },
    async readPlannedForEdit(projectRoot) {
      const paths = scryerPaths(projectRoot)
      if (existsSync(paths.plannedPath)) {
        return parseModel(await readFile(paths.plannedPath, 'utf8'), paths.plannedPath)
      }
      return this.readCommitted(projectRoot)
    },
    async writePlanned(projectRoot, model) {
      const paths = scryerPaths(projectRoot)
      await atomicWrite(paths.plannedPath, serializeModel(model))
    },
    async writeCommitted(projectRoot, model) {
      const paths = scryerPaths(projectRoot)
      await atomicWrite(paths.modelPath, serializeModel(model))
    },
    async writeBaseline(projectRoot, model) {
      const paths = scryerPaths(projectRoot)
      await atomicWrite(paths.baselinePath, serializeModel(model))
    },
    async appendHistory(projectRoot, event) {
      const paths = scryerPaths(projectRoot)
      await mkdir(dirname(paths.historyPath), { recursive: true })
      await writeFile(paths.historyPath, `${JSON.stringify(event)}\n`, {
        encoding: 'utf8',
        flag: 'a'
      })
    },
    async readActiveLease(projectRoot) {
      const paths = scryerPaths(projectRoot)
      if (!existsSync(paths.leasePath)) {
        return null
      }
      const raw = await readFile(paths.leasePath, 'utf8')
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        throw new ScryerEngineError('lease_required', 'Scryer model edit lease is unreadable', {
          leasePath: paths.leasePath
        })
      }
      if (typeof value !== 'object' || value === null) {
        throw new ScryerEngineError('lease_required', 'Scryer model edit lease is invalid', {
          leasePath: paths.leasePath
        })
      }
      const record = value as Record<string, unknown>
      if (typeof record.token !== 'string' || record.token.length === 0) {
        throw new ScryerEngineError('lease_required', 'Scryer model edit lease has no token', {
          leasePath: paths.leasePath
        })
      }
      return {
        token: record.token,
        ...(record.owner === 'agent' || record.owner === 'human' || record.owner === 'system'
          ? { owner: record.owner }
          : {}),
        ...(typeof record.agentRunId === 'string' ? { agentRunId: record.agentRunId } : {})
      }
    },
    async withWriteLock(projectRoot, action) {
      const paths = scryerPaths(projectRoot)
      await mkdir(paths.scryerDir, { recursive: true })
      let handle: Awaited<ReturnType<typeof open>> | null = null
      try {
        handle = await open(paths.lockPath, 'wx')
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null ? (error as { code?: string }).code : ''
        if (code === 'EEXIST') {
          throw new ScryerEngineError(
            'lock_busy',
            `Scryer model lock is already held at ${paths.lockPath}`,
            { lockPath: paths.lockPath },
            true
          )
        }
        throw error
      }
      try {
        await handle.writeFile(`${process.pid}\n`, 'utf8')
        return await action()
      } finally {
        await handle.close()
        await unlink(paths.lockPath).catch(() => undefined)
      }
    }
  }
}
