import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { C4ModelData, DriftReportV2 } from './model-types'
import {
  advisorPrompt,
  diagramRefTargetMatchesPromptScope,
  deepModelPrompt,
  initialModelPrompt,
  nodeFillPrompt,
  serializeModelForPrompt,
  syncPrompt
} from './prompts'
import { buildDiagramPromptInstructions } from './prompt-diagram-instructions'
import { parseModelData } from './parse-model'

function diagramFixture(name: string): C4ModelData {
  return parseModelData(
    readFileSync(join(__dirname, '__fixtures__', 'diagram-library', name), 'utf8')
  )
}

describe('Scryer architecture prompts', () => {
  it('aligns the initial modeling prompt with Scryer production modeling guidance', () => {
    const prompt = initialModelPrompt('shop', '/repo/shop')

    expect(prompt).toContain('Build a C4 architecture model named "shop"')
    expect(prompt).toContain('runtime dependencies, external services, databases, and frameworks')
    expect(prompt).toContain('Fix any warnings before proceeding')
    expect(prompt).toContain('Group containers that deploy together using `set_groups`')
    expect(prompt).toContain('Do NOT use "verified"')
    expect(prompt).toContain('Model for production, not for demos')
    expect(prompt).toContain('Name nodes by their role, not their technology')
  })

  it('adds node-kind specific Scryer guidance when filling nodes', () => {
    const base = {
      modelName: 'shop',
      cwd: '/repo/shop',
      nodeId: 'node-2',
      nodeName: 'Shop',
      modelJson: '{"nodes":[],"edges":[]}'
    }

    expect(nodeFillPrompt({ ...base, nodeKind: 'system' })).toContain(
      'APIs, web apps, workers, databases, message queues, caches'
    )
    expect(nodeFillPrompt({ ...base, nodeKind: 'container' })).toContain(
      'Components should represent cohesive modules'
    )
    const componentPrompt = nodeFillPrompt({ ...base, nodeKind: 'component' })
    expect(componentPrompt).toContain('Operations = individual functions or handlers')
    expect(componentPrompt).toContain('Models = data types with properties')
    expect(componentPrompt).toContain('valid identifier')
  })

  it('keeps sync conservative while adapting Scryer status wording to Orca statuses', () => {
    const drift: DriftReportV2 = {
      nodes: [{ nodeId: 'node-3', nodeName: 'API', patterns: ['src/api/**/*.ts'] }],
      diagramRefs: [
        {
          refId: 'ref-source',
          diagramId: 'diagram-sequence',
          diagramName: 'Signup Sequence',
          patterns: ['src/api.ts'],
          target: { type: 'source', pattern: 'src/api.ts', line: 1 },
          sourceOmitted: true,
          sourceHash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        }
      ],
      structureChanged: true
    }
    const prompt = syncPrompt({
      modelName: 'shop',
      cwd: '/repo/shop',
      drift,
      modelJson: '{"nodes":[],"edges":[]}'
    })

    expect(prompt).toContain('Project structure changes')
    expect(prompt).toContain('status "vagrant"')
    expect(prompt).toContain('Do NOT call `get_rules` unless')
    expect(prompt).toContain('Do not change contract expect item `passed` flags')
    expect(prompt).toContain('Do not change node status from "implemented" to "verified"')
    expect(prompt).toContain('Do not call `get_task` or start implementing code')
    expect(prompt).toContain('Potentially drifted diagrams')
    expect(prompt).toContain('Signup Sequence')
    expect(prompt).toContain('Call `get_diagram` before editing omitted diagram source')
  })

  it('uses Scryer advisor checks while keeping Orca terminal output human-readable', () => {
    const prompt = advisorPrompt({
      modelName: 'shop',
      cwd: '/repo/shop',
      modelJson: '{"nodes":[],"edges":[]}'
    })

    expect(prompt).toContain('Technology-stuffed names')
    expect(prompt).toContain('Flow step granularity')
    expect(prompt).toContain('Missing production infrastructure')
    expect(prompt).toContain('Placeholder nodes')
    expect(prompt).toContain('Do not modify the model unless the user explicitly asks')
    expect(prompt).toContain('Return a concise review grouped by node or flow')
  })

  it('serializes model state like Scryer MCP prompt payloads', () => {
    const model: C4ModelData = {
      nodes: [
        {
          id: 'node-1',
          type: 'c4',
          position: { x: 10, y: 20 },
          data: {
            name: 'Shop',
            description: '',
            kind: 'system',
            notes: [],
            status: 'implemented'
          }
        }
      ],
      edges: [],
      refPositions: { 'node-1': { x: 1, y: 2 } },
      sourceMap: {}
    }

    const serialized = serializeModelForPrompt(model)

    expect(serialized).toBe(
      '{"nodes":[{"id":"node-1","data":{"name":"Shop","kind":"system","status":"implemented"}}]}'
    )
  })

  it('serializes prompt diagram summaries compactly without full source by default', () => {
    const model = diagramFixture('many-diagrams-for-prompt.scry')
    const serialized = serializeModelForPrompt(model)
    const payload = JSON.parse(serialized) as {
      diagrams: {
        id: string
        source?: string
        sourceHash?: string
        sourceOmitted?: boolean
        relatedTargets?: unknown[]
        updatedAt?: string
        refCount?: number
      }[]
    }

    expect(serialized).not.toContain('Token Service')
    expect(serialized).not.toContain('Provider: [0.7, 0.8]')
    expect(payload.diagrams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'diagram-01-auth-overview',
          sourceOmitted: true,
          sourceHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          relatedTargets: [{ type: 'node', id: 'system-web' }]
        })
      ])
    )
    expect(payload.diagrams[0]).not.toHaveProperty('source')
    expect(payload.diagrams[0]).not.toHaveProperty('updatedAt')
    expect(payload.diagrams[0]).not.toHaveProperty('refCount')
  })

  it('includes full diagram sources only for explicit ids or matching scoped targets', () => {
    const model = diagramFixture('many-diagrams-for-prompt.scry')

    const byId = JSON.parse(
      serializeModelForPrompt(model, {
        includeDiagramSourcesForDiagramIds: ['diagram-02-payment-sequence']
      })
    ) as { diagrams: { id: string; source?: string; sourceOmitted?: boolean }[] }
    expect(byId.diagrams.find((diagram) => diagram.id === 'diagram-02-payment-sequence')).toEqual(
      expect.objectContaining({
        source: expect.stringContaining('Provider'),
        sourceOmitted: false
      })
    )
    expect(
      byId.diagrams.find((diagram) => diagram.id === 'diagram-01-auth-overview')
    ).not.toHaveProperty('source')

    const sourceModel = diagramFixture('valid-diagrams-and-refs.scry')
    const byTarget = JSON.parse(
      serializeModelForPrompt(sourceModel, {
        includeDiagramSourcesForTargets: [
          { type: 'source', pattern: './src\\api.ts', line: 99, endLine: 120 },
          { type: 'flowStep', flowId: 'flow-signup', stepId: 'step-nested-review' }
        ]
      })
    ) as { diagrams: { id: string; source?: string; sourceOmitted?: boolean }[] }
    expect(byTarget.diagrams.find((diagram) => diagram.id === 'diagram-sequence')).toEqual(
      expect.objectContaining({ source: expect.stringContaining('sequenceDiagram') })
    )
    expect(byTarget.diagrams.find((diagram) => diagram.id === 'diagram-api-flow')).toEqual(
      expect.objectContaining({ source: expect.stringContaining('flowchart TD') })
    )
    expect(byTarget.diagrams.find((diagram) => diagram.id === 'diagram-state')).not.toHaveProperty(
      'source'
    )
  })

  it('matches prompt scoped diagram targets by semantic identity', () => {
    expect(
      diagramRefTargetMatchesPromptScope({ type: 'node', id: 'api' }, { type: 'node', id: 'api' })
    ).toBe(true)
    expect(
      diagramRefTargetMatchesPromptScope(
        { type: 'flowStep', flowId: 'flow-signup', stepId: 'step-nested-review' },
        { type: 'flowStep', flowId: 'flow-signup', stepId: 'other-step' }
      )
    ).toBe(false)
    expect(
      diagramRefTargetMatchesPromptScope(
        { type: 'source', pattern: 'src/api.ts', line: 1 },
        { type: 'source', pattern: './src\\api.ts', line: 500 }
      )
    ).toBe(true)
    expect(
      diagramRefTargetMatchesPromptScope(
        { type: 'source', pattern: '../secret.ts' },
        { type: 'source', pattern: '../secret.ts' }
      )
    ).toBe(false)
  })

  it('uses shared diagram prompt instructions from every public prompt entry point', () => {
    expect(buildDiagramPromptInstructions('initial-model')).toContain(
      'normally skips diagram creation unless the user explicitly requested diagrams'
    )
    expect(initialModelPrompt('shop', '/repo/shop')).toContain(
      'normally skips diagram creation unless the user explicitly requested diagrams'
    )
    expect(
      nodeFillPrompt({
        modelName: 'shop',
        cwd: '/repo/shop',
        nodeId: 'api',
        nodeName: 'API',
        nodeKind: 'container',
        modelJson: '{"nodes":[]}'
      })
    ).toContain('At most one proactive supplemental diagram')
    expect(
      deepModelPrompt({
        modelName: 'shop',
        cwd: '/repo/shop',
        modelJson: '{"nodes":[]}'
      })
    ).toContain('Diagram recovery')
    expect(
      advisorPrompt({
        modelName: 'shop',
        cwd: '/repo/shop',
        modelJson: '{"nodes":[]}'
      })
    ).toContain('Report missing or stale diagrams')
  })

  it('orchestrates the deep Architecture B workflow as official Scryer phased modeling', () => {
    const prompt = deepModelPrompt({
      modelName: 'shop',
      cwd: '/repo/shop',
      modelJson:
        '{"nodes":[{"id":"shop-system","data":{"name":"Shop","kind":"system","status":"implemented"}}]}'
    })

    expect(prompt).toContain('Deep Architecture B')
    expect(prompt).toContain('Initial model: systems and containers')
    expect(prompt).toContain('Stop at the container level')
    expect(prompt).toContain('Fill with AI: container internals')
    expect(prompt).toContain('call `get_node` for each container')
    expect(prompt).toContain('use `set_node` to add components')
    expect(prompt).toContain('Flow extraction')
    expect(prompt).toContain('read tests, end-to-end specs, user-flow docs, and README files')
    expect(prompt).toContain('use `set_flows`')
    expect(prompt).toContain('link each flow ID with `update_source_map`')
    expect(prompt).toContain('Contract recovery')
    expect(prompt).toContain('data.contract: { expect, ask, never }')
    expect(prompt).toContain('preserve existing `passed` flags')
    expect(prompt).toContain('Recover contracts for every container and component named in docs')
    expect(prompt).toContain('Sync rule')
    expect(prompt).toContain('only update model parts that the current code actually changed')
    expect(prompt).toContain('Prefer product-level acceptance flows')
    expect(prompt).toContain('Do not create separate CRUD or API-only flows unless')
    expect(prompt).toContain('Do not model generic runtime capabilities as external systems unless')
    expect(prompt).toContain(
      'Prefer schema or database setup components over trivial health-check routes'
    )
    expect(prompt).toContain('Do NOT call `get_task`')
    expect(prompt).toContain('Do NOT set any node to "verified"')
  })
})
