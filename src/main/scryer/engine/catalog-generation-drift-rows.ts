import { containerFillOperation } from './operations/container-fill'
import { driftFlagOperation } from './operations/drift-flag'
import {
  driftGetOperation,
  driftReconcileOperation,
  modelSetOperation,
  nodeDescopeOperation
} from './operations/structural'
import { flatPolicy, type ScryerCatalogRow } from './catalog-policy'
import type { ScryerOperationExecutor } from './types'

export const GENERATION_DRIFT_CATALOG_ROWS: ScryerCatalogRow[] = [
  {
    id: 'scryer.model.set',
    capability: 'model_generate',
    risk: 'high',
    operationClass: 'structural_replacement',
    writeScope: 'whole_model',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'none',
      reads: [],
      semanticWrites: ['committed', 'planned'],
      maintenanceWrites: [{ target: 'baseline', mode: 'best_effort' }],
      validation: ['structural_warnings', 'write_guards'],
      sideEffects: ['baseline_refresh']
    }),
    errors: ['validation_failed'],
    upstream: [{ symbol: 'nodes.rs::set_model' }, { symbol: 'SetModelRequest' }],
    execute: modelSetOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.container.fill',
    capability: 'model_generate',
    risk: 'high',
    operationClass: 'generation_primitive',
    writeScope: 'subtree',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'none',
      reads: ['committed', 'planned', 'build_edges'],
      semanticWrites: ['committed', 'planned'],
      maintenanceWrites: [{ target: 'history', mode: 'best_effort' }],
      validation: [
        'generation_postconditions',
        'link_legality',
        'group_integrity',
        'source_mapping_integrity'
      ],
      sideEffects: ['build_edges_read', 'history_append']
    }),
    errors: ['not_found', 'validation_failed', 'illegal_link'],
    upstream: [
      { symbol: 'generation.rs::fill_container' },
      { symbol: 'CommitContainerModelRequest' },
      { symbol: 'build_edges.rs' }
    ],
    execute: containerFillOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.node.descope',
    capability: 'model_correct',
    risk: 'high',
    operationClass: 'model_correction',
    writeScope: 'subtree',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      validation: ['hierarchy_integrity', 'write_guards'],
      sideEffects: []
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'nodes.rs::descope' }, { symbol: 'DescopeRequest' }],
    execute: nodeDescopeOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.drift.get',
    capability: 'drift_detect',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'commit_if_writing',
      lease: 'none',
      reads: ['committed_if_available', 'sync', 'anchors', 'project_tree'],
      maintenanceWrites: [
        { target: 'sync', mode: 'best_effort' },
        { target: 'anchor_baseline', mode: 'best_effort' }
      ],
      sideEffects: ['seed_sync_if_absent', 'write_anchor_baseline_if_absent']
    }),
    upstream: [{ symbol: 'read.rs::get_drift' }, { symbol: 'drift.rs' }],
    execute: driftGetOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.drift.flag',
    capability: 'drift_record',
    risk: 'high',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned'],
      maintenanceWrites: [{ target: 'history', mode: 'best_effort' }],
      validation: ['hierarchy_integrity', 'source_mapping_integrity', 'write_guards'],
      sideEffects: ['history_append']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [
      { symbol: 'intent.rs::flag_drift' },
      { symbol: 'FlagDriftRequest' },
      { symbol: 'drift.rs' }
    ],
    execute: driftFlagOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.drift.reconcile',
    capability: 'drift_reconcile',
    risk: 'high',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'none',
      reads: ['committed', 'sync', 'anchors', 'project_tree'],
      maintenanceWrites: [
        { target: 'sync', mode: 'required' },
        { target: 'anchor_baseline', mode: 'required' }
      ],
      sideEffects: ['sync_state_write', 'anchor_baseline_refresh']
    }),
    upstream: [
      { symbol: 'intent.rs::reconcile_drift' },
      { symbol: 'ReconcileDriftRequest' },
      { symbol: 'drift.rs' }
    ],
    execute: driftReconcileOperation as ScryerOperationExecutor<unknown, unknown>
  }
]
