import { codebaseReadOperation } from './operations/codebase-read'
import { modelHealthOperation } from './operations/model-health'
import { modelQueryOperation } from './operations/model-query'
import { modelReadOperation } from './operations/model-read'
import { modelSearchOperation } from './operations/model-search'
import { modelValidateOperation } from './operations/model-validate'
import { planPendingOperation } from './operations/plan-pending'
import { rulesReadOperation } from './operations/rules-read'
import { flatPolicy, type ScryerCatalogRow } from './catalog-policy'
import type { ScryerOperationExecutor } from './types'

export const READ_CATALOG_ROWS: ScryerCatalogRow[] = [
  {
    id: 'scryer.model.read',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'commit_if_writing',
      lease: 'none',
      reads: ['planned', 'committed_if_available'],
      maintenanceWrites: [{ target: 'baseline', mode: 'best_effort' }],
      sideEffects: ['baseline_refresh']
    }),
    errors: ['invalid_input', 'incompatible_model', 'io_error', 'internal_error', 'not_found'],
    upstream: [{ symbol: 'read.rs::read_model' }, { symbol: 'ReadModelRequest' }],
    execute: modelReadOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.model.search',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({ lock: 'none', lease: 'none', reads: ['planned', 'committed'] }),
    errors: ['invalid_input', 'incompatible_model', 'io_error', 'internal_error'],
    upstream: [{ symbol: 'read.rs::search_model' }, { symbol: 'SearchModelRequest' }],
    execute: modelSearchOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.model.query',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({ lock: 'none', lease: 'none', reads: ['planned', 'committed'] }),
    errors: ['invalid_input', 'incompatible_model', 'io_error', 'internal_error', 'not_found'],
    upstream: [{ symbol: 'read.rs::query_model' }, { symbol: 'QueryModelRequest' }],
    execute: modelQueryOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.rules.read',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({ lock: 'none', lease: 'none', reads: ['rules'] }),
    errors: ['invalid_input', 'internal_error'],
    upstream: [{ symbol: 'read.rs::get_rules' }, { symbol: 'GetRulesRequest' }],
    execute: rulesReadOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.codebase.read',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({ lock: 'none', lease: 'none', reads: ['project_tree'] }),
    errors: ['invalid_input', 'io_error', 'internal_error'],
    upstream: [{ symbol: 'read.rs::read_codebase' }, { symbol: 'ReadCodebaseRequest' }],
    execute: codebaseReadOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.model.validate',
    capability: 'validate',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'none',
      lease: 'none',
      reads: ['committed'],
      validation: ['structural_warnings', 'coverage_warnings', 'anchor_warnings']
    }),
    upstream: [{ symbol: 'read.rs::validate_model' }, { symbol: 'validate.rs' }],
    execute: modelValidateOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.model.health',
    capability: 'read',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'commit_if_writing',
      lease: 'none',
      reads: ['committed', 'sync', 'anchors', 'project_tree', 'build_edges'],
      maintenanceWrites: [
        { target: 'sync', mode: 'best_effort' },
        { target: 'anchor_baseline', mode: 'best_effort' },
        { target: 'committed_source_map_reanchor', mode: 'best_effort' }
      ],
      sideEffects: [
        'seed_sync_if_absent',
        'write_anchor_baseline_if_absent',
        'silent_reanchor_committed_source_map',
        'build_edges_read'
      ]
    }),
    errors: ['not_found'],
    upstream: [
      { symbol: 'read.rs::get_health' },
      { symbol: 'health.rs' },
      { symbol: 'build_edges.rs' }
    ],
    execute: modelHealthOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.plan.pending',
    capability: 'plan_diff',
    risk: 'normal',
    policy: flatPolicy({ lock: 'none', lease: 'none', reads: ['committed', 'planned'] }),
    upstream: [{ symbol: 'read.rs::get_pending' }, { symbol: 'diff.rs' }],
    execute: planPendingOperation as ScryerOperationExecutor<unknown, unknown>
  }
]
