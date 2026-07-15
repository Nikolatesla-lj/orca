import { linkAddOperation } from './operations/link-add'
import { linkDeleteOperation } from './operations/link-delete'
import { linkUpdateOperation } from './operations/link-update'
import { nodeDeleteOperation } from './operations/node-delete'
import { nodeUpdateOperation } from './operations/node-update'
import {
  groupDeleteOperation,
  groupSetOperation,
  groupUpdateOperation,
  nodeMoveOperation,
  nodeSetSubtreeOperation,
  responsibilityMoveOperation
} from './operations/structural'
import { flatPolicy, type ScryerCatalogRow } from './catalog-policy'
import type { ScryerOperationExecutor } from './types'

export const STRUCTURAL_CATALOG_ROWS: ScryerCatalogRow[] = [
  {
    id: 'scryer.node.update',
    capability: 'plan_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['write_guards', 'hierarchy_integrity']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'nodes.rs::update_nodes' }, { symbol: 'UpdateNodeRequest' }],
    execute: nodeUpdateOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.link.add',
    capability: 'plan_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['link_legality', 'write_guards']
    }),
    errors: ['not_found', 'illegal_link', 'validation_failed'],
    upstream: [{ symbol: 'links.rs::add_links' }, { symbol: 'AddLinkRequest' }],
    execute: linkAddOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.link.update',
    capability: 'plan_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['link_legality', 'write_guards']
    }),
    errors: ['not_found'],
    upstream: [{ symbol: 'links.rs::update_links' }, { symbol: 'UpdateLinkRequest' }],
    execute: linkUpdateOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.link.delete',
    capability: 'plan_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['write_guards']
    }),
    upstream: [{ symbol: 'links.rs::delete_links' }, { symbol: 'DeleteLinkRequest' }],
    execute: linkDeleteOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.node.set-subtree',
    capability: 'plan_author',
    risk: 'high',
    operationClass: 'structural_replacement',
    writeScope: 'subtree',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['write_guards', 'hierarchy_integrity']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'nodes.rs::set_node' }, { symbol: 'SetNodeRequest' }],
    execute: nodeSetSubtreeOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.node.delete',
    capability: 'plan_author',
    risk: 'destructive',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'nodes.rs::delete_nodes' }, { symbol: 'DeleteNodeRequest' }],
    execute: nodeDeleteOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.node.move',
    capability: 'plan_author',
    risk: 'normal',
    operationClass: 'structural_move',
    writeScope: 'node',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['hierarchy_integrity', 'write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'nodes.rs::move_nodes' }, { symbol: 'MoveNodesRequest' }],
    execute: nodeMoveOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.responsibility.move',
    capability: 'plan_author',
    risk: 'normal',
    operationClass: 'structural_move',
    writeScope: 'responsibility',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [
      { symbol: 'nodes.rs::move_responsibilities' },
      { symbol: 'MoveResponsibilitiesRequest' }
    ],
    execute: responsibilityMoveOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.group.set',
    capability: 'plan_author',
    risk: 'high',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['group_integrity', 'write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'misc.rs::set_groups' }, { symbol: 'SetGroupsRequest' }],
    execute: groupSetOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.group.update',
    capability: 'plan_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['group_integrity', 'write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'misc.rs::update_group' }, { symbol: 'UpdateGroupRequest' }],
    execute: groupUpdateOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.group.delete',
    capability: 'plan_author',
    risk: 'destructive',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['group_integrity', 'write_guards']
    }),
    errors: ['not_found'],
    upstream: [{ symbol: 'misc.rs::delete_group' }, { symbol: 'DeleteGroupRequest' }],
    execute: groupDeleteOperation as ScryerOperationExecutor<unknown, unknown>
  }
]
