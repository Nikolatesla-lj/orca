import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { C4ModelDataV2 } from '../../shared/scryer/model-types'
import {
  createDefaultDiagramSource,
  createDiagram,
  createDiagramRef,
  deleteDiagramRefs,
  deleteDiagram,
  renameDiagram,
  updateDiagramSource
} from '../../shared/scryer/diagram-controller'
import { parseModelData, pruneDiagramRefsForDeletedTarget } from '../../shared/scryer/parse-model'
import { readModel, writeModel } from './model-store'
import { getProjectModelPath } from './model-store-core'

function fixturePath(name: string): string {
  return join(__dirname, '..', '..', 'shared', 'scryer', '__fixtures__', 'diagram-library', name)
}

async function copyFixtureProject(name: string): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-s1a-'))
  await mkdir(join(projectPath, '.scryer'), { recursive: true })
  await writeFile(getProjectModelPath(projectPath), await readFile(fixturePath(name), 'utf8'))
  return projectPath
}

describe('S1A diagram controller model-store path', () => {
  it('creates, renames, saves source, and deletes diagrams through real .scry reloads', async () => {
    const projectPath = await copyFixtureProject('valid-diagrams-and-refs.scry')
    const initial = (await readModel(projectPath)) as C4ModelDataV2

    const created = createDiagram(initial, {
      name: 'New diagram',
      kind: 'flowchart',
      notation: 'mermaid',
      source: createDefaultDiagramSource('flowchart', 'New diagram')
    })
    await writeModel(projectPath, created.model)
    const afterCreate = (await readModel(projectPath)) as C4ModelDataV2
    const newDiagramId = created.changedDiagramIds[0]!

    expect(afterCreate.diagrams.find((diagram) => diagram.id === newDiagramId)).toMatchObject({
      name: 'New diagram',
      kind: 'flowchart',
      source: 'flowchart TD\n  draft[New diagram]'
    })

    const renamed = renameDiagram(afterCreate, newDiagramId, 'Renamed diagram')
    await writeModel(projectPath, renamed.model)
    const sourceSaved = updateDiagramSource(
      (await readModel(projectPath)) as C4ModelDataV2,
      newDiagramId,
      'sequenceDiagram\n  A->>B: hello'
    )
    await writeModel(projectPath, sourceSaved.model)

    const afterSourceSave = (await readModel(projectPath)) as C4ModelDataV2
    expect(afterSourceSave.diagrams.find((diagram) => diagram.id === newDiagramId)).toMatchObject({
      name: 'Renamed diagram',
      kind: 'sequence',
      source: 'sequenceDiagram\n  A->>B: hello'
    })

    const deleted = deleteDiagram(afterSourceSave, newDiagramId)
    await writeModel(projectPath, deleted.model)
    const afterDelete = (await readModel(projectPath)) as C4ModelDataV2

    expect(afterDelete.diagrams).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newDiagramId })])
    )
    expect(afterDelete.diagramRefs).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ diagramId: newDiagramId })])
    )
  })
})

