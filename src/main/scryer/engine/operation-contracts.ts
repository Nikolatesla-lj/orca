import type {
  ScryerMaintenanceWrite,
  ScryerOperationCapability,
  ScryerOperationErrorCode,
  ScryerOperationId,
  ScryerOperationLockPolicy,
  ScryerOperationRisk,
  ScryerOperationClass,
  ScryerOperationWriteScope,
  ScryerSemanticWrite,
  ScryerSideEffect,
  ScryerStateRead,
  ScryerTransport,
  ScryerValidationPolicy
} from './operation-identifiers'
import type {
  ScryerExecutorFailure,
  ScryerExecutorResult,
  ScryerFieldError,
  ScryerOperationError,
  ScryerOperationMeta,
  ScryerOperationResult
} from './operation-results'
import type { ScryerOperationServices } from './operation-services'
import type {
  ResolvedScryerProject,
  ScryerClock,
  ScryerLoadedState,
  ScryerOperationContext,
  ScryerRequestIdFactory,
  ScryerTrustedAgentIdentity
} from './operation-state-contracts'

export type ScryerOperationAuthorizationPolicy = {
  transports: [ScryerTransport, ...ScryerTransport[]]
  project: {
    containment: 'workspace_required' | 'resolved_project_only'
    allowProjectOverride: boolean
  }
  agentRun: {
    required: boolean
    bindToContext: 'none' | 'agent_run_id_required'
  }
}

export type ScryerFlatOperationPolicy = {
  authorization: ScryerOperationAuthorizationPolicy
  lock: ScryerOperationLockPolicy
  lease: 'none' | 'write_if_active' | 'completion_gate'
  reads: ScryerStateRead[]
  semanticWrites: ScryerSemanticWrite[]
  maintenanceWrites: ScryerMaintenanceWrite[]
  validation: ScryerValidationPolicy[]
  sideEffects: ScryerSideEffect[]
}

export type ScryerOperationPolicyBranch = {
  when: {
    inputField: string
    equals: string
  }
  policy: ScryerFlatOperationPolicy
}

export type ScryerBranchedOperationPolicy = {
  discriminator: {
    inputField: string
    allowedValues: [string, ...string[]]
  }
  branches: [ScryerOperationPolicyBranch, ...ScryerOperationPolicyBranch[]]
}

export type ScryerOperationPolicy = ScryerFlatOperationPolicy | ScryerBranchedOperationPolicy

export type ScryerTransportMetadata = {
  cli?: {
    command: string
    acceptsJson: boolean
    aliases?: string[]
  }
  ipc?: {
    channel: string
    mode: 'invoke' | 'send'
  }
  ui?: {
    intent: string
    surface?: 'architecture' | 'agent_run'
  }
  agent?: {
    operationName: string
  }
  system?: {
    operationName: string
  }
  test?: {
    enabled: boolean
  }
}

export type ScryerUpstreamAnchor = {
  file?: string
  symbol: string
}

// Explicit product-surface status for an operation, used by the machine-parity gate
// to grade maturity honestly instead of assuming every operation reaches every
// transport. `planned` marks an operation that is engine-executable and
// adapter-verified but not yet wired to a product entry (tracked separately from
// `landed`); `waived` marks an operation with no product-surface entry by design
// (CLI/agent/system only).
export type ScryerOperationUiSupport =
  | { status: 'product_integrated'; surface: string; productEntry: string }
  | { status: 'planned'; reason: string }
  | { status: 'waived'; reason: string }

export type ScryerOperationIpcSupport =
  | { supported: true; channel: string }
  | { supported: false; waiver: string }

export type ScryerOperationSupport = {
  // The transports this operation genuinely supports (not defaulted to all five).
  transports: [ScryerTransport, ...ScryerTransport[]]
  ipc: ScryerOperationIpcSupport
  ui: ScryerOperationUiSupport
}

