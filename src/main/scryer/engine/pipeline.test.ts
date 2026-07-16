import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultScryerOperationCatalog } from './catalog'
import { createScryerEngine, createScryerStateStore } from './index'
import type { ScryerOperationContext } from './types'

function context(projectPath: string, requestId = 'req-pipeline'): ScryerOperationContext {
  return {
    requestId,
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath
  }
}

async function writeModel(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    join(projectPath, '.scryer', 'model.scry'),
    JSON.stringify(
      {
        version: '0.3',
        nodes: [{ id: 'api', kind: 'system', name: 'API' }],
        links: [],
        groups: [],
        sourceMap: {},
        boundaries: {}
      },
      null,
      2
    ),
    'utf8'
  )
}

describe('Scryer operation pipeline', () => {
  it('returns operation_not_found through the shared envelope', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-unknown-'))
    const result = await createScryerEngine().executeOperation(
      'scryer.nope',
      {},
      context(projectPath)
    )

    expect(result).toMatchObject({
      ok: false,
      operationId: 'scryer.nope',
      error: { code: 'operation_not_found', details: { operationId: 'scryer.nope' } }
    })
  })

  it('returns invalid_input with structured field errors before loading state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-input-'))
    const result = await createScryerEngine().executeOperation(
      'scryer.node.update',
      { nodes: [] },
      context(projectPath)
    )

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_input',
        fieldErrors: [expect.objectContaining({ path: 'nodes' })]
      }
    })
  })

  it('maps malformed success payloads to internal_error', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-success-'))
    await writeModel(projectPath)
    const catalog = createDefaultScryerOperationCatalog()
    catalog.getOperationContract('scryer.model.validate')!.execute = () => ({
      ok: true,
      outcome: { result: { invalid: true } }
    })

    const result = await createScryerEngine({ catalog }).executeOperation(
      'scryer.model.validate',
      {},
      context(projectPath)
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'internal_error', details: { reason: 'success_schema_failed' } }
    })
  })

  it('maps undeclared operation errors and malformed details to internal_error', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-error-'))
    await writeModel(projectPath)
    const catalog = createDefaultScryerOperationCatalog()
    catalog.getOperationContract('scryer.model.validate')!.execute = () => ({
      ok: false,
      failure: { code: 'not_found', message: 'undeclared', details: { entity: 'node', id: 'x' } }
    })

    const undeclared = await createScryerEngine({ catalog }).executeOperation(
      'scryer.model.validate',
      {},
      context(projectPath)
    )
    expect(undeclared).toMatchObject({
      ok: false,
      error: { code: 'internal_error', details: { reason: 'undeclared_error_code' } }
    })

    const malformedCatalog = createDefaultScryerOperationCatalog()
    malformedCatalog.getOperationContract('scryer.link.add')!.execute = () => ({
      ok: false,
      failure: { code: 'illegal_link', message: 'bad details', details: { reason: 'self_link' } }
    })
    const malformed = await createScryerEngine({ catalog: malformedCatalog }).executeOperation(
      'scryer.link.add',
      { links: [{ src: 'api', dst: 'api', label: 'self' }] },
      context(projectPath, 'req-malformed')
    )
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'internal_error', details: { reason: 'error_details_schema_failed' } }
    })
  })

  it('fails a malformed executor warning before the first semantic write', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-warn-'))
    await writeModel(projectPath)
    const catalog = createDefaultScryerOperationCatalog()
    const contract = catalog.getOperationContract('scryer.node.update')!
    const original = contract.execute
    contract.execute = async (args) => {
      const base = await original(args)
      if (!base.ok) {
        return base
      }
      return {
        ok: true,
        outcome: {
          ...base.outcome,
          meta: { ...base.outcome.meta, warnings: [{ code: 'not_a_real_warning_code' } as never] }
        }
      }
    }

    const result = await createScryerEngine({ catalog }).executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Renamed API' }] },
      context(projectPath, 'req-warn')
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'internal_error', details: { reason: 'malformed_warning' } }
    })
    // No planned write leaked despite the executor having produced changes.
    expect(existsSync(join(projectPath, '.scryer', 'planned.scry'))).toBe(false)
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes[0].name).toBe('API')
  })

  it('leaves committed and planned untouched when the final snapshot is invalid', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-snapshot-'))
    await writeModel(projectPath)
    const catalog = createDefaultScryerOperationCatalog()
    const contract = catalog.getOperationContract('scryer.node.update')!
    const original = contract.execute
    contract.execute = async (args) => {
      const base = await original(args)
      if (!base.ok) {
        return base
      }
      // Structurally broken planned snapshot: missing required arrays.
      return {
        ok: true,
        outcome: { ...base.outcome, changes: { planned: { version: '0.3', nodes: [] } as never } }
      }
    }

    const result = await createScryerEngine({ catalog }).executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Broken API' }] },
      context(projectPath, 'req-snapshot')
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'internal_error', details: { reason: 'invalid_final_snapshot' } }
    })
    expect(existsSync(join(projectPath, '.scryer', 'planned.scry'))).toBe(false)
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes[0].name).toBe('API')
  })

  it('surfaces a commit IO failure as an error without a partial or legacy write', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-io-'))
    await writeModel(projectPath)
    const stateStore = createScryerStateStore({ test: { failPrimaryTarget: 'planned' } })

    const result = await createScryerEngine({ stateStore }).executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Renamed API' }] },
      context(projectPath, 'req-io')
    )

    expect(result).toMatchObject({ ok: false, error: { code: 'io_error' } })
    // The engine surfaces the failure; it never falls back to a legacy writer.
    expect(existsSync(join(projectPath, '.scryer', 'planned.scry'))).toBe(false)
    const committed = JSON.parse(await readFile(join(projectPath, '.scryer', 'model.scry'), 'utf8'))
    expect(committed.nodes[0].name).toBe('API')
  })

  it('resolves branched policy before execution', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-branch-'))
    await writeModel(projectPath)
    await writeFile(
      join(projectPath, '.scryer', 'planned.scry'),
      JSON.stringify({
        version: '0.3',
        nodes: [{ id: 'api', kind: 'system', name: 'Public API' }],
        links: [],
        groups: [],
        sourceMap: {},
        boundaries: {}
      }),
      'utf8'
    )

    const result = await createScryerEngine().executeOperation(
      'scryer.plan.fold',
      { mode: 'agent_completion', node_id: 'api' },
      context(projectPath)
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'agent_run_required' }
    })
  })

  it('evaluates lease authorization while the semantic write lock is held', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-lock-'))
    await writeModel(projectPath)
    const baseStore = createScryerStateStore()
    let lockHeld = false
    let leaseReadObserved = false
    const stateStore = {
      ...baseStore,
      async readActiveLease(root: string) {
        expect(root).toBe(projectPath)
        expect(lockHeld).toBe(true)
        leaseReadObserved = true
        return null
      },
      async withWriteLock<T>(root: string, action: () => Promise<T>): Promise<T> {
        expect(root).toBe(projectPath)
        lockHeld = true
        try {
          return await action()
        } finally {
          lockHeld = false
        }
      }
    }

    const result = await createScryerEngine({ stateStore }).executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Locked API' }] },
      context(projectPath, 'req-lock')
    )

    expect(result).toMatchObject({ ok: true })
    expect(leaseReadObserved).toBe(true)
  })

  it('redacts lease credentials and credential aliases from public errors', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-redaction-'))
    await writeModel(projectPath)
    await writeFile(
      join(projectPath, '.scryer', '.model-edit-lease.json'),
      JSON.stringify({
        token: 'scryer-edit-super-secret',
        owner: 'agent',
        agentRunId: 'run-1'
      }),
      'utf8'
    )

    const result = await createScryerEngine().executeOperation(
      'scryer.node.update',
      { nodes: [{ node_id: 'api', name: 'Blocked API' }] },
      context(projectPath, 'req-redaction')
    )
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'lease_required',
        details: {
          policy: 'write_if_active',
          reason: 'missing_authorization',
          owner: 'agent'
        },
        retryable: true
      }
    })
    expect(serialized).not.toContain('scryer-edit-super-secret')
    expect(serialized).not.toContain('activeLeaseId')
    expect(serialized).not.toContain('leaseId')
    expect(serialized).not.toContain('leaseToken')
  })

  it('does not echo a credential from an unexpected exception message', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-pipeline-exception-'))
    await writeModel(projectPath)
    const catalog = createDefaultScryerOperationCatalog()
    catalog.getOperationContract('scryer.model.validate')!.execute = () => {
      throw new Error('unexpected scryer-edit-context-secret')
    }

    const result = await createScryerEngine({ catalog }).executeOperation(
      'scryer.model.validate',
      {},
      { ...context(projectPath, 'req-exception'), leaseToken: 'scryer-edit-context-secret' }
    )

    expect(JSON.stringify(result)).not.toContain('scryer-edit-context-secret')
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected Scryer engine error' }
    })
  })
})
