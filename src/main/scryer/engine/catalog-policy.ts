import type {
  ScryerFlatOperationPolicy,
  ScryerMaintenanceWriteTarget,
  ScryerOperationCapability,
  ScryerOperationClass,
  ScryerOperationErrorCode,
  ScryerOperationExecutor,
  ScryerOperationId,
  ScryerOperationPolicy,
  ScryerOperationRisk,
  ScryerOperationWriteScope,
  ScryerSideEffect,
  ScryerStateRead,
  ScryerTransport,
  ScryerTransportMetadata,
  ScryerUpstreamAnchor
} from './types'

const PRODUCT_TRANSPORTS: [ScryerTransport, ...ScryerTransport[]] = [
  'cli',
  'ipc',
  'ui',
  'agent',
  'system'
]

type PolicyArgs = {
  transports?: [ScryerTransport, ...ScryerTransport[]]
  lock: ScryerFlatOperationPolicy['lock']
  lease: ScryerFlatOperationPolicy['lease']
  reads: ScryerStateRead[]
  semanticWrites?: ScryerFlatOperationPolicy['semanticWrites']
  maintenanceWrites?: ScryerFlatOperationPolicy['maintenanceWrites']
  validation?: ScryerFlatOperationPolicy['validation']
  sideEffects?: ScryerSideEffect[]
  agentRunRequired?: boolean
}

export type ScryerCatalogRow = {
  id: ScryerOperationId
  capability: ScryerOperationCapability
  risk: ScryerOperationRisk
  operationClass?: ScryerOperationClass
  writeScope?: ScryerOperationWriteScope
  policy: ScryerOperationPolicy
  errors?: ScryerOperationErrorCode[]
  upstream: ScryerUpstreamAnchor[]
  execute?: ScryerOperationExecutor<unknown, unknown>
}

export function operationErrors(...codes: ScryerOperationErrorCode[]): ScryerOperationErrorCode[] {
  return codes
}

export function flatPolicy(args: PolicyArgs): ScryerFlatOperationPolicy {
  return {
    authorization: {
      transports: args.transports ?? PRODUCT_TRANSPORTS,
      project: {
        containment: 'workspace_required',
        allowProjectOverride: true
      },
      agentRun: {
        required: args.agentRunRequired ?? false,
        bindToContext: args.agentRunRequired ? 'agent_run_id_required' : 'none'
      }
    },
    lock: args.lock,
    lease: args.lease,
    reads: args.reads,
    semanticWrites: args.semanticWrites ?? [],
    maintenanceWrites: args.maintenanceWrites ?? [],
    validation: args.validation ?? [],
    sideEffects: args.sideEffects ?? []
  }
}

export function planFoldPolicy(): ScryerOperationPolicy {
  const base = {
    lock: 'exclusive',
    reads: ['committed', 'planned'],
    semanticWrites: ['committed', 'planned'],
    maintenanceWrites: [
      { target: 'baseline', mode: 'best_effort' },
      { target: 'history', mode: 'best_effort' }
    ],
    validation: [
      'fold_postconditions',
      'link_legality',
      'group_integrity',
      'source_mapping_integrity'
    ],
    sideEffects: ['baseline_refresh', 'history_append']
  } satisfies Omit<PolicyArgs, 'lease'>
  return {
    discriminator: { inputField: 'mode', allowedValues: ['manual', 'agent_completion'] },
    branches: [
      {
        when: { inputField: 'mode', equals: 'manual' },
        policy: flatPolicy({ ...base, lease: 'write_if_active' })
      },
      {
        when: { inputField: 'mode', equals: 'agent_completion' },
        policy: flatPolicy({
          ...base,
          lease: 'completion_gate',
          agentRunRequired: true,
          sideEffects: ['baseline_refresh', 'history_append', 'completion_gate']
        })
      }
    ]
  }
}

export function metadataFor(
  id: ScryerOperationId,
  policy: ScryerOperationPolicy
): ScryerTransportMetadata {
  const transports =
    'branches' in policy
      ? policy.branches[0].policy.authorization.transports
      : policy.authorization.transports
  return {
    ...(transports.includes('cli')
      ? {
          cli: {
            command: id.replace(/^scryer\./, 'scryer ').replaceAll('.', ' '),
            acceptsJson: true
          }
        }
      : {}),
    ...(transports.includes('ipc')
      ? { ipc: { channel: 'architecture:executeScryerOperation', mode: 'invoke' as const } }
      : {}),
    ...(transports.includes('ui') ? { ui: { intent: id, surface: 'architecture' as const } } : {}),
    ...(transports.includes('agent') ? { agent: { operationName: id } } : {}),
    ...(transports.includes('system') ? { system: { operationName: id } } : {}),
    ...(transports.includes('test') ? { test: { enabled: true } } : {})
  }
}

export function sideEffectRequirements(effect: ScryerSideEffect): {
  maintenance?: ScryerMaintenanceWriteTarget
  read?: ScryerStateRead
  lease?: ScryerFlatOperationPolicy['lease']
} {
  switch (effect) {
    case 'history_append':
      return { maintenance: 'history' }
    case 'baseline_refresh':
      return { maintenance: 'baseline' }
    case 'sync_state_write':
    case 'seed_sync_if_absent':
      return { maintenance: 'sync' }
    case 'anchor_baseline_refresh':
    case 'write_anchor_baseline_if_absent':
      return { maintenance: 'anchor_baseline' }
    case 'silent_reanchor_committed_source_map':
      return { maintenance: 'committed_source_map_reanchor' }
    case 'build_edges_read':
      return { read: 'build_edges' }
    case 'completion_gate':
      return { lease: 'completion_gate' }
  }
}

export function flatPolicies(policy: ScryerOperationPolicy): ScryerFlatOperationPolicy[] {
  return 'branches' in policy ? policy.branches.map((branch) => branch.policy) : [policy]
}

export function metadataKeys(metadata: ScryerTransportMetadata): ScryerTransport[] {
  return Object.keys(metadata) as ScryerTransport[]
}
