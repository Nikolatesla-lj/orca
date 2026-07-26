import { planFoldOperation } from './operations/plan-fold'
import {
  componentAddOperation,
  containerAddOperation,
  groupAddOperation,
  personAddOperation,
  sourceUpdateOperation,
  symbolAddOperation,
  systemAddOperation
} from './operations/structural'
import {
  flatPolicy,
  operationErrors,
  planFoldPolicy,
  type ScryerCatalogRow
} from './catalog-policy'
import type { ScryerOperationExecutor, ScryerOperationId } from './types'

const ADD_OPERATIONS = {
  person: personAddOperation as ScryerOperationExecutor<unknown, unknown>,
  system: systemAddOperation as ScryerOperationExecutor<unknown, unknown>,
  container: containerAddOperation as ScryerOperationExecutor<unknown, unknown>,
  component: componentAddOperation as ScryerOperationExecutor<unknown, unknown>,
  group: groupAddOperation as ScryerOperationExecutor<unknown, unknown>,
  symbol: symbolAddOperation as ScryerOperationExecutor<unknown, unknown>
} satisfies Record<
  'person' | 'system' | 'container' | 'component' | 'group' | 'symbol',
  ScryerOperationExecutor<unknown, unknown>
>

export const AUTHORING_CATALOG_ROWS: ScryerCatalogRow[] = [
  ...(['person', 'system', 'container', 'component', 'group', 'symbol'] as const).map((kind) => ({
    id: `scryer.${kind}.add` as ScryerOperationId,
    capability: 'plan_author' as const,
    risk: 'normal' as const,
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['planned'],
      semanticWrites: ['planned'],
      validation: ['hierarchy_integrity', 'group_integrity', 'source_mapping_integrity']
    }),
    errors:
      kind === 'person' || kind === 'system'
        ? operationErrors('validation_failed')
        : operationErrors('not_found', 'validation_failed'),
    upstream: [
      { symbol: `intent.rs::add_${kind}` },
      { symbol: `Add${kind[0].toUpperCase()}${kind.slice(1)}Request` }
    ],
    execute: ADD_OPERATIONS[kind] as ScryerOperationExecutor<unknown, unknown>
  })),
  {
    id: 'scryer.source.update',
    capability: 'source_author',
    risk: 'normal',
    policy: flatPolicy({
      lock: 'exclusive',
      lease: 'write_if_active',
      reads: ['committed_if_available', 'planned'],
      semanticWrites: ['planned', 'committed'],
      validation: ['source_mapping_integrity', 'write_guards']
    }),
    errors: ['not_found', 'validation_failed'],
    upstream: [{ symbol: 'misc.rs::update_source_map' }, { symbol: 'UpdateSourceMapRequest' }],
    execute: sourceUpdateOperation as ScryerOperationExecutor<unknown, unknown>
  },
  {
    id: 'scryer.plan.fold',
    capability: 'plan_fold',
    risk: 'high',
    policy: planFoldPolicy(),
    errors: ['not_found', 'validation_failed', 'agent_run_required'],
    upstream: [
      { symbol: 'nodes.rs::mark_implemented' },
      { symbol: 'MarkImplementedRequest' },
      { symbol: 'diff.rs' }
    ],
    execute: planFoldOperation as ScryerOperationExecutor<unknown, unknown>
  }
]
