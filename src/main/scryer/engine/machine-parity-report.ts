import { isUnimplementedExecutor } from './catalog'
import { flatPolicies } from './catalog-policy'
import type { ScryerOperationContract } from './operation-contracts'
import type { ScryerOperationId } from './operation-identifiers'
import {
  MATURITY_LEVELS,
  type MachineParityInputs,
  type MachineParityReport,
  type MaturityLevel,
  type ParityEvidence,
  type ParityFailure,
  type ParityMaturity,
  type ParityRow
} from './machine-parity-contracts'

// A schema "constrains" when it rejects primitives no operation input/success would
// ever accept. This distinguishes a real zod schema from a `z.unknown()`/`z.any()`
// pass-through without executing anything.
function schemaConstrains(schema: { safeParse(value: unknown): { success: boolean } }): boolean {
  return (
    schema.safeParse(-987654321).success === false &&
    schema.safeParse('__scryer_parity_probe__').success === false &&
    schema.safeParse(true).success === false
  )
}

function policyDeclared(contract: ScryerOperationContract<unknown, unknown>): boolean {
  const flats = flatPolicies(contract.policy)
  return (
    flats.length > 0 &&
    flats.every(
      (policy) =>
        typeof policy.lock === 'string' &&
        policy.lock.length > 0 &&
        typeof policy.lease === 'string' &&
        Array.isArray(policy.reads) &&
        Array.isArray(policy.semanticWrites) &&
        Array.isArray(policy.maintenanceWrites)
    )
  )
}

function ownershipDeclared(contract: ScryerOperationContract<unknown, unknown>): boolean {
  return (
    contract.upstream.length > 0 &&
    contract.upstream.every(
      (anchor) => typeof anchor.symbol === 'string' && anchor.symbol.trim().length > 0
    )
  )
}

function evidence(
  category: ParityEvidence['category'],
  required: boolean,
  present: boolean,
  detail: string,
  expectedLocation: string
): ParityEvidence {
  return { category, required, present, detail, expectedLocation }
}

function highestMaturity(maturity: ParityMaturity): MaturityLevel {
  let highest: MaturityLevel = 'declared'
  for (const level of MATURITY_LEVELS) {
    if (maturity[level]) {
      highest = level
    }
  }
  return highest
}

