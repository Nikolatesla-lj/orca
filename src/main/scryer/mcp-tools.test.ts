/* eslint-disable max-lines -- Why: this file exercises the migrated Scryer MCP bridge end-to-end, including task ordering, model mutation, rules, and structure semantics in one fixture-heavy suite. */
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import type { C4ModelDataV2 } from '../../shared/scryer/model-types'
import { getProjectModelPath, readModel } from './model-store'
import {
  callScryerTool,
  handleDeleteDiagram,
  handleGetDiagram,
  handleSetDiagrams
} from './mcp-tools'

function diagramFixturePath(name: string): string {
  return join(__dirname, '..', '..', 'shared', 'scryer', '__fixtures__', 'diagram-library', name)
}

async function createDiagramFixtureProject(name = 'valid-diagrams-and-refs.scry'): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-diagram-tools-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(
    getProjectModelPath(projectPath),
    await readFile(diagramFixturePath(name), 'utf8'),
    'utf8'
  )
  return projectPath
}

describe('callScryerTool', () => {
  it('sets diagrams through MCP and reads the written diagram from a real .scry file', async () => {
    const projectPath = await createDiagramFixtureProject()
    const source = 'sequenceDiagram\n  participant API\n  API->>DB: fetch'

    const setResult = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        data: JSON.stringify({
          id: 'diagram-mcp-sequence',
          name: 'MCP Sequence',
          kind: 'sequence',
          notation: 'mermaid',
          source
        })
      }
    })

    expect(setResult).toMatchObject({
      ok: true,
      data: { diagramsChanged: ['diagram-mcp-sequence'], refsDeleted: [] }
    })
    await expect(readModel(projectPath)).resolves.toMatchObject({
      diagrams: expect.arrayContaining([
        expect.objectContaining({ id: 'diagram-mcp-sequence', source })
      ])
    })

    const getResult = await callScryerTool(projectPath, {
      toolName: 'get_diagram',
      arguments: { diagram_id: 'diagram-mcp-sequence' }
    })

    expect(getResult).toMatchObject({
      ok: true,
      data: {
        diagram: expect.objectContaining({ id: 'diagram-mcp-sequence', source }),
        refs: []
      }
    })

    const replaceAll = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        mode: 'replaceAll',
        data: JSON.stringify({
          id: 'diagram-only',
          name: 'Only Diagram',
          kind: 'flowchart',
          notation: 'mermaid',
          source: 'flowchart TD\n  only[Only]'
        })
      }
    })
    expect(replaceAll).toMatchObject({
      ok: true,
      data: {
        diagramsChanged: ['diagram-only'],
        refsDeleted: expect.arrayContaining(['ref-api-flow', 'ref-api-element', 'ref-source'])
      }
    })
    await expect(readModel(projectPath)).resolves.toMatchObject({
      diagrams: [expect.objectContaining({ id: 'diagram-only' })],
      diagramRefs: []
    })
  })

  it('updates diagram refs by mode and deletes diagrams with real cache cleanup', async () => {
    const projectPath = await createDiagramFixtureProject()

    const upsert = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: {
        data: JSON.stringify({
          id: 'ref-mcp-source',
          diagramId: 'diagram-sequence',
          target: { type: 'source', pattern: './src\\api.ts', line: 2, endLine: 4 },
          role: 'evidence'
        })
      }
    })
    expect(upsert).toMatchObject({
      ok: true,
      data: { refsChanged: ['ref-mcp-source'], refsDeleted: [] }
    })
    await expect(readModel(projectPath)).resolves.toMatchObject({
      diagramRefs: expect.arrayContaining([
        expect.objectContaining({
          id: 'ref-mcp-source',
          target: { type: 'source', pattern: 'src/api.ts', line: 2, endLine: 4 }
        })
      ])
    })

    const replace = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: {
        mode: 'replaceForDiagram',
        diagram_id: 'diagram-sequence',
        data: JSON.stringify({
          id: 'ref-mcp-node',
          diagramId: 'diagram-sequence',
          target: { type: 'node', id: 'api' },
          role: 'architecture-detail'
        })
      }
    })
    expect(replace).toMatchObject({
      ok: true,
      data: {
        refsChanged: ['ref-mcp-node'],
        refsDeleted: expect.arrayContaining(['ref-source', 'ref-mcp-source'])
      }
    })

    const deleteRef = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: { mode: 'delete', ref_ids: ['ref-mcp-node'] }
    })
    expect(deleteRef).toMatchObject({
      ok: true,
      data: { refsChanged: [], refsDeleted: ['ref-mcp-node'] }
    })

    const cacheDir = join(projectPath, '.scryer', 'cache', 'diagrams', 'model', 'diagram-api-flow')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, 'stale.svg'), '<svg></svg>')
    expect(existsSync(cacheDir)).toBe(true)

    const deleted = await callScryerTool(projectPath, {
      toolName: 'delete_diagram',
      arguments: { diagram_id: 'diagram-api-flow' }
    })
    expect(deleted).toMatchObject({
      ok: true,
      data: {
        diagramId: 'diagram-api-flow',
        refsDeleted: expect.arrayContaining(['ref-api-flow', 'ref-api-element'])
      }
    })
    expect(existsSync(cacheDir)).toBe(false)
    const model = await readModel(projectPath)
    expect((model.diagrams ?? []).map((diagram) => diagram.id)).not.toContain('diagram-api-flow')
    expect((model.diagramRefs ?? []).some((ref) => ref.diagramId === 'diagram-api-flow')).toBe(
      false
    )
  })

  it('adds compact diagram context to existing MCP tools without returning full sources by default', async () => {
    const projectPath = await createDiagramFixtureProject()

    const modelResult = await callScryerTool(projectPath, {
      toolName: 'get_model',
      arguments: {}
    })
    expect(modelResult.ok).toBe(true)
    expect(modelResult.content).not.toContain('flowchart TD')
    const modelData = modelResult.data as {
      diagrams: { id: string; source?: string }[]
      diagramContext: {
        diagramSummaries: { id: string; sourceHash: string; sourceOmitted: boolean }[]
        diagramRefs: { id: string; diagramId: string }[]
      }
    }
    expect(modelData.diagrams[0]).not.toHaveProperty('source')
    expect(modelData.diagramContext.diagramSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'diagram-api-flow',
          sourceOmitted: true,
          sourceHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/)
        })
      ])
    )
    expect(modelData.diagramContext.diagramRefs).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'ref-api-flow' })])
    )

    const nodeResult = await callScryerTool(projectPath, {
      toolName: 'get_node',
      arguments: { node_id: 'api' }
    })
    expect(nodeResult.ok).toBe(true)
    const nodeData = nodeResult.data as {
      diagramContext: { diagramRefs: { id: string }[] }
    }
    expect(nodeData.diagramContext.diagramRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ref-api-flow' }),
        expect.objectContaining({ id: 'ref-source' })
      ])
    )
    expect(nodeData.diagramContext.diagramRefs).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'ref-api-element' })])
    )

    const validation = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(validation).toMatchObject({
      data: {
        diagramValidation: {
          danglingRefIds: [],
          invalidDiagramIds: []
        }
      }
    })

    const edited = await readModel(projectPath)
    edited.diagrams = (edited.diagrams ?? []).map((diagram) =>
      diagram.id === 'diagram-api-flow' ? { ...diagram, name: 'API Flow Edited' } : diagram
    )
    await writeFile(getProjectModelPath(projectPath), JSON.stringify(edited, null, 2))

    const changes = await callScryerTool(projectPath, {
      toolName: 'get_changes',
      arguments: {}
    })
    expect(changes).toMatchObject({
      ok: true,
      data: {
        diagrams: [expect.objectContaining({ id: 'diagram-api-flow', change: 'modified' })]
      }
    })
  })

  it('includes diagram-to-code guidance in the real get_task prompt assembly', async () => {
    const projectPath = await createDiagramFixtureProject()
    const model = await readModel(projectPath)
    model.nodes = [
      {
        id: 'system',
        type: 'c4',
        data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
      },
      {
        id: 'api',
        parentId: 'system',
        type: 'c4',
        data: {
          name: 'API',
          description: 'HTTP API',
          kind: 'container',
          status: 'proposed'
        }
      }
    ]
    model.edges = []
    model.groups = []
    model.diagrams = [
      {
        id: 'diagram-api-build',
        name: 'API Build',
        kind: 'sequence',
        notation: 'mermaid',
        source: 'sequenceDiagram\n  participant API\n  API->>DB: query'
      }
    ]
    model.diagramRefs = [
      {
        id: 'ref-api-build',
        diagramId: 'diagram-api-build',
        target: { type: 'node', id: 'api' },
        role: 'sequence-detail'
      }
    ]
    await import('./model-store').then(({ writeModel }) => writeModel(projectPath, model))

    const task = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: {}
    })

    expect(task.ok).toBe(true)
    expect(task.content).toContain('Linked diagrams')
    expect(task.content).toContain('diagram-api-build')
    expect(task.content).toContain('Use `get_diagram` before editing omitted diagram source')
    expect(task.content).toContain(
      'Unlinked diagrams are not enough to change code without resolving a C4, flow, or source target'
    )
  })

  it('rejects invalid diagram MCP payloads with structured codes and leaves .scry unchanged', async () => {
    const projectPath = await createDiagramFixtureProject()
    const before = await readFile(getProjectModelPath(projectPath), 'utf8')

    const kindConflict = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        data: JSON.stringify({
          id: 'diagram-conflict',
          name: 'Conflict',
          kind: 'flowchart',
          notation: 'mermaid',
          source: 'sequenceDiagram\n  A->>B: hello'
        })
      }
    })
    expect(kindConflict).toMatchObject({
      ok: false,
      data: {
        code: 'mcp.validation-failed',
        details: { validationCodes: ['renderer.kind-conflict'] }
      }
    })

    const duplicateId = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        data: JSON.stringify([
          {
            id: 'diagram-dupe',
            name: 'One',
            kind: 'flowchart',
            notation: 'mermaid',
            source: 'flowchart TD\n  a[A]'
          },
          {
            id: 'diagram-dupe',
            name: 'Two',
            kind: 'flowchart',
            notation: 'mermaid',
            source: 'flowchart TD\n  b[B]'
          }
        ])
      }
    })
    expect(duplicateId).toMatchObject({ ok: false, data: { code: 'mcp.duplicate-id' } })

    const missingId = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        data: JSON.stringify({
          name: 'Missing id',
          kind: 'flowchart',
          notation: 'mermaid',
          source: 'flowchart TD\n  a[A]'
        })
      }
    })
    expect(missingId).toMatchObject({
      ok: false,
      data: { code: 'mcp.validation-failed' }
    })

    expect(await readFile(getProjectModelPath(projectPath), 'utf8')).toBe(before)
  })

  it('rejects invalid diagram ref MCP modes and unsafe targets with structured codes', async () => {
    const projectPath = await createDiagramFixtureProject()
    const before = await readFile(getProjectModelPath(projectPath), 'utf8')

    const unsafeSource = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: {
        data: JSON.stringify({
          id: 'ref-unsafe',
          diagramId: 'diagram-sequence',
          target: { type: 'source', pattern: '../secret.ts' },
          role: 'evidence'
        })
      }
    })
    expect(unsafeSource).toMatchObject({
      ok: false,
      data: {
        code: 'mcp.validation-failed',
        details: { validationCodes: ['parser.invalid-source-target'] }
      }
    })

    const missingTarget = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: {
        data: JSON.stringify({
          id: 'ref-missing-node',
          diagramId: 'diagram-sequence',
          target: { type: 'node', id: 'missing-node' },
          role: 'architecture-detail'
        })
      }
    })
    expect(missingTarget).toMatchObject({ ok: false, data: { code: 'mcp.target-not-found' } })

    const missingRefIds = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: { mode: 'delete' }
    })
    expect(missingRefIds).toMatchObject({
      ok: false,
      data: { code: 'mcp.mode-argument-missing' }
    })

    const dataInDeleteMode = await callScryerTool(projectPath, {
      toolName: 'update_diagram_refs',
      arguments: {
        mode: 'delete',
        data: JSON.stringify({ id: 'ref-source' }),
        ref_ids: ['ref-source']
      }
    })
    expect(dataInDeleteMode).toMatchObject({
      ok: false,
      data: { code: 'mcp.validation-failed' }
    })

    expect(await readFile(getProjectModelPath(projectPath), 'utf8')).toBe(before)
  })

  it('uses dispatcher-selected model names and does not let handlers parse model from args', async () => {
    const projectPath = await createDiagramFixtureProject()
    const source = 'flowchart TD\n  a[Alt]'

    const setAlt = await callScryerTool(projectPath, {
      toolName: 'set_diagrams',
      arguments: {
        model: 'Alt Model',
        data: JSON.stringify({
          id: 'diagram-alt',
          name: 'Alt',
          kind: 'flowchart',
          notation: 'mermaid',
          source
        })
      }
    })
    expect(setAlt.ok).toBe(true)

    await expect(readModel(projectPath, 'Alt Model')).resolves.toMatchObject({
      diagrams: [expect.objectContaining({ id: 'diagram-alt' })]
    })
    await expect(readModel(projectPath)).resolves.toMatchObject({
      diagrams: expect.not.arrayContaining([expect.objectContaining({ id: 'diagram-alt' })])
    })

    const getAlt = await callScryerTool(projectPath, {
      toolName: 'get_diagram',
      arguments: { model: 'Alt Model', diagram_id: 'diagram-alt' }
    })
    expect(getAlt).toMatchObject({
      ok: true,
      data: { diagram: expect.objectContaining({ id: 'diagram-alt', source }) }
    })

    const capturedModelNames: (string | null | undefined)[] = []
    const contextModel = (await readModel(projectPath)) as C4ModelDataV2
    await handleSetDiagrams(
      {
        model: 'ignored-by-handler',
        data: JSON.stringify({
          id: 'diagram-context-model',
          name: 'Context model',
          kind: 'flowchart',
          notation: 'mermaid',
          source: 'flowchart TD\n  c[Context]'
        })
      } as never,
      {
        projectPath,
        modelName: 'Context Model',
        model: contextModel,
        writeModel: async (_projectPath, _model, modelName) => {
          capturedModelNames.push(modelName)
        }
      }
    )
    expect(capturedModelNames).toEqual(['Context Model'])
  })

  it('splits diagram MCP contexts and reports cache cleanup warnings without rollback', async () => {
    const projectPath = await createDiagramFixtureProject()
    const model = (await readModel(projectPath)) as C4ModelDataV2

    const readOnlyResult = await handleGetDiagram(
      { diagram_id: 'diagram-api-flow' },
      {
        projectPath,
        modelName: null,
        model
      }
    )
    expect(readOnlyResult).toMatchObject({
      ok: true,
      data: { diagram: expect.objectContaining({ id: 'diagram-api-flow' }) }
    })

    const deleteResult = await handleDeleteDiagram(
      { diagram_id: 'diagram-api-flow' },
      {
        projectPath,
        modelName: null,
        model,
        writeModel: async (nextProjectPath, nextModel, modelName) => {
          await import('./model-store').then(({ writeModel }) =>
            writeModel(nextProjectPath, nextModel, modelName)
          )
        },
        clearDiagramCache: async () => ({
          ok: false,
          code: 'cache.clear-failed',
          message: 'Injected cache clear failure'
        })
      }
    )
    expect(deleteResult).toMatchObject({
      ok: true,
      data: {
        diagramId: 'diagram-api-flow',
        warnings: [expect.objectContaining({ code: 'cache.clear-failed' })]
      }
    })
    await expect(readModel(projectPath)).resolves.toMatchObject({
      diagrams: expect.not.arrayContaining([expect.objectContaining({ id: 'diagram-api-flow' })])
    })
  })

  it('sets a model, strips layout-only positions, validates hierarchy, and returns tasks', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-'))
    const result = await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              position: { x: 100, y: 100 },
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'api',
              parentId: 'system',
              position: { x: 120, y: 160 },
              data: {
                name: 'API',
                description: 'HTTP API',
                kind: 'container',
                status: 'proposed',
                contract: { expect: ['Returns JSON'], ask: [], never: [] }
              }
            },
            {
              id: 'users',
              parentId: 'api',
              data: {
                name: 'Users',
                description: 'User workflows',
                kind: 'component',
                status: 'proposed',
                notes: ['Owns signup']
              }
            }
          ],
          edges: [
            { id: 'edge-api-users', source: 'api', target: 'users', data: { label: 'calls' } }
          ]
        })
      }
    })

    expect(result.ok).toBe(true)
    const rawStored = JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8'))
    expect(
      rawStored.nodes.find((node: { id: string }) => node.id === 'api')?.position
    ).toBeUndefined()

    const task = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: {}
    })
    expect(task.ok).toBe(true)
    expect(task.content).toContain('Users')
    expect(task.content).toContain('Returns JSON')
    expect(task.content).toContain('Owns signup')

    const update = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: {
        nodes: [
          {
            node_id: 'users',
            status: 'implemented',
            reason: 'Added signup service',
            source: [{ pattern: 'src/users/**/*.ts' }]
          }
        ]
      }
    })

    expect(update.ok).toBe(true)
    const updated = await readModel(projectPath)
    expect(updated.nodes.find((node) => node.id === 'users')?.data.status).toBe('implemented')
    expect(updated.sourceMap?.users).toEqual([{ pattern: 'src/users/**/*.ts' }])
  })

  it('mirrors Scryer MCP node, edge, source-map, structure, and change semantics', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-live-'))
    await mkdir(join(projectPath, 'src', 'api'), { recursive: true })
    await writeFile(join(projectPath, 'package.json'), '{"name":"sample"}\n')
    await writeFile(join(projectPath, 'src', 'api', 'index.ts'), 'export const api = true\n')

    const listModels = await callScryerTool(projectPath, {
      toolName: 'list_models',
      arguments: {}
    })
    expect(listModels.ok).toBe(true)
    expect(listModels.content).toContain('.scryer/model.scry')

    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'web',
              parentId: 'system',
              data: {
                name: 'Web',
                description: 'Web container',
                kind: 'container',
                status: 'proposed'
              }
            },
            {
              id: 'api',
              parentId: 'system',
              data: {
                name: 'API',
                description: 'API container',
                kind: 'container',
                status: 'proposed'
              }
            },
            {
              id: 'handler',
              parentId: 'api',
              data: {
                name: 'Handler',
                description: 'HTTP handler',
                kind: 'component',
                status: 'proposed'
              }
            },
            {
              id: 'operation',
              parentId: 'handler',
              data: {
                name: 'listUsers',
                description: 'List users',
                kind: 'operation',
                status: 'proposed'
              }
            }
          ],
          edges: []
        })
      }
    })

    const addEdge = await callScryerTool(projectPath, {
      toolName: 'add_edges',
      arguments: { edges: [{ source: 'web', target: 'api', label: 'calls', method: 'HTTP' }] }
    })
    expect(addEdge.ok).toBe(true)

    const updateEdge = await callScryerTool(projectPath, {
      toolName: 'update_edges',
      arguments: { edges: [{ edge_id: 'edge-web-api', label: 'requests', method: 'REST' }] }
    })
    expect(updateEdge.ok).toBe(true)

    const updateNode = await callScryerTool(projectPath, {
      toolName: 'update_nodes',
      arguments: {
        nodes: [
          {
            node_id: 'handler',
            name: 'User Handler',
            description: 'Owns user HTTP routes',
            technology: 'TypeScript',
            sources: [{ pattern: 'src/api/**/*.ts', comment: 'route handlers' }],
            contract: { expect: [{ text: 'Has live test', passed: true }], ask: [], never: [] },
            notes: ['Keep route logic thin'],
            status: 'implemented',
            reason: 'Implemented handler and tests',
            source: [{ pattern: 'src/api/**/*.ts', line: 1 }]
          }
        ]
      }
    })
    expect(updateNode.ok).toBe(true)

    const sourceMap = await callScryerTool(projectPath, {
      toolName: 'update_source_map',
      arguments: {
        entries: [
          { node_id: 'operation', locations: [{ pattern: 'src/api/index.ts', line: 1 }] },
          { node_id: 'operation', locations: [] }
        ]
      }
    })
    expect(sourceMap.ok).toBe(true)

    const subtree = await callScryerTool(projectPath, {
      toolName: 'get_node',
      arguments: { node_id: 'api' }
    })
    expect(subtree.ok).toBe(true)
    expect(subtree.content).toContain('"descendants"')
    expect(subtree.content).toContain('User Handler')
    expect(subtree.content).toContain('"external_node_name": "Web"')

    const structure = await callScryerTool(projectPath, {
      toolName: 'get_structure',
      arguments: { path: projectPath }
    })
    expect(structure.ok).toBe(true)
    expect(structure.content).toContain('package.json')
    expect(structure.content).toContain('[manifest]')

    const modelAfterUserEdit = await readModel(projectPath)
    modelAfterUserEdit.nodes.push({
      id: 'manual',
      type: 'c4',
      data: { name: 'Manual Node', description: 'User-added diagram node', kind: 'system' }
    })
    await import('./model-store').then(({ writeModel }) =>
      writeModel(projectPath, modelAfterUserEdit)
    )

    const changes = await callScryerTool(projectPath, {
      toolName: 'get_changes',
      arguments: {}
    })
    expect(changes.ok).toBe(true)
    expect(changes.content).toContain('Nodes added')
    expect(changes.content).toContain('Manual Node')

    const deleteNodes = await callScryerTool(projectPath, {
      toolName: 'delete_nodes',
      arguments: { node_ids: ['api'] }
    })
    expect(deleteNodes.ok).toBe(true)
    const deleted = await readModel(projectPath)
    expect(deleted.nodes.map((node) => node.id)).not.toContain('operation')
    expect(deleted.edges).toEqual([])
    expect(deleted.sourceMap?.handler).toBeUndefined()
  })

  it('rejects components that are not nested under containers', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-invalid-'))
    const result = await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'bad-component',
              data: { name: 'Loose Component', description: 'Invalid', kind: 'component' }
            }
          ],
          edges: []
        })
      }
    })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Component .* must have a container parent/)
  })

  it('rejects top-level C4 node fields that would hide malformed agent output', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-malformed-node-'))
    const result = await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'world-clock-app',
              name: 'World Clock App',
              kind: 'system',
              data: {
                name: 'world-clock-app',
                description: '',
                kind: 'system'
              }
            },
            {
              id: 'web-ui',
              name: 'Web UI',
              kind: 'container',
              parent: 'world-clock-app',
              status: 'implemented',
              data: {
                name: 'web-ui',
                description: '',
                kind: 'system'
              }
            }
          ],
          edges: []
        })
      }
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain("Node 'world-clock-app' uses top-level 'name'")
    expect(result.content).toContain("Node 'web-ui' uses top-level 'parent'")
    expect(result.content).toContain("Node 'web-ui' uses top-level 'status'")
  })

  it('reports malformed persisted node semantics during validation', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-validate-malformed-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(
      getProjectModelPath(projectPath),
      JSON.stringify(
        {
          nodes: [
            {
              id: 'web-ui',
              kind: 'container',
              name: 'Web UI',
              parent: 'world-clock-app',
              data: { name: 'web-ui', description: '', kind: 'system' }
            }
          ],
          edges: []
        },
        null,
        2
      )
    )

    const result = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain("Node 'web-ui' uses top-level 'kind'")
    expect(result.content).toContain("Node 'web-ui' uses top-level 'parent'")
  })

  it('rejects non-array source map updates and keeps the stored source map unchanged', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-source-map-shape-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'web',
              parentId: 'system',
              data: { name: 'Web', description: 'Web UI', kind: 'container' }
            }
          ],
          edges: [],
          sourceMap: {
            web: [{ pattern: 'src/web/**' }]
          }
        })
      }
    })

    const result = await callScryerTool(projectPath, {
      toolName: 'update_source_map',
      arguments: {
        sourceMap: {
          web: { patterns: ['src/web/**'] }
        }
      }
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain('update_source_map requires entries')
    const model = await readModel(projectPath)
    expect(model.sourceMap?.web).toEqual([{ pattern: 'src/web/**' }])
  })

  it('migrates shorthand node contract fields into the official data.contract shape', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-contract-shape-'))
    const result = await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: {
                name: 'Shop',
                description: 'Commerce system',
                kind: 'system',
                expect: ['Owns checkout'],
                never: ['Store card data']
              }
            }
          ],
          edges: []
        })
      }
    })

    expect(result.ok).toBe(true)
    const rawStored = JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8'))
    expect(rawStored.nodes[0].data.contract).toEqual({
      expect: ['Owns checkout'],
      ask: [],
      never: ['Store card data']
    })
    expect(rawStored.nodes[0].data.expect).toBeUndefined()
    expect(rawStored.nodes[0].data.never).toBeUndefined()
  })

  it('rejects invalid source map locations instead of silently clearing entries', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-source-map-invalid-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'web',
              parentId: 'system',
              data: { name: 'Web', description: 'Web UI', kind: 'container' }
            }
          ],
          edges: [],
          sourceMap: {
            web: [{ pattern: 'src/web/**' }]
          }
        })
      }
    })

    const result = await callScryerTool(projectPath, {
      toolName: 'update_source_map',
      arguments: {
        entries: [{ node_id: 'web', locations: [{ path: 'src/app.tsx' }] }]
      }
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain(
      "source map entry 'web' location 1 requires a non-empty pattern"
    )
    const model = await readModel(projectPath)
    expect(model.sourceMap?.web).toEqual([{ pattern: 'src/web/**' }])
  })

  it('rejects wrapped or malformed flow payloads and validates persisted flow shape', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-flow-shape-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            { id: 'system', data: { name: 'Shop', description: 'Commerce', kind: 'system' } }
          ],
          edges: []
        })
      }
    })

    const wrapped = await callScryerTool(projectPath, {
      toolName: 'set_flows',
      arguments: {
        data: JSON.stringify({
          flows: [
            {
              id: 'scenario-add',
              name: 'Add Item',
              steps: [{ id: 'step-1', description: 'User adds an item' }]
            }
          ]
        })
      }
    })
    expect(wrapped.ok).toBe(false)
    expect(wrapped.content).toContain('set_flows data must be a single flow object or an array')

    const missingStepId = await callScryerTool(projectPath, {
      toolName: 'set_flows',
      arguments: {
        data: JSON.stringify([
          {
            id: 'scenario-add',
            name: 'Add Item',
            steps: [{ source: 'user', target: 'system', label: 'adds' }]
          }
        ])
      }
    })
    expect(missingStepId.ok).toBe(false)
    expect(missingStepId.content).toContain("Flow 'scenario-add' step at steps[0] requires id")

    const valid = await callScryerTool(projectPath, {
      toolName: 'set_flows',
      arguments: {
        data: JSON.stringify([
          {
            id: 'scenario-add',
            name: 'Add Item',
            steps: [{ id: 'step-1', description: 'User adds an item' }]
          }
        ])
      }
    })
    expect(valid.ok).toBe(true)

    const model = await readModel(projectPath)
    model.flows = [
      {
        id: 'scenario-bad',
        name: 'Bad Flow',
        steps: [{ description: 'Missing id' } as never]
      }
    ]
    await writeFile(getProjectModelPath(projectPath), JSON.stringify(model, null, 2))

    const validation = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(validation.ok).toBe(false)
    expect(validation.content).toContain("Flow 'scenario-bad' step at steps[0] requires id")
  })

  it('prioritizes deployment group scaffolds before individual container work', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-group-task-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            { id: 'system', data: { name: 'Shop', description: 'Commerce', kind: 'system' } },
            {
              id: 'web',
              parentId: 'system',
              data: {
                name: 'Website',
                description: 'Customer storefront',
                kind: 'container',
                technology: 'Next.js',
                status: 'proposed',
                contract: { expect: ['Serves product pages'], ask: [], never: [] }
              }
            },
            {
              id: 'cms',
              parentId: 'system',
              data: {
                name: 'CMS Admin',
                description: 'Editorial admin surface',
                kind: 'container',
                technology: 'Payload',
                status: 'proposed'
              }
            }
          ],
          edges: [],
          groups: [
            {
              id: 'next-app',
              name: 'Next App',
              description: 'Containers deployed in the same runtime',
              memberIds: ['web', 'cms'],
              contract: { expect: ['Share one deployment'], ask: [], never: ['Create two repos'] }
            }
          ]
        })
      }
    })

    const task = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: {}
    })

    expect(task.ok).toBe(true)
    expect(task.content).toContain('## Scaffold: Next App')
    expect(task.content).toContain('Website')
    expect(task.content).toContain('CMS Admin')
    expect(task.content).toContain('Share one deployment')
    expect(task.content).toContain('Create two repos')
    expect(task.content).toContain('update_nodes')
  })

  it('orders sibling component tasks by dependency edges and reports cycles', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-component-task-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            { id: 'system', data: { name: 'Shop', description: 'Commerce', kind: 'system' } },
            {
              id: 'api',
              parentId: 'system',
              data: { name: 'API', description: 'HTTP API', kind: 'container', status: 'proposed' }
            },
            {
              id: 'controller',
              parentId: 'api',
              data: {
                name: 'Controller',
                description: 'HTTP entrypoint',
                kind: 'component',
                status: 'proposed'
              }
            },
            {
              id: 'service',
              parentId: 'api',
              data: {
                name: 'Service',
                description: 'Business rules',
                kind: 'component',
                status: 'proposed'
              }
            }
          ],
          edges: [
            {
              id: 'edge-controller-service',
              source: 'controller',
              target: 'service',
              data: { label: 'uses' }
            }
          ]
        })
      }
    })

    const firstTask = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: { node_id: 'api' }
    })
    expect(firstTask.ok).toBe(true)
    expect(firstTask.content).toContain('Build: Service')
    expect(firstTask.content).not.toContain('Build: Controller')

    const reverseEdge = await callScryerTool(projectPath, {
      toolName: 'add_edges',
      arguments: { edges: [{ source: 'service', target: 'controller', label: 'calls' }] }
    })
    expect(reverseEdge.ok).toBe(true)

    const cycle = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: { node_id: 'api' }
    })
    expect(cycle.ok).toBe(true)
    expect(cycle.content).toContain('Dependency cycle detected')
    expect(cycle.content).toContain('Controller')
    expect(cycle.content).toContain('Service')
  })

  it('prompts parent status propagation and proposed member implementation after components finish', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-parent-task-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce', kind: 'system', status: 'proposed' }
            },
            {
              id: 'api',
              parentId: 'system',
              data: { name: 'API', description: 'HTTP API', kind: 'container', status: 'proposed' }
            },
            {
              id: 'users',
              parentId: 'api',
              data: {
                name: 'Users',
                description: 'User workflows',
                kind: 'component',
                status: 'implemented',
                statusReason: 'Implemented user workflows'
              }
            },
            {
              id: 'listUsers',
              parentId: 'users',
              data: {
                name: 'listUsers',
                description: 'Lists users',
                kind: 'operation',
                status: 'proposed'
              }
            },
            {
              id: 'User',
              parentId: 'users',
              data: {
                name: 'User',
                description: 'User data',
                kind: 'model',
                status: 'proposed',
                properties: [{ label: 'id', description: 'Unique id' }]
              }
            }
          ],
          edges: []
        })
      }
    })

    const task = await callScryerTool(projectPath, {
      toolName: 'get_task',
      arguments: {}
    })

    expect(task.ok).toBe(true)
    expect(task.content).toContain('All 1 tasks complete')
    expect(task.content).toContain('Mark these parent nodes as implemented')
    expect(task.content).toContain('API')
    expect(task.content).toContain('These member nodes are still proposed')
    expect(task.content).toContain('listUsers')
    expect(task.content).toContain('User')
  })

  it('returns the migrated Scryer modeling rules as the MCP rules source', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-tools-rules-'))
    const rules = await callScryerTool(projectPath, {
      toolName: 'get_rules',
      arguments: {}
    })

    expect(rules.ok).toBe(true)
    expect(rules.content).toContain('One edge per relationship')
    expect(rules.content).toContain('Model for production, not for demos')
    expect(rules.content).toContain(
      'When adding components, populate them with all three code-level node kinds'
    )
    expect(rules.content).toContain('No cross-container component edges')
    expect(rules.content).toContain('Implementation loop')
  })

  it('warns when a node description mentions a sibling without a relationship edge', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-mention-edge-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'api',
              parentId: 'system',
              data: {
                name: 'API',
                description: 'Calls @[Worker]',
                kind: 'container'
              }
            },
            {
              id: 'worker',
              parentId: 'system',
              data: { name: 'Worker', description: 'Background jobs', kind: 'container' }
            }
          ],
          edges: []
        })
      }
    })

    const invalid = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.content).toContain('API mentions Worker')

    const fixed = await callScryerTool(projectPath, {
      toolName: 'add_edges',
      arguments: {
        edges: [{ source: 'api', target: 'worker', label: 'calls' }]
      }
    })
    expect(fixed.ok).toBe(true)

    const valid = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(valid.ok).toBe(true)
  })

  it('warns when a node description mentions a missing sibling', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-mention-missing-'))
    await callScryerTool(projectPath, {
      toolName: 'set_model',
      arguments: {
        data: JSON.stringify({
          nodes: [
            {
              id: 'system',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            },
            {
              id: 'api',
              parentId: 'system',
              data: {
                name: 'API',
                description: 'Calls @[MissingWorker]',
                kind: 'container'
              }
            }
          ],
          edges: []
        })
      }
    })

    const invalid = await callScryerTool(projectPath, {
      toolName: 'validate_model',
      arguments: {}
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.content).toContain('API mentions MissingWorker but no sibling node matches it')
  })
})
