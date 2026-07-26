import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createScryerEditLeaseStore } from './edit-lease-store'

describe('Scryer edit lease store', () => {
  it('requires a trusted identity before releasing an active lease', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-lease-release-'))
    const store = createScryerEditLeaseStore({
      tokens: { next: () => 'scryer-edit-release-secret' }
    })
    await store.acquire({ projectPath, owner: 'agent', agentRunId: 'run-1' })

    await expect(store.release({ projectPath })).resolves.toEqual({
      ok: false,
      reason: 'release_identity_required'
    })
    await expect(store.read({ projectPath })).resolves.toMatchObject({
      token: 'scryer-edit-release-secret',
      agentRunId: 'run-1'
    })
  })

  it('atomically replaces an expired lease during acquire', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-lease-expiry-'))
    let now = '2026-07-16T10:00:00.000Z'
    let token = 0
    const store = createScryerEditLeaseStore({
      clock: { nowIso: () => now },
      tokens: { next: () => `scryer-edit-${++token}` }
    })
    await store.acquire({
      projectPath,
      owner: 'agent',
      agentRunId: 'run-old',
      expiresAt: '2026-07-16T10:01:00.000Z'
    })
    now = '2026-07-16T10:02:00.000Z'

    await expect(
      store.acquire({ projectPath, owner: 'agent', agentRunId: 'run-new' })
    ).resolves.toMatchObject({
      ok: true,
      acquired: true,
      lease: { token: 'scryer-edit-2', agentRunId: 'run-new' }
    })
  })

  it('reconciles a crashed native agent lease without exposing its token', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-lease-reconcile-'))
    const store = createScryerEditLeaseStore({
      tokens: { next: () => 'scryer-edit-reconcile-secret' }
    })
    await store.acquire({ projectPath, owner: 'agent', agentRunId: 'run-crashed' })

    const result = await store.reconcile({
      projectPath,
      getAgentRunStatus: async () => 'crashed'
    })

    expect(result).toEqual({ reconciled: true, reason: 'inactive_agent' })
    expect(JSON.stringify(result)).not.toContain('scryer-edit-reconcile-secret')
    await expect(store.read({ projectPath })).resolves.toBeNull()
  })

  it('returns sanitized conflict status to non-owning callers', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-lease-conflict-'))
    const store = createScryerEditLeaseStore({
      tokens: { next: () => 'scryer-edit-conflict-secret' }
    })
    await store.acquire({ projectPath, owner: 'agent', agentRunId: 'run-1' })

    const result = await store.acquire({ projectPath, owner: 'human' })

    expect(result).toEqual({
      ok: false,
      reason: 'lease_conflict',
      activeLease: expect.objectContaining({ owner: 'agent', agentRunId: 'run-1' })
    })
    expect(JSON.stringify(result)).not.toContain('scryer-edit-conflict-secret')
  })
})