function evaluateContract(
  contract: ScryerOperationContract<unknown, unknown>,
  inputs: MachineParityInputs
): ParityRow {
  const support = contract.support
  const cliCommand = contract.transports.cli?.command
  const cliTransport = support?.transports.includes('cli') ?? false
  const realExecutor = !isUnimplementedExecutor(contract.execute)

  const cliPresent = !cliTransport
    ? true
    : cliCommand !== undefined &&
      inputs.cliHandlerKeys.has(cliCommand) &&
      inputs.cliSpecPaths.has(cliCommand)

  const ipcPresent =
    support?.ipc.supported === true
      ? support.ipc.channel.length > 0
      : support?.ipc.supported === false
        ? support.ipc.waiver.length > 0
        : false

  const productIntegrated = support?.ui.status === 'product_integrated'

  const ev: ParityEvidence[] = [
    evidence(
      'input_schema',
      true,
      schemaConstrains(contract.inputSchema),
      'strict input schema constrains the payload',
      'operation-schemas.ts input entry'
    ),
    evidence(
      'success_schema',
      true,
      schemaConstrains(contract.successSchema),
      'strict success schema constrains the result',
      'operation-schemas.ts success entry'
    ),
    evidence(
      'executor',
      true,
      realExecutor,
      realExecutor ? 'wired to a real executor' : 'placeholder/unimplemented executor',
      'catalog-*-rows.ts execute (or an explicit unimplemented waiver)'
    ),
    evidence(
      'policy',
      true,
      policyDeclared(contract),
      'explicit lock/lease/write policy declared',
      'catalog-*-rows.ts policy'
    ),
    evidence(
      'cli_mapping',
      cliTransport,
      cliPresent,
      cliTransport
        ? `CLI command "${cliCommand ?? '<none>'}" mapped to a handler + spec`
        : 'no CLI transport declared (n/a)',
      'src/cli/handlers/scryer.ts + src/cli/specs/scryer*.ts'
    ),
    evidence(
      'ipc_support',
      true,
      ipcPresent,
      ipcPresent ? 'generic IPC channel or explicit transport waiver' : 'no IPC support declared',
      'catalog-transport-support.ts ipc'
    ),
    evidence(
      'ownership',
      true,
      ownershipDeclared(contract),
      'upstream ownership anchors declared',
      'catalog-*-rows.ts upstream'
    ),
    evidence(
      'contract_callsite',
      true,
      inputs.callSiteOps.has(contract.id) || inputs.goldenOps.has(contract.id),
      'real dispatch/contract call-site or zod-validated golden',
      'a product dispatch site (CLI/IPC/renderer) or a parity golden fixture'
    ),
    evidence(
      'no_legacy_fallback',
      true,
      realExecutor,
      realExecutor ? 'no generic not-implemented fallback in effect' : 'generic fallback in effect',
      'catalog.ts unimplemented() fallback'
    ),
    evidence(
      'product_entry',
      false,
      productIntegrated,
      support ? `UI status: ${support.ui.status}` : 'no support metadata',
      'catalog-transport-support.ts ui (product entry or waiver)'
    ),
    evidence(
      'golden',
      false,
      inputs.goldenOps.has(contract.id),
      'zod-validated parity golden fixture present',
      '__fixtures__/local-regression|upstream-parity/<op>/**/case.json'
    ),
    evidence('landed', false, false, 'not landed on a local branch', 'merged release build')
  ]

  const has = (category: ParityEvidence['category']): boolean =>
    ev.find((item) => item.category === category)?.present ?? false

  const engineExecutable =
    has('input_schema') && has('success_schema') && has('executor') && has('policy')
  const adapterVerified =
    engineExecutable &&
    has('cli_mapping') &&
    has('ipc_support') &&
    has('ownership') &&
    has('contract_callsite') &&
    has('no_legacy_fallback')
  const maturity: ParityMaturity = {
    declared: true,
    engine_executable: engineExecutable,
    adapter_verified: adapterVerified,
    product_integrated: adapterVerified && has('product_entry'),
    landed: false
  }

  return {
    operationId: contract.id,
    evidence: ev,
    maturity,
    highestMaturity: highestMaturity(maturity),
    missingRequired: ev.filter((item) => item.required && !item.present)
  }
}

function catalogCompletenessFailures(inputs: MachineParityInputs): ParityFailure[] {
  const cataloged = new Set(inputs.contracts.map((contract) => contract.id))
  const expected = new Set(inputs.expectedOperationIds)
  const failures: ParityFailure[] = []
  for (const id of expected) {
    if (!cataloged.has(id)) {
      failures.push({
        operationId: id,
        category: 'catalog_completeness',
        detail: `${id} is cataloged in ALL_SCRYER_OPERATION_IDS but not registered as a contract`,
        expectedLocation: 'catalog-*-rows.ts'
      })
    }
  }
  for (const id of cataloged) {
    if (!expected.has(id)) {
      failures.push({
        operationId: id,
        category: 'catalog_completeness',
        detail: `${id} is registered but not listed in ALL_SCRYER_OPERATION_IDS`,
        expectedLocation: 'catalog-operation-ids.ts'
      })
    }
  }
  return failures
}

// Derives the machine-parity report strictly from the cataloged contracts. Callers
// supply the real CLI/IPC/call-site/golden indices (collected statically) so the gate
// never hard-codes counts.
export function deriveMachineParityReport(inputs: MachineParityInputs): MachineParityReport {
  const rows = inputs.contracts.map((contract) => evaluateContract(contract, inputs))
  const failures: ParityFailure[] = [...catalogCompletenessFailures(inputs)]
  for (const row of rows) {
    for (const missing of row.missingRequired) {
      failures.push({
        operationId: row.operationId,
        category: missing.category,
        detail: missing.detail,
        expectedLocation: missing.expectedLocation
      })
    }
  }
  return {
    rows,
    operationIds: rows.map((row) => row.operationId) as ScryerOperationId[],
    ok: failures.length === 0,
    failures
  }
}
