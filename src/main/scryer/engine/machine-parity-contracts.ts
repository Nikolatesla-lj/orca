import type { ScryerOperationContract } from './operation-contracts'
import type { ScryerOperationId } from './operation-identifiers'

// Maturity is reported as a monotone ladder. Each rung is honest and independently
// evaluated; `landed` is always false on a local branch.
export const MATURITY_LEVELS = [
  'declared',
  'engine_executable',
  'adapter_verified',
  'product_integrated',
  'landed'
] as const
export type MaturityLevel = (typeof MATURITY_LEVELS)[number]

export type ParityEvidenceCategory =
  | 'input_schema'
  | 'success_schema'
  | 'executor'
  | 'policy'
  | 'cli_mapping'
  | 'ipc_support'
  | 'ownership'
  | 'contract_callsite'
  | 'no_legacy_fallback'
  | 'product_entry'
  | 'golden'
  | 'landed'

export type ParityEvidence = {
  category: ParityEvidenceCategory
  // required=true means the current stage must satisfy it (missing => gate failure);
  // required=false is report-only maturity tracking (product_entry, golden, landed).
  required: boolean
  present: boolean
  detail: string
  // Where to add/repair the evidence when it is missing.
  expectedLocation: string
}

export type ParityMaturity = Record<MaturityLevel, boolean>

export type ParityFailure = {
  operationId: ScryerOperationId | string
  category: ParityEvidenceCategory | 'catalog_completeness'
  detail: string
  expectedLocation: string
}

export type ParityRow = {
  operationId: ScryerOperationId
  evidence: ParityEvidence[]
  maturity: ParityMaturity
  highestMaturity: MaturityLevel
  missingRequired: ParityEvidence[]
}

export type MachineParityReport = {
  rows: ParityRow[]
  operationIds: ScryerOperationId[]
  ok: boolean
  failures: ParityFailure[]
}

export type MachineParityInputs = {
  // Rows are derived ONLY from these cataloged contracts (catalog is the single source).
  contracts: ScryerOperationContract<unknown, unknown>[]
  // The exact cataloged id set the gate must enumerate (completeness check).
  expectedOperationIds: readonly ScryerOperationId[]
  // Precise CLI adapter sets, discovered statically (not hard-coded counts).
  cliHandlerKeys: ReadonlySet<string>
  cliSpecPaths: ReadonlySet<string>
  // Operations with a real dispatch/contract call-site outside the gate & declaration sites.
  callSiteOps: ReadonlySet<string>
  // Operations backed by a zod-validated parity golden fixture.
  goldenOps: ReadonlySet<string>
}
