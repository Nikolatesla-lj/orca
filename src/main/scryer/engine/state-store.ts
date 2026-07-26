import { existsSync } from 'node:fs'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { commitScryerStatePlan } from './state-commit-writer'
import { ScryerEngineError } from './engine-error'
import { SCRY_VERSION } from './model'
import { scryerPaths } from './paths'
import { plannedSeedFromCommitted, readScryerModelFile, stateIoDetails } from './state-model-files'
import type { ScryerStateStore, StateStoreFailureInjection } from './state-store-contracts'
import type { ModelEditLease, ScryerLoadedState } from './types'

export type { ModelEditLease } from './types'
export type {
  ScryerBestEffortCommitItem,
  ScryerPrimaryCommitItem,
  ScryerStateCommitPlan,
  ScryerStateCommitResult,
  ScryerStateStore
} from './state-store-contracts'

export function createScryerStateStore(
  options: { test?: StateStoreFailureInjection } = {}
): ScryerStateStore {
  return {
    paths: scryerPaths,
    resolveProject(projectRoot) {
      return { projectRoot: resolve(projectRoot) }
    },
    async readCommitted(projectRoot) {
      const paths = scryerPaths(projectRoot)
      return readScryerModelFile(paths.modelPath, 'model')
    },
    async readPlanned(projectRoot) {
      const paths = scryerPaths(projectRoot)
      if (!existsSync(paths.plannedPath)) {
        return this.readCommitted(projectRoot)
      }
      return readScryerModelFile(paths.plannedPath, 'planned')
    },
    async readPlannedForEdit(projectRoot) {
      const paths = scryerPaths(projectRoot)
      if (existsSync(paths.plannedPath)) {
        return readScryerModelFile(paths.plannedPath, 'planned')
      }
      if (!existsSync(paths.modelPath)) {
        return {
          version: SCRY_VERSION,
          nodes: [],
          links: [],
          groups: [],
          sourceMap: {},
          boundaries: {}
        }
      }
      return plannedSeedFromCommitted(await this.readCommitted(projectRoot))
    },
    async loadDeclaredState(project, policy) {
      const loaded: ScryerLoadedState = {}
      if (policy.reads.includes('committed')) {
        loaded.committed = await this.readCommitted(project.projectRoot)
      }
      if (policy.reads.includes('committed_if_available')) {
        const paths = scryerPaths(project.projectRoot)
        if (existsSync(paths.modelPath)) {
          loaded.committed = await this.readCommitted(project.projectRoot)
        }
      }
      if (policy.reads.includes('planned')) {
        loaded.planned = policy.semanticWrites.includes('planned')
          ? await this.readPlannedForEdit(project.projectRoot)
          : await this.readPlanned(project.projectRoot)
        if (!loaded.committed && policy.reads.includes('committed')) {
          loaded.committed = await this.readCommitted(project.projectRoot)
        }
      }
      return loaded
    },
    async commit(plan) {
      const paths = scryerPaths(plan.project.projectRoot)
      return commitScryerStatePlan({
        plan,
        paths,
        failureInjection: options.test,
        readCommitted: () => this.readCommitted(plan.project.projectRoot)
      })
    },
    async readActiveLease(projectRoot): Promise<ModelEditLease | null> {
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
          policy: 'write_if_active',
          reason: 'missing_authorization'
        })
      }
      if (typeof value !== 'object' || value === null) {
        throw new ScryerEngineError('lease_required', 'Scryer model edit lease is invalid', {
          policy: 'write_if_active',
          reason: 'missing_authorization'
        })
      }
      const record = value as Record<string, unknown>
      if (typeof record.token !== 'string' || record.token.length === 0) {
        throw new ScryerEngineError('lease_required', 'Scryer model edit lease is incomplete', {
          policy: 'write_if_active',
          reason: 'missing_authorization'
        })
      }
      const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined
      const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null
      if (expiresAtMs !== null && (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())) {
        await unlink(paths.leasePath).catch(() => undefined)
        return null
      }
      return {
        token: record.token,
        ...(record.owner === 'agent' || record.owner === 'human' || record.owner === 'system'
          ? { owner: record.owner }
          : {}),
        ...(typeof record.agentRunId === 'string' ? { agentRunId: record.agentRunId } : {}),
        ...(typeof record.paneKey === 'string' ? { paneKey: record.paneKey } : {}),
        ...(typeof record.connectionId === 'string' || record.connectionId === null
          ? { connectionId: record.connectionId }
          : {}),
        ...(typeof record.sessionStartedAt === 'number'
          ? { sessionStartedAt: record.sessionStartedAt }
          : {}),
        ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
        ...(expiresAt ? { expiresAt } : {})
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
        throw new ScryerEngineError(
          'io_error',
          'Failed to acquire Scryer model lock',
          stateIoDetails('lock', 'lock', paths.lockPath, error)
        )
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
