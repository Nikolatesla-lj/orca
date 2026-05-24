import { describe, expect, it } from 'vitest'
import type { C4ModelData, DriftReport } from './model-types'
import {
  advisorPrompt,
  deepModelPrompt,
  initialModelPrompt,
  nodeFillPrompt,
  serializeModelForPrompt,
  syncPrompt
} from './prompts'

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
    const drift: DriftReport = {
      nodes: [{ nodeId: 'node-3', nodeName: 'API', patterns: ['src/api/**/*.ts'] }],
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
