import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModelEditLease } from './engine'
import { scryerPaths } from './engine/paths'
import { createScryerStateStore } from './engine/state-store'

export type ScryerEditLease = ModelEditLease

export type ScryerEditLeaseStatus = Omit<ScryerEditLease, 'token'>

export type AcquireScryerEditLeaseInput = {
  projectPath: string
  owner: NonNullable<ModelEditLease['owner']>
  agentRunId?: string
  paneKey?: string
  connectionId?: string | null
  sessionStartedAt?: number
  token?: string
  expiresAt?: string
}

export type AcquireScryerEditLeaseResult =
  | {
      ok: true
      acquired: boolean
      lease: ScryerEditLease
    }
  | {
      ok: false
      reason: 'lease_conflict'
      activeLease: ScryerEditLeaseStatus
    }

export type ReadScryerEditLeaseInput = {
  projectPath: string
}

export type ReleaseScryerEditLeaseInput = {
  projectPath: string
  token?: string
  agentRunId?: string
}

export type ReleaseScryerEditLeaseResult =
  | {
      ok: true
      released: boolean
    }
  | {
      ok: false
      reason: 'release_identity_required'
    }
  | {
      ok: false
      reason: 'lease_mismatch'
      activeLease: ScryerEditLeaseStatus
    }

export type ScryerEditLeaseRunStatus = 'running' | 'done' | 'cancelled' | 'crashed'

export type ReconcileScryerEditLeaseInput = {
  projectPath: string
  getAgentRunStatus(agentRunId: string): Promise<ScryerEditLeaseRunStatus>
}

export type ReconcileScryerEditLeaseResult = {
  reconciled: boolean
  reason?: 'expired' | 'inactive_agent'
}

export type ScryerEditLeaseStore = {
  acquire(input: AcquireScryerEditLeaseInput): Promise<AcquireScryerEditLeaseResult>
  read(input: ReadScryerEditLeaseInput): Promise<ScryerEditLease | null>
  release(input: ReleaseScryerEditLeaseInput): Promise<ReleaseScryerEditLeaseResult>
  reconcile(input: ReconcileScryerEditLeaseInput): Promise<ReconcileScryerEditLeaseResult>
}

export type CreateScryerEditLeaseStoreOptions = {
  clock?: {
    nowIso(): string
  }
  tokens?: {
    next(): string
  }
  withProjectLock?: <T>(projectPath: string, action: () => Promise<T>) => Promise<T>
}

function defaultClock() {
  return {
    nowIso() {
      return new Date().toISOString()
    }
  }
}

