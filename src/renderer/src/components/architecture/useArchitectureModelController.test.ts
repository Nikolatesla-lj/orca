import { describe, expect, it } from 'vitest'
import type { C4ModelData } from '../../../../shared/scryer/model-types'
import {
  pushArchitectureUndoSnapshot,
  createEmptyArchitectureModel,
  findCompletedArchitectureSyncPane,
  fingerprintArchitectureModel
} from './useArchitectureModelController'

describe('architecture model controller helpers', () => {
  it('creates a complete empty Scryer model for the current project', () => {
    expect(createEmptyArchitectureModel('/repo')).toEqual({
      nodes: [],
      edges: [],
      startingLevel: 'system',
      sourceMap: {},
      projectPath: '/repo',
      refPositions: {},
      groups: [],
      flows: []
    })
  })

  it('fingerprints models after Scryer parse/serialize normalization', () => {
    const model: C4ModelData = {
      nodes: [
        {
          id: 'api',
          type: 'c4',
          position: { x: 10, y: 20 },
          data: { kind: 'container', name: 'API', description: '' }
        }
      ],
      edges: [],
      startingLevel: 'system',
      sourceMap: {},
      projectPath: '/repo',
      refPositions: {},
      groups: [],
      flows: []
    }
    const reordered = {
      flows: [],
      groups: [],
      refPositions: {},
      projectPath: '/repo',
      sourceMap: {},
      startingLevel: 'system',
      edges: [],
      nodes: model.nodes
    } as C4ModelData

    expect(fingerprintArchitectureModel(model)).toBe(fingerprintArchitectureModel(reordered))
  })

  it('detects the launched sync agent reporting done on its tab', () => {
    expect(
      findCompletedArchitectureSyncPane({
        tabId: 'tab-sync',
        startedAt: 100,
        agentStatusByPaneKey: {
          'tab-other:0': {
            paneKey: 'tab-other:0',
            state: 'done',
            prompt: '',
            updatedAt: 150,
            stateStartedAt: 150,
            agentType: 'codex',
            stateHistory: []
          },
          'tab-sync:0': {
            paneKey: 'tab-sync:0',
            state: 'done',
            prompt: '',
            updatedAt: 160,
            stateStartedAt: 160,
            agentType: 'codex',
            stateHistory: []
          }
        }
      })
    ).toEqual({ paneKey: 'tab-sync:0', interrupted: false })
  })

  it('ignores stale and interrupted sync agent completion states', () => {
    expect(
      findCompletedArchitectureSyncPane({
        tabId: 'tab-sync',
        startedAt: 100,
        agentStatusByPaneKey: {
          'tab-sync:0': {
            paneKey: 'tab-sync:0',
            state: 'done',
            prompt: '',
            updatedAt: 99,
            stateStartedAt: 99,
            agentType: 'codex',
            stateHistory: []
          }
        }
      })
    ).toBeNull()

    expect(
      findCompletedArchitectureSyncPane({
        tabId: 'tab-sync',
        startedAt: 100,
        agentStatusByPaneKey: {
          'tab-sync:0': {
            paneKey: 'tab-sync:0',
            state: 'done',
            prompt: '',
            updatedAt: 150,
            stateStartedAt: 150,
            agentType: 'codex',
            stateHistory: [],
            interrupted: true
          }
        }
      })
    ).toEqual({ paneKey: 'tab-sync:0', interrupted: true })
  })

  it('keeps the last 10 undo snapshots and batches rapid edits for one second', () => {
    const snapshots = Array.from({ length: 12 }, (_, index) =>
      createEmptyArchitectureModel(`/repo-${index}`)
    )
    let stack: C4ModelData[] = []
    let batchStartedAt: number | null = null

    for (const [index, snapshot] of snapshots.entries()) {
      const result = pushArchitectureUndoSnapshot(stack, snapshot, {
        batchStartedAt,
        now: index * 1_100
      })
      stack = result.stack
      batchStartedAt = result.batchStartedAt
    }

    expect(stack).toHaveLength(10)
    expect(stack[0].projectPath).toBe('/repo-2')
    expect(stack.at(-1)?.projectPath).toBe('/repo-11')

    const batched = pushArchitectureUndoSnapshot(stack, createEmptyArchitectureModel('/rapid'), {
      batchStartedAt,
      now: 12_050
    })
    expect(batched.stack).toBe(stack)
    expect(batched.batchStartedAt).toBe(batchStartedAt)
  })
})
