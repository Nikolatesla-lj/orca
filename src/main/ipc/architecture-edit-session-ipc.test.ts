import { describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (_event: unknown, args: unknown) => Promise<unknown>>()
const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock }
}))

import {
  defaultArchitectureDeps,
  registerArchitectureHandlers,
  type ArchitectureIpcRegistrar
} from './architecture'
import type { ScryerEditSessionController } from '../scryer/edit-session-controller'

function registrar(): ArchitectureIpcRegistrar {
  handlers.clear()
  return {
    handle: (channel, handler) => {
      handlers.set(channel, handler as (_event: unknown, args: unknown) => Promise<unknown>)
    }
  }
}

async function captureError(action: () => unknown): Promise<Error> {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    throw error
  }
  throw new Error('Expected action to fail')
}

describe('Architecture edit-session IPC handlers', () => {
  it('routes edit-session IPC channels through ScryerEditSessionController', async () => {
    const projectPath = '/repo'
    const sender = { send: vi.fn() }
    const controller: ScryerEditSessionController = {
      beginAgentEditSession: vi.fn(async () => ({
        projectPath,
        agentRunId: 'run-1'
      })),
      completeAgentEditSession: vi.fn(async () => ({
        ok: true,
        foldAllowed: false,
        autoFoldAllowed: false,
        outcome: 'folded' as const,
        leaseDisposition: 'released_after_completion' as const,
        nextAction: 'nothing_to_fold' as const,
        pending: {
          total: 0,
          foldable: true,
          byKind: {},
          byChange: {},
          changes: [],
          blockers: [],
          risks: []
        },
        validation: { blockingCount: 0, warningCount: 0, findings: [] },
        lease: { active: true, blocked: false, owner: 'agent' as const, agentRunId: 'run-1' }
      })),
      cancelAgentEditSession: vi.fn(async () => undefined),
      readEditSession: vi.fn(async () => ({
        projectPath,
        activeLease: { owner: 'agent' as const, agentRunId: 'run-1' }
      }))
    }
    const finishSync = vi.fn(defaultArchitectureDeps.finishSync)
    const recordSyncCompletionGate = vi.fn()
    registerArchitectureHandlers(registrar(), {
      ...defaultArchitectureDeps,
      finishSync,
      recordSyncCompletionGate,
      scryerEditSessionController: controller
    })

    await expect(
      handlers.get('architecture:beginEditSession')!(null, { projectPath, agentRunId: 'run-1' })
    ).resolves.toEqual({ projectPath, agentRunId: 'run-1' })
    await expect(
      handlers.get('architecture:completeEditSession')!(
        { sender },
        { projectPath, agentRunId: 'run-1', foldPolicy: 'when_gate_passes' }
      )
    ).resolves.toMatchObject({ outcome: 'folded', nextAction: 'nothing_to_fold' })
    await expect(
      handlers.get('architecture:readEditSession')!(null, { projectPath })
    ).resolves.toMatchObject({ activeLease: { owner: 'agent', agentRunId: 'run-1' } })
    await expect(
      handlers.get('architecture:readEditSession')!(null, { projectPath })
    ).resolves.not.toHaveProperty('activeLease.token')
    await handlers.get('architecture:cancelEditSession')!(null, {
      projectPath,
      agentRunId: 'run-1'
    })

    expect(controller.beginAgentEditSession).toHaveBeenCalledWith({
      projectPath,
      agentRunId: 'run-1'
    })
    expect(controller.completeAgentEditSession).toHaveBeenCalledWith({
      projectPath,
      agentRunId: 'run-1',
      foldPolicy: 'when_gate_passes'
    })
    expect(controller.cancelAgentEditSession).toHaveBeenCalledWith({
      projectPath,
      agentRunId: 'run-1'
    })
    expect(finishSync).not.toHaveBeenCalled()
    expect(recordSyncCompletionGate).toHaveBeenCalledWith(
      projectPath,
      expect.objectContaining({ outcome: 'folded', leaseDisposition: 'released_after_completion' })
    )
    expect(sender.send).toHaveBeenCalledWith('architecture:modelChanged', {
      projectPath,
      fileName: 'model.scry'
    })
  })

  it('surfaces the recorded completion gate on readEditSession so remount can re-derive attention', async () => {
    const projectPath = '/repo'
    const attentionGate = {
      ok: false,
      foldAllowed: false,
      autoFoldAllowed: false,
      outcome: 'needs_attention' as const,
      leaseDisposition: 'retained' as const,
      nextAction: 'manual_review' as const,
      pending: {
        total: 1,
        foldable: false,
        byKind: { node: 1 },
        byChange: { deleted: 1 },
        changes: [],
        blockers: [],
        risks: []
      },
      validation: { blockingCount: 0, warningCount: 0, findings: [] },
      lease: { active: true, blocked: false, owner: 'agent' as const, agentRunId: 'run-1' }
    }
    const controller: ScryerEditSessionController = {
      beginAgentEditSession: vi.fn(),
      completeAgentEditSession: vi.fn(),
      cancelAgentEditSession: vi.fn(),
      readEditSession: vi.fn(async () => ({
        projectPath,
        activeLease: { owner: 'agent' as const, agentRunId: 'run-1' }
      }))
    }
    const readSyncCompletionGate = vi.fn(() => attentionGate)
    registerArchitectureHandlers(registrar(), {
      ...defaultArchitectureDeps,
      readSyncCompletionGate,
      scryerEditSessionController: controller
    })

    const status = (await handlers.get('architecture:readEditSession')!(null, { projectPath })) as {
      completionGate: { nextAction: string } | null
      activeLease: unknown
    }
    expect(readSyncCompletionGate).toHaveBeenCalledWith(projectPath)
    expect(status.completionGate).toEqual(attentionGate)
    expect(status).not.toHaveProperty('activeLease.token')
  })

  it('rejects authorization, unknown fields, and missing identity before controller dispatch', async () => {
    const controller: ScryerEditSessionController = {
      beginAgentEditSession: vi.fn(),
      completeAgentEditSession: vi.fn(),
      cancelAgentEditSession: vi.fn(),
      readEditSession: vi.fn()
    }
    registerArchitectureHandlers(registrar(), {
      ...defaultArchitectureDeps,
      scryerEditSessionController: controller
    })
    const validRequests = {
      'architecture:beginEditSession': { projectPath: '/repo', agentRunId: 'run-1' },
      'architecture:completeEditSession': { projectPath: '/repo', agentRunId: 'run-1' },
      'architecture:cancelEditSession': { projectPath: '/repo', agentRunId: 'run-1' },
      'architecture:readEditSession': { projectPath: '/repo' }
    } as const
    const authorizationFields = [
      'leaseToken',
      'token',
      'leaseId',
      'activeLeaseId',
      'authorization'
    ] as const

    for (const [channel, validRequest] of Object.entries(validRequests)) {
      for (const field of authorizationFields) {
        const secret = `must-not-leak-${channel}-${field}`
        const error = await captureError(() =>
          handlers.get(channel)!(null, { ...validRequest, [field]: secret })
        )

        expect(error.message).toContain(`forbidden authorization field '${field}'`)
        expect(error.message).not.toContain(secret)
      }

      const unknownValue = `must-not-leak-${channel}-unknown`
      const error = await captureError(() =>
        handlers.get(channel)!(null, { ...validRequest, unexpected: unknownValue })
      )
      expect(error.message).toContain("unknown field 'unexpected'")
      expect(error.message).not.toContain(unknownValue)
    }

    const invalidIdentityRequests = [
      ['architecture:beginEditSession', { projectPath: '/repo' }],
      ['architecture:beginEditSession', { projectPath: '/repo', agentRunId: '   ' }],
      ['architecture:completeEditSession', { projectPath: '/repo' }],
      ['architecture:cancelEditSession', { projectPath: '/repo' }],
      ['architecture:readEditSession', {}],
      ['architecture:readEditSession', { projectPath: '   ' }]
    ] as const
    for (const [channel, request] of invalidIdentityRequests) {
      const error = await captureError(() => handlers.get(channel)!(null, request))
      expect(error.message).toContain('invalid request field')
    }

    expect(controller.beginAgentEditSession).not.toHaveBeenCalled()
    expect(controller.completeAgentEditSession).not.toHaveBeenCalled()
    expect(controller.cancelAgentEditSession).not.toHaveBeenCalled()
    expect(controller.readEditSession).not.toHaveBeenCalled()
  })

  it('does not register the retired default raw-document mutation channels', () => {
    registerArchitectureHandlers(registrar(), { ...defaultArchitectureDeps })

    expect(handlers.get('architecture:writeModel')).toBeUndefined()
    expect(handlers.get('architecture:writeModelDocument')).toBeUndefined()
    expect(handlers.get('architecture:patchNodeData')).toBeUndefined()
  })
})
