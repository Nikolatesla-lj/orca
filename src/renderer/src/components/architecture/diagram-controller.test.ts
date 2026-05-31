import { describe, expect, it } from 'vitest'
import type { C4ModelDataV2 } from '../../../../shared/scryer/model-types'
import {
  createDefaultDiagramSource,
  createDiagram,
  DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS,
  deleteDiagram,
  DiagramControllerError,
  createDiagramExternalReloadConflict,
  renameDiagram,
  shouldPromptForDiagramDraftSwitch,
  updateDiagramSource
} from './diagram-controller'

function modelWithDiagram(): C4ModelDataV2 {
  return {
    schemaVersion: 2,
    nodes: [
      {
        id: 'api',
        type: 'c4',
        data: {
          name: 'API',
          description: 'Backend API',
          kind: 'container'
        }
      }
    ],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    refPositions: {},
    groups: [],
    flows: [],
    diagrams: [
      {
        id: 'diagram-api-flow',
        name: 'API Flow',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD\n  api[API]'
      }
    ],
    diagramRefs: [
      {
        id: 'ref-api-flow',
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      }
    ]
  }
}

describe('S1A diagram controller mutations', () => {
  it('keeps the diagram library release flag but defaults it on after S2 review is available', () => {
    expect(DEFAULT_ARCHITECTURE_DIAGRAM_FEATURE_FLAGS).toEqual({
      enableArchitectureDiagramLibraryPreview: true
    })
  })

  it('creates, renames, saves source, and deletes diagrams without mutating C4 data', () => {
    const initial = modelWithDiagram()
    const created = createDiagram(initial, {
      name: 'New diagram',
      kind: 'flowchart',
      notation: 'mermaid',
      source: createDefaultDiagramSource('flowchart', 'New diagram')
    })
    const newDiagramId = created.changedDiagramIds[0]!

    expect(created.model.nodes).toEqual(initial.nodes)
    expect(created.model.diagrams?.find((diagram) => diagram.id === newDiagramId)).toMatchObject({
      name: 'New diagram',
      kind: 'flowchart',
      source: 'flowchart TD\n  draft[New diagram]'
    })

    const renamed = renameDiagram(created.model, newDiagramId, 'Renamed diagram')
    const sourceSaved = updateDiagramSource(
      renamed.model,
      newDiagramId,
      'sequenceDiagram\n  A->>B: hello'
    )

    expect(
      sourceSaved.model.diagrams?.find((diagram) => diagram.id === newDiagramId)
    ).toMatchObject({
      name: 'Renamed diagram',
      kind: 'sequence',
      source: 'sequenceDiagram\n  A->>B: hello'
    })

    const deleted = deleteDiagram(sourceSaved.model, newDiagramId)
    expect(deleted.model.diagrams).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newDiagramId })])
    )
  })

  it('rejects empty names and empty source with controller codes', () => {
    const model = modelWithDiagram()

    expect(() =>
      createDiagram(model, {
        name: ' ',
        kind: 'flowchart',
        notation: 'mermaid',
        source: createDefaultDiagramSource('flowchart', '')
      })
    ).toThrow(DiagramControllerError)
    expect(() => updateDiagramSource(model, 'diagram-api-flow', '   ')).toThrow(
      expect.objectContaining({ code: 'controller.empty-source' })
    )
  })

  it('prompts only when a dirty diagram draft would be left', () => {
    const snapshot = {
      diagramId: 'diagram-api-flow',
      persistedSource: 'flowchart TD\n  api[API]',
      draftSource: 'flowchart TD\n  api[API changed]',
      dirty: true
    }

    expect(
      shouldPromptForDiagramDraftSwitch(snapshot, {
        type: 'diagram',
        diagramId: 'diagram-api-flow'
      })
    ).toBe(false)
    expect(
      shouldPromptForDiagramDraftSwitch(snapshot, {
        type: 'diagram',
        diagramId: 'diagram-other'
      })
    ).toBe(true)
    expect(
      shouldPromptForDiagramDraftSwitch({ ...snapshot, dirty: false }, { type: 'topology' })
    ).toBe(false)
  })

  it('creates model-bound external reload conflicts for modified and deleted diagrams', () => {
    const snapshot = {
      diagramId: 'diagram-api-flow',
      persistedSource: 'flowchart TD\n  api[API]',
      draftSource: 'flowchart TD\n  api[Draft]',
      dirty: true
    }
    const modified = createDiagramExternalReloadConflict({
      modelName: 'model',
      snapshot,
      diskDiagram: {
        id: 'diagram-api-flow',
        name: 'API Flow',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD\n  api[Disk]'
      },
      baseRevision: 'base-revision',
      diskRevision: 'disk-revision'
    })

    expect(modified).toEqual({
      modelName: 'model',
      diagramId: 'diagram-api-flow',
      draftSource: 'flowchart TD\n  api[Draft]',
      diskState: 'modified',
      diskSource: 'flowchart TD\n  api[Disk]',
      baseRevision: 'base-revision',
      diskRevision: 'disk-revision',
      diskUpdatedAt: undefined
    })

    expect(
      createDiagramExternalReloadConflict({
        modelName: 'model',
        snapshot,
        diskDiagram: null,
        baseRevision: 'base-revision',
        diskRevision: 'disk-revision'
      })
    ).toMatchObject({
      modelName: 'model',
      diagramId: 'diagram-api-flow',
      draftSource: 'flowchart TD\n  api[Draft]',
      diskState: 'deleted',
      baseRevision: 'base-revision',
      diskRevision: 'disk-revision'
    })
  })
})