describe('S3 diagram ref controller model-store path', () => {
  it('creates and deletes refs through real .scry reloads without nesting refs under targets', async () => {
    const projectPath = await copyFixtureProject('valid-diagrams-and-refs.scry')
    const initial = (await readModel(projectPath)) as C4ModelDataV2

    const withNodeRef = createDiagramRef(initial, {
      diagramId: 'diagram-sequence',
      target: { type: 'node', id: 'worker' },
      role: 'sequence-detail'
    })
    const nodeRefId = (withNodeRef.model.diagramRefs ?? []).at(-1)?.id
    expect(nodeRefId).toBeTruthy()

    const withNestedStepRef = createDiagramRef(withNodeRef.model, {
      diagramId: 'diagram-state',
      target: { type: 'flowStep', flowId: 'flow-signup', stepId: 'step-nested-review' },
      role: 'state-detail'
    })
    const nestedStepRefId = (withNestedStepRef.model.diagramRefs ?? []).at(-1)?.id
    expect(nestedStepRefId).toBeTruthy()

    await writeModel(projectPath, withNestedStepRef.model)
    const afterCreate = (await readModel(projectPath)) as C4ModelDataV2
    const rawAfterCreate = JSON.parse(await readFile(getProjectModelPath(projectPath), 'utf8')) as {
      nodes: unknown[]
      flows: unknown[]
      diagramRefs: unknown[]
    }

    expect(afterCreate.diagramRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: nodeRefId,
          diagramId: 'diagram-sequence',
          target: { type: 'node', id: 'worker' },
          role: 'sequence-detail'
        }),
        expect.objectContaining({
          id: nestedStepRefId,
          diagramId: 'diagram-state',
          target: { type: 'flowStep', flowId: 'flow-signup', stepId: 'step-nested-review' },
          role: 'state-detail'
        })
      ])
    )
    expect(rawAfterCreate.diagramRefs).toHaveLength(afterCreate.diagramRefs.length)
    expect(JSON.stringify(rawAfterCreate.nodes)).not.toContain('diagramRefs')
    expect(JSON.stringify(rawAfterCreate.flows)).not.toContain('diagramRefs')

    const deleted = deleteDiagramRefs(afterCreate, [nodeRefId!, nestedStepRefId!])
    await writeModel(projectPath, deleted.model)
    const afterDelete = (await readModel(projectPath)) as C4ModelDataV2

    expect(afterDelete.diagramRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: nodeRefId }),
        expect.objectContaining({ id: nestedStepRefId })
      ])
    )
  })

  it('persists element-level refs through real .scry reloads without svgSelector', async () => {
    const projectPath = await copyFixtureProject('valid-diagrams-and-refs.scry')
    const initial = (await readModel(projectPath)) as C4ModelDataV2

    const linked = createDiagramRef(initial, {
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail',
      elementKey: 'flowchart:node:api',
      sourceRange: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 }
    })
    await writeModel(projectPath, linked.model)

    const afterReload = (await readModel(projectPath)) as C4ModelDataV2
    const rawAfterReload = await readFile(getProjectModelPath(projectPath), 'utf8')
    expect(afterReload.diagramRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagramId: 'diagram-api-flow',
          target: { type: 'node', id: 'api' },
          role: 'architecture-detail',
          elementKey: 'flowchart:node:api',
          sourceRange: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 }
        })
      ])
    )
    expect(rawAfterReload).toContain('"elementKey"')
    expect(rawAfterReload).not.toContain('svgSelector')
    expect(rawAfterReload).not.toContain('<svg')
  })

  it('creates a diagram, saves fixture source, links it to the original target, and reloads both sides', async () => {
    const projectPath = await copyFixtureProject('valid-diagrams-and-refs.scry')
    const initial = (await readModel(projectPath)) as C4ModelDataV2
    const fixtureSource = await readFile(fixturePath('valid-mermaid-flowchart.mmd'), 'utf8')

    const created = createDiagram(initial, {
      name: 'Created from API ref',
      kind: 'flowchart',
      notation: 'mermaid',
      source: createDefaultDiagramSource('flowchart', 'Created from API ref')
    })
    await writeModel(projectPath, created.model)
    const newDiagramId = created.changedDiagramIds[0]!

    const savedSource = updateDiagramSource(
      (await readModel(projectPath)) as C4ModelDataV2,
      newDiagramId,
      fixtureSource
    )
    await writeModel(projectPath, savedSource.model)

    const linked = createDiagramRef((await readModel(projectPath)) as C4ModelDataV2, {
      diagramId: newDiagramId,
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail'
    })
    await writeModel(projectPath, linked.model)

    const afterReload = (await readModel(projectPath)) as C4ModelDataV2
    const targetSideRefs = afterReload.diagramRefs.filter(
      (ref) => ref.target.type === 'node' && ref.target.id === 'api'
    )
    const diagramSideRefs = afterReload.diagramRefs.filter((ref) => ref.diagramId === newDiagramId)

    expect(afterReload.diagrams.find((diagram) => diagram.id === newDiagramId)).toMatchObject({
      name: 'Created from API ref',
      kind: 'flowchart',
      source: fixtureSource
    })
    expect(targetSideRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagramId: newDiagramId,
          target: { type: 'node', id: 'api' },
          role: 'architecture-detail'
        })
      ])
    )
    expect(diagramSideRefs).toHaveLength(1)
    expect(JSON.stringify(await readFile(getProjectModelPath(projectPath), 'utf8'))).not.toContain(
      '<svg'
    )
  })

  it('keeps nested flow-step refs across moves and prunes them after step deletion through real reloads', async () => {
    const projectPath = await copyFixtureProject('nested-flow-steps.scry')
    const initial = (await readModel(projectPath)) as C4ModelDataV2
    const flow = initial.flows?.find((entry) => entry.id === 'flow-nested')
    if (!flow) {
      throw new Error('Expected nested flow fixture')
    }

    const moved = {
      ...initial,
      flows: [
        {
          ...flow,
          steps: [...flow.steps].reverse()
        }
      ]
    }
    await writeModel(projectPath, moved)
    const afterMove = (await readModel(projectPath)) as C4ModelDataV2
    expect(afterMove.diagramRefs.map((ref) => ref.id)).toEqual([
      'ref-root',
      'ref-child',
      'ref-grandchild',
      'ref-sibling'
    ])

    const pruned = pruneDiagramRefsForDeletedTarget(afterMove.diagramRefs, {
      type: 'flowStep',
      flowId: 'flow-nested',
      stepId: 'step-child',
      flow
    })
    const afterStepDeleteModel = {
      ...afterMove,
      flows: [
        {
          ...flow,
          steps: flow.steps.filter((step) => step.id !== 'step-child')
        }
      ],
      diagramRefs: pruned.diagramRefs
    }
    await writeModel(projectPath, afterStepDeleteModel)
    const afterStepDelete = (await readModel(projectPath)) as C4ModelDataV2
    const reparsed = parseModelData(await readFile(getProjectModelPath(projectPath), 'utf8'))

    expect(pruned.deletedRefIds).toEqual(['ref-child', 'ref-grandchild'])
    expect(afterStepDelete.diagramRefs.map((ref) => ref.id)).toEqual(['ref-root', 'ref-sibling'])
    expect(reparsed.validationWarnings ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'parser.missing-flow-step'
        })
      ])
    )
  })
})
