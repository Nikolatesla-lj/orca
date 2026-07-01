import { describe, expect, it } from 'vitest'
import { diffModels } from './diff'
import { createScryerFoldService } from './fold'
import { createScryerIdMinter } from './id-minter'
import type { ScryModel } from './model'
import { createScryerSourceRouter } from './source-router'
import { createStructuralMutationPlanner } from './structural-planner'
import type { ScryerOperationServices } from './types'
import { createScryerValidatorSet } from './validators'

function services(model: ScryModel): ScryerOperationServices {
  return {
    ids: createScryerIdMinter({ planned: model }),
    validators: createScryerValidatorSet(),
    diff: { diffModels },
    fold: createScryerFoldService(),
    sourceRouter: createScryerSourceRouter(),
    clock: { nowIso: () => '2026-07-01T00:00:00.000Z' }
  }
}

function model(): ScryModel {
  return {
    version: '0.3',
    nodes: [
      { id: 'shop', kind: 'system', name: 'Shop' },
      { id: 'crm', kind: 'system', name: 'CRM' },
      { id: 'api', kind: 'container', name: 'API', parentId: 'shop' },
      { id: 'web', kind: 'container', name: 'Web', parentId: 'shop' }
    ],
    links: [],
    groups: [
      { id: 'group-shop', name: 'Shop containers', memberIds: ['api', 'web'], parentNodeId: 'shop' }
    ],
    sourceMap: {},
    boundaries: {}
  }
}

describe('StructuralMutationPlanner', () => {
  it('returns no-op move plans without durable changes', () => {
    const planned = model()
    const planner = createStructuralMutationPlanner({
      committed: planned,
      planned,
      services: services(planned)
    })

    const result = planner.planNodeMove({
      moves: [{ node_id: 'api', new_parent_id: 'shop' }]
    })

    expect(result).toMatchObject({
      ok: true,
      outcome: {
        result: { moved: [], findings: [{ code: 'no_op', severity: 'info' }] }
      }
    })
    expect(result.ok && result.outcome.changes).toBeUndefined()
  })

  it('plans group fallout cleanup inside the candidate model', () => {
    const planned = model()
    const planner = createStructuralMutationPlanner({
      committed: planned,
      planned,
      services: services(planned)
    })

    const result = planner.planNodeMove({
      moves: [{ node_id: 'api', new_parent_id: 'crm' }]
    })

    expect(result).toMatchObject({
      ok: true,
      outcome: {
        result: {
          moved: [{ nodeId: 'api', fromParentId: 'shop', toParentId: 'crm' }],
          groupCleanup: { updatedGroupCount: 1, removedMembershipCount: 1 }
        },
        changes: {
          planned: {
            groups: [
              {
                id: 'group-shop',
                memberIds: ['web']
              }
            ]
          }
        }
      }
    })
  })
})
