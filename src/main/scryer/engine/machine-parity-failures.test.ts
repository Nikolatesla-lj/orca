import { beforeAll, describe, expect, it } from 'vitest'
import { createUnimplementedExecutor } from './catalog'
import type { ScryerOperationContract, ScryerOperationSupport } from './operation-contracts'
import type {
  MachineParityInputs,
  ParityEvidenceCategory,
  ParityFailure
} from './machine-parity-contracts'
import { collectDefaultMachineParityInputs } from './machine-parity-inputs'
import { deriveMachineParityReport } from './machine-parity-report'

type Contract = ScryerOperationContract<unknown, unknown>

const PASS_THROUGH_SCHEMA = {
  safeParse: (value: unknown) => ({ success: true as const, data: value })
}

function cloneInputs(base: MachineParityInputs): MachineParityInputs {
  return {
    ...base,
    contracts: [...base.contracts],
    cliHandlerKeys: new Set(base.cliHandlerKeys),
    cliSpecPaths: new Set(base.cliSpecPaths),
    callSiteOps: new Set(base.callSiteOps),
    goldenOps: new Set(base.goldenOps)
  }
}

function replaceContract(
  inputs: MachineParityInputs,
  operationId: string,
  patch: (contract: Contract) => Contract
): MachineParityInputs {
  const clone = cloneInputs(inputs)
  const index = clone.contracts.findIndex((contract) => contract.id === operationId)
  clone.contracts[index] = patch(clone.contracts[index]!)
  return clone
}

function failureFor(
  failures: ParityFailure[],
  operationId: string,
  category: ParityEvidenceCategory | 'catalog_completeness'
): ParityFailure | undefined {
  return failures.find((item) => item.operationId === operationId && item.category === category)
}

// Every synthetic case removes exactly one piece of required evidence and proves the
// gate fails with a precise (operation id + category + expected-location) diagnosis.
describe('machine-parity gate fails when required evidence is missing', () => {
  let base: MachineParityInputs

  beforeAll(async () => {
    base = await collectDefaultMachineParityInputs()
  })

  it('is green on the real catalog (control)', () => {
    expect(deriveMachineParityReport(base).ok).toBe(true)
  })

  it('fails on a pass-through (non-strict) input schema', () => {
    const inputs = replaceContract(base, 'scryer.link.add', (contract) => ({
      ...contract,
      inputSchema: PASS_THROUGH_SCHEMA
    }))
    const failure = failureFor(
      deriveMachineParityReport(inputs).failures,
      'scryer.link.add',
      'input_schema'
    )
    expect(failure).toBeDefined()
    expect(failure!.expectedLocation).toContain('operation-schemas.ts')
  })

  it('fails on a pass-through (non-strict) success schema', () => {
    const inputs = replaceContract(base, 'scryer.link.add', (contract) => ({
      ...contract,
      successSchema: PASS_THROUGH_SCHEMA
    }))
    expect(
      failureFor(deriveMachineParityReport(inputs).failures, 'scryer.link.add', 'success_schema')
    ).toBeDefined()
  })

  it('fails on a placeholder/unimplemented executor (executor + no_legacy_fallback)', () => {
    const inputs = replaceContract(base, 'scryer.node.update', (contract) => ({
      ...contract,
      execute: createUnimplementedExecutor('scryer.node.update')
    }))
    const failures = deriveMachineParityReport(inputs).failures
    expect(failureFor(failures, 'scryer.node.update', 'executor')).toBeDefined()
    expect(failureFor(failures, 'scryer.node.update', 'no_legacy_fallback')).toBeDefined()
  })

  it('fails on a policy that omits the lock', () => {
    const inputs = replaceContract(base, 'scryer.node.update', (contract) => ({
      ...contract,
      policy: {
        ...(contract.policy as Record<string, unknown>),
        lock: ''
      } as unknown as Contract['policy']
    }))
    expect(
      failureFor(deriveMachineParityReport(inputs).failures, 'scryer.node.update', 'policy')
    ).toBeDefined()
  })

  it('fails when a CLI-transport operation loses its handler mapping', () => {
    const inputs = cloneInputs(base)
    ;(inputs.cliHandlerKeys as Set<string>).delete('scryer model read')
    expect(
      failureFor(deriveMachineParityReport(inputs).failures, 'scryer.model.read', 'cli_mapping')
    ).toBeDefined()
  })

  it('fails when generic IPC support is neither present nor waived', () => {
    const inputs = replaceContract(base, 'scryer.drift.get', (contract) => ({
      ...contract,
      support: {
        ...(contract.support as ScryerOperationSupport),
        ipc: { supported: false, waiver: '' }
      }
    }))
    expect(
      failureFor(deriveMachineParityReport(inputs).failures, 'scryer.drift.get', 'ipc_support')
    ).toBeDefined()
  })

  it('fails when ownership anchors are missing', () => {
    const inputs = replaceContract(base, 'scryer.plan.fold', (contract) => ({
      ...contract,
      upstream: []
    }))
    expect(
      failureFor(deriveMachineParityReport(inputs).failures, 'scryer.plan.fold', 'ownership')
    ).toBeDefined()
  })

  it('fails when an operation has no real call-site or golden evidence', () => {
    const inputs = cloneInputs(base)
    ;(inputs.callSiteOps as Set<string>).delete('scryer.model.search')
    ;(inputs.goldenOps as Set<string>).delete('scryer.model.search')
    expect(
      failureFor(
        deriveMachineParityReport(inputs).failures,
        'scryer.model.search',
        'contract_callsite'
      )
    ).toBeDefined()
  })

  it('fails catalog completeness when a cataloged id has no contract', () => {
    const inputs = cloneInputs(base)
    inputs.contracts = inputs.contracts.filter(
      (contract) => contract.id !== 'scryer.drift.reconcile'
    )
    const failure = failureFor(
      deriveMachineParityReport(inputs).failures,
      'scryer.drift.reconcile',
      'catalog_completeness'
    )
    expect(failure).toBeDefined()
    expect(deriveMachineParityReport(inputs).rows).toHaveLength(32)
  })
})
