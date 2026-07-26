import { readFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getProjectModelPath, getProjectScryerDir } from './model-store'
import { callScryerTool } from './mcp-tools'

type Model03 = {
  version: '0.3'
  nodes: Record<string, unknown>[]
  links: Record<string, unknown>[]
  groups: Record<string, unknown>[]
  sourceMap: Record<string, unknown>
  boundaries: Record<string, unknown>
}

function model03(overrides: Partial<Model03> = {}): Model03 {
  return {
    version: '0.3',
    nodes: [],
    links: [],
    groups: [],
    sourceMap: {},
    boundaries: {},
    ...overrides
  }
}

async function setModel(projectPath: string, model: Model03) {
  return callScryerTool(projectPath, {
    toolName: 'set_model',
    arguments: { data: JSON.stringify(model) }
  })
}

async function readCommitted(projectPath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8'))
}

async function readPlanned(projectPath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(getProjectScryerDir(projectPath), 'planned.scry'), 'utf8'))
}

describe('callScryerTool strict retirement', () => {
  it('writes set_model to the strict 0.3 committed and planned layers, never a legacy C4 document', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-set-'))
    const result = await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop', description: 'Commerce system' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system', description: 'HTTP API' }
        ]
      })
    )

    expect(result.ok, JSON.stringify(result)).toBe(true)
    const committed = await readCommitted(projectPath)
    const planned = await readPlanned(projectPath)
    expect(committed.version).toBe('0.3')
    expect(planned.version).toBe('0.3')
    // Strict 0.3 nodes carry no legacy C4 `data`/`type` envelope.
    for (const node of committed.nodes as Record<string, unknown>[]) {
      expect(node.data).toBeUndefined()
      expect(node.type).toBeUndefined()
      expect(node.kind).toBeDefined()
    }
  })

  it('rejects set_model data that is not a strict 0.3 model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-set-legacy-'))
    const result = await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [{ id: 'system', data: { name: 'Shop', kind: 'system' } }],
          edges: []
        })
      }
    })

    expect(result.ok).toBe(false)
  })

  it('reflects planned edits through get_model and get_node while the committed layer lags', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-reads-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
          { id: 'handler', kind: 'component', name: 'Handler', parentId: 'api' }
        ],
        links: [{ id: 'edge-handler-api', src: 'handler', dst: 'api', label: 'serves' }]
      })
    )

    const update = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: { nodes: [{ node_id: 'handler', description: 'Owns HTTP routes' }] }
    })
    expect(update.ok, JSON.stringify(update)).toBe(true)

    // get_model / get_node read the planned layer, so the edit is visible even though
    // the committed layer is unchanged.
    const getModel = await callScryerTool(projectPath, { toolName: 'get_model', arguments: {} })
    expect(getModel.ok).toBe(true)
    expect(getModel.content).toContain('Owns HTTP routes')

    const node = await callScryerTool(projectPath, {
      toolName: 'get_node',
      arguments: { node_id: 'api' }
    })
    expect(node.ok).toBe(true)
    expect(node.content).toContain('"descendants"')
    expect(node.content).toContain('Handler')

    const committed = await readCommitted(projectPath)
    expect(
      (committed.nodes as { id: string; description?: string }[]).find((n) => n.id === 'handler')
        ?.description
    ).toBeUndefined()
  })

  it('tracks get_changes against the baseline captured by get_model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-changes-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
          { id: 'handler', kind: 'component', name: 'Handler', parentId: 'api' }
        ]
      })
    )

    // get_model establishes the change-tracking baseline. No further baseline-writing
    // read runs before get_changes, so the diff reflects only the update below.
    const baseline = await callScryerTool(projectPath, { toolName: 'get_model', arguments: {} })
    expect(baseline.ok).toBe(true)

    const update = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: { nodes: [{ node_id: 'handler', name: 'HTTP Handler' }] }
    })
    expect(update.ok, JSON.stringify(update)).toBe(true)

    const changes = await callScryerTool(projectPath, { toolName: 'get_changes', arguments: {} })
    expect(changes.ok).toBe(true)
    expect(changes.content).toContain('Nodes modified')
    expect(changes.content).toContain('HTTP Handler')
  })

  it('validates through the engine and surfaces MCP mention warnings', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-mention-edge-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop', description: 'Commerce system' },
          {
            id: 'api',
            kind: 'container',
            name: 'API',
            parentId: 'system',
            description: 'Calls @[Worker]'
          },
          {
            id: 'worker',
            kind: 'container',
            name: 'Worker',
            parentId: 'system',
            description: 'Background jobs'
          }
        ]
      })
    )

    const invalid = await callScryerTool(projectPath, { toolName: 'validate_model', arguments: {} })
    expect(invalid.ok).toBe(false)
    expect(invalid.content).toContain('API mentions Worker')

    const fixed = await callScryerTool(projectPath, {
      toolName: 'add_edges',
      arguments: { edges: [{ source: 'api', target: 'worker', label: 'calls' }] }
    })
    expect(fixed.ok, JSON.stringify(fixed)).toBe(true)

    const valid = await callScryerTool(projectPath, { toolName: 'validate_model', arguments: {} })
    expect(valid.ok, JSON.stringify(valid)).toBe(true)
  })

  it('flags a mention with no matching sibling through validate_model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-mention-missing-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop', description: 'Commerce system' },
          {
            id: 'api',
            kind: 'container',
            name: 'API',
            parentId: 'system',
            description: 'Calls @[MissingWorker]'
          }
        ]
      })
    )

    const invalid = await callScryerTool(projectPath, { toolName: 'validate_model', arguments: {} })
    expect(invalid.ok).toBe(false)
    expect(invalid.content).toContain('API mentions MissingWorker but no sibling node matches it')
  })

  it('surfaces a top-level hierarchy finding through validate_model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-hierarchy-'))
    const set = await setModel(
      projectPath,
      model03({
        nodes: [{ id: 'bad-component', kind: 'component', name: 'Loose Component' }]
      })
    )
    // A structurally-valid but hierarchically-suspicious model is accepted by set_model;
    // the finding surfaces through validate_model rather than a hard legacy reject.
    expect(set.ok, JSON.stringify(set)).toBe(true)

    const validation = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(validation.ok).toBe(false)
    expect(validation.content).toContain('cannot be top-level')
  })

  it('renders a build task for a proposed component through get_task over the strict model', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-task-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
          {
            id: 'controller',
            kind: 'component',
            name: 'Controller',
            parentId: 'api',
            appearance: { status: 'proposed' }
          },
          {
            id: 'service',
            kind: 'component',
            name: 'Service',
            parentId: 'api',
            appearance: { status: 'proposed' }
          }
        ],
        links: [{ id: 'edge-controller-service', src: 'controller', dst: 'service', label: 'uses' }]
      })
    )

    const task = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: { node_id: 'api' }
    })
    expect(task.ok).toBe(true)
    // Dependency order: Service has no outgoing dependency edge, so it is built first.
    expect(task.content).toContain('Build: Service')
    expect(task.content).not.toContain('Build: Controller')
  })

  it('returns the migrated Scryer modeling rules as the MCP rules source', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-rules-'))
    const rules = await callScryerTool(projectPath, { toolName: 'get_rules', arguments: {} })

    expect(rules.ok).toBe(true)
    expect(rules.content).toContain('One edge per relationship')
    expect(rules.content).toContain('Implementation loop')
  })

  it('rejects retired legacy aliases without falling back to legacy mutation (alias matrix)', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-alias-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' }
        ]
      })
    )
    const plannedBefore = await readPlanned(projectPath)

    const rejected = [
      { toolName: 'add_nodes', arguments: { nodes: [{ name: 'Legacy', kind: 'system' }] } },
      {
        toolName: 'set_node',
        arguments: { node_id: 'system', data: JSON.stringify({ nodes: [] }) }
      },
      { toolName: 'set_flows', arguments: { data: JSON.stringify([]) } },
      { toolName: 'delete_flow', arguments: { flow_id: 'flow-1' } }
    ] as const

    for (const call of rejected) {
      const result = await callScryerTool(projectPath, {
        toolName: call.toolName,
        arguments: call.arguments
      })
      expect(result.ok, `${call.toolName} should be rejected`).toBe(false)
      expect(result.content).toContain('is not supported')
    }

    // No legacy fall-through: the planned layer is untouched by the rejected aliases.
    expect(await readPlanned(projectPath)).toEqual(plannedBefore)
  })

  it('rejects repointing a link through update_edges (delete then add instead)', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-repoint-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
          { id: 'worker', kind: 'container', name: 'Worker', parentId: 'system' }
        ],
        links: [{ id: 'edge-api-worker', src: 'api', dst: 'worker', label: 'calls' }]
      })
    )

    const repoint = await callScryerTool(projectPath, {
      toolName: 'update_edges',
      arguments: { edges: [{ edge_id: 'edge-api-worker', source: 'worker', target: 'api' }] }
    })
    expect(repoint.ok).toBe(false)
    expect(repoint.content).toContain('delete and add')
  })

  it('surfaces an engine write failure as an error without a legacy fallback write', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-no-fallback-'))
    await setModel(
      projectPath,
      model03({ nodes: [{ id: 'system', kind: 'system', name: 'Shop' }] })
    )
    const plannedBefore = await readPlanned(projectPath)

    // The engine rejects a link to a non-existent node; the bridge surfaces the failure
    // and never falls back to a legacy writer.
    const result = await callScryerTool(projectPath, {
      toolName: 'add_edges',
      arguments: { edges: [{ source: 'system', target: 'ghost', label: 'calls' }] }
    })
    expect(result.ok).toBe(false)
    expect(await readPlanned(projectPath)).toEqual(plannedBefore)
  })

  it('updates edge labels and manages groups through the strict operations', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-matrix-'))
    await setModel(
      projectPath,
      model03({
        nodes: [
          { id: 'system', kind: 'system', name: 'Shop' },
          { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
          { id: 'worker', kind: 'container', name: 'Worker', parentId: 'system' }
        ],
        links: [{ id: 'edge-api-worker', src: 'api', dst: 'worker', label: 'calls' }]
      })
    )

    const updateEdge = await callScryerTool(projectPath, {
      toolName: 'update_edges',
      arguments: { edges: [{ edge_id: 'edge-api-worker', label: 'requests', method: 'REST' }] }
    })
    expect(updateEdge.ok, JSON.stringify(updateEdge)).toBe(true)

    const setGroups = await callScryerTool(projectPath, {
      toolName: 'set_groups',
      arguments: {
        data: JSON.stringify([
          { id: 'runtime', name: 'Runtime', memberIds: ['api', 'worker'], parentNodeId: 'system' }
        ])
      }
    })
    expect(setGroups.ok, JSON.stringify(setGroups)).toBe(true)
    let planned = await readPlanned(projectPath)
    expect((planned.groups as { id: string }[]).some((g) => g.id === 'runtime')).toBe(true)
    expect((planned.links as { label: string }[])[0]?.label).toBe('requests')

    const deleteGroup = await callScryerTool(projectPath, {
      toolName: 'delete_group',
      arguments: { group_id: 'runtime' }
    })
    expect(deleteGroup.ok).toBe(true)
    planned = await readPlanned(projectPath)
    expect((planned.groups as { id: string }[]).some((g) => g.id === 'runtime')).toBe(false)

    const deleteEdges = await callScryerTool(projectPath, {
      toolName: 'delete_edges',
      arguments: { edge_ids: ['edge-api-worker'] }
    })
    expect(deleteEdges.ok).toBe(true)
    planned = await readPlanned(projectPath)
    expect(planned.links).toEqual([])
  })
})