function defaultTokens() {
  return {
    next() {
      return `scryer-edit-${randomUUID()}`
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function parseLease(raw: string, path: string): ScryerEditLease {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Failed to parse Scryer edit lease at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Scryer edit lease at ${path} is not an object`)
  }
  const record = value as Record<string, unknown>
  if (typeof record.token !== 'string' || record.token.length === 0) {
    throw new Error(`Scryer edit lease at ${path} has no credential`)
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
    ...(typeof record.expiresAt === 'string' ? { expiresAt: record.expiresAt } : {})
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = join(
    dirname(path),
    `.tmp.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmpPath, path)
}

function matchesLeaseIntent(active: ScryerEditLease, input: AcquireScryerEditLeaseInput): boolean {
  if (input.token && active.token === input.token) {
    return true
  }
  return Boolean(
    input.agentRunId && active.agentRunId === input.agentRunId && active.owner === input.owner
  )
}

function matchesReleaseIdentity(
  active: ScryerEditLease,
  input: ReleaseScryerEditLeaseInput
): boolean {
  if (!input.token && !input.agentRunId) {
    return false
  }
  if (input.token && active.token !== input.token) {
    return false
  }
  if (input.agentRunId && active.agentRunId !== input.agentRunId) {
    return false
  }
  return true
}

function leaseStatus(lease: ScryerEditLease): ScryerEditLeaseStatus {
  const { token: _token, ...status } = lease
  return status
}

function leaseExpired(lease: ScryerEditLease, nowIso: string): boolean {
  if (!lease.expiresAt) {
    return false
  }
  const expiresAt = Date.parse(lease.expiresAt)
  const now = Date.parse(nowIso)
  return !Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now
}

export function createScryerEditLeaseStore(
  options: CreateScryerEditLeaseStoreOptions = {}
): ScryerEditLeaseStore {
  const clock = options.clock ?? defaultClock()
  const tokens = options.tokens ?? defaultTokens()
  const stateStore = createScryerStateStore()
  const withProjectLock =
    options.withProjectLock ??
    (<T>(projectPath: string, action: () => Promise<T>) =>
      stateStore.withWriteLock(projectPath, action))

  async function readLeaseFile(projectPath: string): Promise<ScryerEditLease | null> {
    const path = scryerPaths(projectPath).leasePath
    try {
      return parseLease(await readFile(path, 'utf8'), path)
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }

  async function readActiveLease(projectPath: string): Promise<{
    lease: ScryerEditLease | null
    expired: boolean
  }> {
    const lease = await readLeaseFile(projectPath)
    if (!lease || !leaseExpired(lease, clock.nowIso())) {
      return { lease, expired: false }
    }
    await rm(scryerPaths(projectPath).leasePath, { force: true })
    return { lease: null, expired: true }
  }

  return {
    async acquire(input) {
      return withProjectLock(input.projectPath, async () => {
        const { lease: activeLease } = await readActiveLease(input.projectPath)
        if (activeLease) {
          return matchesLeaseIntent(activeLease, input)
            ? { ok: true, acquired: false, lease: activeLease }
            : {
                ok: false,
                reason: 'lease_conflict',
                activeLease: leaseStatus(activeLease)
              }
        }
        const lease: ScryerEditLease = {
          token: input.token ?? tokens.next(),
          owner: input.owner,
          ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
          ...(input.paneKey ? { paneKey: input.paneKey } : {}),
          ...(input.connectionId !== undefined ? { connectionId: input.connectionId } : {}),
          ...(input.sessionStartedAt !== undefined
            ? { sessionStartedAt: input.sessionStartedAt }
            : {}),
          createdAt: clock.nowIso(),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
        }
        await atomicWriteJson(scryerPaths(input.projectPath).leasePath, lease)
        return { ok: true, acquired: true, lease }
      })
    },
    async read(input) {
      return withProjectLock(
        input.projectPath,
        async () => (await readActiveLease(input.projectPath)).lease
      )
    },
    async release(input) {
      if (!input.token && !input.agentRunId) {
        return { ok: false, reason: 'release_identity_required' }
      }
      return withProjectLock(input.projectPath, async () => {
        const { lease: activeLease } = await readActiveLease(input.projectPath)
        if (!activeLease) {
          return { ok: true, released: false }
        }
        if (!matchesReleaseIdentity(activeLease, input)) {
          return {
            ok: false,
            reason: 'lease_mismatch',
            activeLease: leaseStatus(activeLease)
          }
        }
        await rm(scryerPaths(input.projectPath).leasePath, { force: true })
        return { ok: true, released: true }
      })
    },
    async reconcile(input) {
      return withProjectLock(input.projectPath, async () => {
        const { lease: activeLease, expired } = await readActiveLease(input.projectPath)
        if (expired) {
          return { reconciled: true, reason: 'expired' }
        }
        if (!activeLease?.agentRunId || activeLease.owner !== 'agent') {
          return { reconciled: false }
        }
        const status = await input.getAgentRunStatus(activeLease.agentRunId)
        if (status !== 'cancelled' && status !== 'crashed') {
          return { reconciled: false }
        }
        await rm(scryerPaths(input.projectPath).leasePath, { force: true })
        return { reconciled: true, reason: 'inactive_agent' }
      })
    }
  }
}