export type ScryerOperationExecutor<TInput, TResult> = (args: {
  input: TInput
  context: ScryerOperationContext
  project: ResolvedScryerProject
  state: ScryerLoadedState
  services: ScryerOperationServices
}) => Promise<ScryerExecutorResult<TResult>> | ScryerExecutorResult<TResult>

export type ScryerOperationContract<TInput = unknown, TResult = unknown> = {
  id: ScryerOperationId
  capability: ScryerOperationCapability
  risk: ScryerOperationRisk
  operationClass?: ScryerOperationClass
  writeScope?: ScryerOperationWriteScope
  inputSchema: {
    safeParse(value: unknown): { success: true; data: TInput } | { success: false; error: unknown }
  }
  successSchema: {
    safeParse(value: unknown): { success: true; data: TResult } | { success: false; error: unknown }
  }
  errors: Partial<
    Record<
      ScryerOperationErrorCode,
      {
        safeParse(
          value: unknown
        ): { success: true; data: unknown } | { success: false; error: unknown }
      }
    >
  >
  policy: ScryerOperationPolicy
  upstream: ScryerUpstreamAnchor[]
  transports: ScryerTransportMetadata
  // Explicit, honest per-operation transport/UI support status. Additive metadata:
  // it does not change operation identity, ordering, schemas, or execution.
  support?: ScryerOperationSupport
  execute: ScryerOperationExecutor<TInput, TResult>
}

export type ScryerCatalogValidationError = {
  operationId?: ScryerOperationId
  code:
    | 'duplicate_operation_id'
    | 'missing_schema'
    | 'missing_error_schema'
    | 'invalid_policy'
    | 'invalid_policy_branch'
    | 'invalid_transport_metadata'
    | 'missing_upstream_anchor'
    | 'test_transport_not_allowed'
  message: string
}

export type ScryerCatalogValidationResult = {
  ok: boolean
  errors: ScryerCatalogValidationError[]
}

export type ScryerOperationCatalog = {
  registerOperation<TInput, TResult>(contract: ScryerOperationContract<TInput, TResult>): void
  getOperationContract(operationId: string): ScryerOperationContract<unknown, unknown> | undefined
  listOperationContracts(): ScryerOperationContract<unknown, unknown>[]
  validateCatalog(options?: { allowTestTransport?: boolean }): ScryerCatalogValidationResult
}

export type ScryerErrorMapper = {
  mapExecutorFailure(args: {
    contract: ScryerOperationContract<unknown, unknown>
    failure: ScryerExecutorFailure
  }): ScryerOperationError
  mapPipelineFailure(args: {
    code: ScryerOperationErrorCode
    message: string
    details?: Record<string, unknown>
    fieldErrors?: ScryerFieldError[]
    path?: string
    jsonPointer?: string
    retryable?: boolean
  }): ScryerOperationError
  mapStateStoreFailure(args: {
    code: ScryerOperationErrorCode
    message: string
    details?: Record<string, unknown>
    retryable?: boolean
  }): ScryerOperationError
  mapUnexpectedException(args: {
    error: unknown
    contractOperationId?: string
  }): ScryerOperationError
  toOperationResult<TResult>(
    args:
      | {
          ok: true
          operationId: ScryerOperationId | string
          requestId: string
          result: TResult
          meta?: ScryerOperationMeta
        }
      | {
          ok: false
          operationId: ScryerOperationId | string
          requestId: string
          error: ScryerOperationError
          meta?: ScryerOperationMeta
        }
  ): ScryerOperationResult<TResult>
}

export type CreateScryerEngineOptions = {
  catalog?: ScryerOperationCatalog
  stateStore?: unknown
  errorMapper?: ScryerErrorMapper
  clock?: ScryerClock
  requestIds?: ScryerRequestIdFactory
  trustedRuntimeIdentity?: {
    read(): ScryerTrustedAgentIdentity | null
  }
  test?: {
    allowTestTransport?: boolean
  }
}
