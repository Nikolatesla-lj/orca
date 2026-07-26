import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getProjectModelPath } from './model-store'
import { callScryerTool } from './mcp-tools'

describe('callScryerTool strict compatibility', () => {
  it('updates strict Scryer nodes through catalog operations without rewriting model.scry as legacy C4', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-strict-update-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          version: '0.3',
          nodes: [
            { id: 'shop', kind: 'system', name: 'Shop' },
            { id: 'api', kind: 'container', name: 'API', parentId: 'shop' }
          ],
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

    const update = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: {
        nodes: [
          {
            node_id: 'api',
            description: 'Updated through MCP bridge'
          }
        ]
      }
    })

    expect(update.ok, JSON.stringify(update)).toBe(true)
    const committed = JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8'))
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(committed.version).toBe('0.3')
    expect(committed.nodes.find((node: { id: string }) => node.id === 'api')?.data).toBeUndefined()
    expect(planned.version).toBe('0.3')
    expect(planned.nodes.find((node: { id: string }) => node.id === 'api')?.description).toBe(
      'Updated through MCP bridge'
    )
  })

  it('deletes strict Scryer nodes through catalog operations into planned state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-strict-delete-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          version: '0.3',
          nodes: [
            { id: 'shop', kind: 'system', name: 'Shop' },
            { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
            { id: 'handler', kind: 'component', name: 'Handler', parentId: 'api' }
          ],
          links: [{ id: 'link-handler-api', src: 'handler', dst: 'api', label: 'serves' }],
          groups: [{ id: 'api-group', name: 'API Group', memberIds: ['api', 'handler'] }],
          sourceMap: { handler: [{ pattern: 'src/api/handler.ts' }] },
          boundaries: { api: [{ pattern: 'src/api/**/*.ts' }] }
        },
        null,
        2
      ),
      'utf8'
    )

    const deleted = await callScryerTool(projectPath, {
      toolName: 'delete_nodes',
      arguments: { node_ids: ['api'] }
    })

    expect(deleted.ok, JSON.stringify(deleted)).toBe(true)
    const committed = JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8'))
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(committed.nodes.map((node: { id: string }) => node.id)).toEqual([
      'shop',
      'api',
      'handler'
    ])
    expect(planned.nodes.map((node: { id: string }) => node.id)).toEqual(['shop'])
    expect(planned.links).toEqual([])
    expect(planned.sourceMap.handler).toBeUndefined()
    expect(planned.boundaries.api).toBeUndefined()
  })

  it('updates strict Scryer task fields through catalog operations into planned state', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-strict-update-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          version: '0.3',
          nodes: [
            { id: 'shop', kind: 'system', name: 'Shop' },
            { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
            { id: 'handler', kind: 'component', name: 'Handler', parentId: 'api' }
          ],
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

    const updated = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: {
        nodes: [
          {
            node_id: 'handler',
            status: 'implemented',
            reason: 'Implemented handler',
            contract: { expect: [{ text: 'Has test', passed: true }], ask: [], never: [] },
            notes: ['Keep route logic thin'],
            shape: 'hexagon',
            source: [{ pattern: 'src/api/handler.ts', line: 1 }],
            sources: [{ pattern: 'src/api/**/*.ts', comment: 'route handlers' }]
          }
        ]
      }
    })

    expect(updated.ok, JSON.stringify(updated)).toBe(true)
    const planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(planned.nodes.find((node: { id: string }) => node.id === 'handler')).toMatchObject({
      notes: 'Keep route logic thin',
      appearance: {
        status: 'implemented',
        statusReason: 'Implemented handler',
        shape: 'hexagon',
        contract: { expect: [{ text: 'Has test', passed: true }], ask: [], never: [] }
      }
    })
    expect(planned.sourceMap.handler).toEqual([{ pattern: 'src/api/handler.ts', line: 1 }])
    expect(planned.boundaries.handler).toEqual([
      { pattern: 'src/api/**/*.ts', comment: 'route handlers' }
    ])
  })

  it('advances MCP get_task from strict planned state after update_nodes', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-strict-task-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          version: '0.3',
          nodes: [
            { id: 'system', kind: 'system', name: 'Issue Tracker' },
            { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
            {
              id: 'service',
              kind: 'component',
              name: 'Issue Service',
              parentId: 'api',
              appearance: { status: 'proposed' }
            },
            {
              id: 'controller',
              kind: 'component',
              name: 'Issue Controller',
              parentId: 'api',
              appearance: { status: 'proposed' }
            }
          ],
          links: [
            { id: 'edge-controller-service', src: 'controller', dst: 'service', label: 'uses' }
          ],
          groups: [],
          sourceMap: {},
          boundaries: {}
        },
        null,
        2
      ),
      'utf8'
    )

    const firstTask = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: { node_id: 'api' }
    })
    expect(firstTask.ok).toBe(true)
    expect(firstTask.content).toContain('Build: Issue Service')
    expect(firstTask.content).not.toContain('Build: Issue Controller')

    const update = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: {
        nodes: [
          {
            node_id: 'service',
            status: 'implemented',
            reason: 'Implemented service first',
            source: [{ pattern: 'src/services/issues.ts' }]
          }
        ]
      }
    })
    expect(update.ok, JSON.stringify(update)).toBe(true)

    const secondTask = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: { node_id: 'api' }
    })
    expect(secondTask.ok).toBe(true)
    expect(secondTask.content).toContain('Build: Issue Controller')
    expect(secondTask.content).not.toContain('Build: Issue Service')
  })

  it('covers the strict MCP compatibility alias matrix', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-strict-matrix-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          version: '0.3',
          nodes: [
            { id: 'system', kind: 'system', name: 'Shop' },
            { id: 'api', kind: 'container', name: 'API', parentId: 'system' },
            { id: 'worker', kind: 'container', name: 'Worker', parentId: 'system' }
          ],
          links: [{ id: 'edge-api-worker', src: 'api', dst: 'worker', label: 'calls' }],
          groups: [],
          sourceMap: {},
          boundaries: {}
        },
        null,
        2
      ),
      'utf8'
    )

    const deleteEdges = await callScryerTool(projectPath, {
      toolName: 'delete_edges',
      arguments: { edge_ids: ['edge-api-worker'] }
    })
    expect(deleteEdges.ok, JSON.stringify(deleteEdges)).toBe(true)
    let planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(planned.links).toEqual([])

    const setGroups = await callScryerTool(projectPath, {
      toolName: 'set_groups',
      arguments: {
        data: JSON.stringify([
          {
            id: 'group-runtime',
            name: 'Runtime',
            memberIds: ['api', 'worker'],
            parentNodeId: 'system'
          }
        ])
      }
    })
    expect(setGroups.ok, JSON.stringify(setGroups)).toBe(true)
    planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(planned.groups).toContainEqual(
      expect.objectContaining({ id: 'group-runtime', name: 'Runtime' })
    )

    const deleteGroup = await callScryerTool(projectPath, {
      toolName: 'delete_group',
      arguments: { group_id: 'group-runtime' }
    })
    expect(deleteGroup.ok, JSON.stringify(deleteGroup)).toBe(true)
    planned = JSON.parse(await readFile(join(projectPath, '.scryer', 'planned.scry'), 'utf8'))
    expect(planned.groups.some((group: { id?: string }) => group.id === 'group-runtime')).toBe(
      false
    )

    const rejectedTools = [
      {
        toolName: 'add_nodes',
        arguments: { nodes: [{ name: 'Legacy', kind: 'system' }] },
        message: 'add_nodes is not supported'
      },
      {
        toolName: 'set_node',
        arguments: { node_id: 'system', data: JSON.stringify({ nodes: [], edges: [] }) },
        message: 'set_node is not supported'
      },
      {
        toolName: 'set_flows',
        arguments: { data: JSON.stringify([]) },
        message: 'set_flows is not supported'
      },
      {
        toolName: 'delete_flow',
        arguments: { flow_id: 'flow-1' },
        message: 'delete_flow is not supported'
      }
    ] as const

    for (const rejected of rejectedTools) {
      const result = await callScryerTool(projectPath, {
        toolName: rejected.toolName,
        arguments: rejected.arguments
      })
      expect(result.ok).toBe(false)
      expect(result.content).toContain(rejected.message)
    }
  })
})
