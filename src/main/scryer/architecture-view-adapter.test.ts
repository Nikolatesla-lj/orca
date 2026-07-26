import { describe, expect, it, vi } from 'vitest'
import { createArchitectureViewAdapter } from './architecture-view-adapter'
import type { ScryerEngine, ScryerOperationContext } from './engine'

function context(): ScryerOperationContext {
  return {
    requestId: 'req-view',
    transport: 'ipc',
    caller: 'human',
    cwd: '/project',
    projectRoot: '/project'
  }
}

function fullReadView() {
  return {
    ok: true as const,
    operationId: 'scryer.model.read',
    requestId: 'req-read',
    result: {
      view: 'full' as const,
      layer: 'plan' as const,
      version: '0.3' as const,
      nodeCount: 1,
      linkCount: 0,
      groupCount: 0,
      model: {
        version: '0.3' as const,
        nodes: [{ id: 'api', kind: 'system' as const, name: 'API' }],
        links: [],
        groups: [],
        sourceMap: {},
        boundaries: {}
      }
    }
  }
}

describe('architecture view adapter', () => {
  it('sources diagnostics through the engine validate operation', async () => {
    const executeOperation = vi.fn(async () => ({
      ok: true,
      operationId: 'scryer.model.validate',
      requestId: 'req-validate',
      result: {
        findings: [
          {
            code: 'missing_reference',
            severity: 'warning',
            message: 'dangling',
            path: 'link:x.dst'
          }
        ],
        validationWarningCount: 1,
        validationErrorCount: 0
      }
    }))
    const engine = {
      executeOperation: executeOperation as unknown as ScryerEngine['executeOperation'],
      readView: (async () => fullReadView()) as unknown as ScryerEngine['readView']
    }

    const result = await createArchitectureViewAdapter(engine).readArchitectureView(
      { projectPath: '/project', layer: 'plan' },
      context()
    )

    expect(executeOperation).toHaveBeenCalledWith(
      'scryer.model.validate',
      { layer: 'plan' },
      expect.objectContaining({ projectRoot: '/project' })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.diagnostics).toEqual([
        { severity: 'warning', code: 'missing_reference', message: 'dangling', path: 'link:x.dst' }
      ])
    }
  })

  it('still renders with empty diagnostics when the engine cannot validate', async () => {
    const engine = {
      executeOperation: (async () => ({
        ok: false,
        operationId: 'scryer.model.validate',
        requestId: 'req-validate',
        error: { code: 'incompatible_model', message: 'no committed baseline yet' }
      })) as unknown as ScryerEngine['executeOperation'],
      readView: (async () => fullReadView()) as unknown as ScryerEngine['readView']
    }

    const result = await createArchitectureViewAdapter(engine).readArchitectureView(
      { projectPath: '/project', layer: 'plan' },
      context()
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.diagnostics).toEqual([])
      expect(result.result.nodes).toHaveLength(1)
    }
  })

  it('rejects a non-canonical read view that lacks the full-model discriminant', async () => {
    const engine = {
      executeOperation: vi.fn() as unknown as ScryerEngine['executeOperation'],
      // Legacy-shaped payload: a bare mode/fullModel alias with no `view: 'full'`.
      readView: (async () => ({
        ok: true,
        operationId: 'scryer.model.read',
        requestId: 'req-read',
        result: {
          mode: 'full',
          layer: 'plan',
          fullModel: {
            version: '0.3',
            nodes: [],
            links: [],
            groups: [],
            sourceMap: {},
            boundaries: {}
          }
        }
      })) as unknown as ScryerEngine['readView']
    }

    const result = await createArchitectureViewAdapter(engine).readArchitectureView(
      { projectPath: '/project', layer: 'plan' },
      context()
    )

    expect(result).toMatchObject({
      ok: false,
      error: { message: 'Scryer readView did not return a full model for Architecture view' }
    })
  })
})
