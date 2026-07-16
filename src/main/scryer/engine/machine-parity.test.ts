import { beforeAll, describe, expect, it } from 'vitest'
import { ALL_SCRYER_OPERATION_IDS } from './catalog'
import type { MachineParityInputs, MachineParityReport } from './machine-parity-contracts'
import { collectDefaultMachineParityInputs } from './machine-parity-inputs'
import { deriveMachineParityReport } from './machine-parity-report'

// The 12 operations with a genuine product entry (11 canvas write ops + the read path
// that backs the whole Architecture view). Everything else is honestly UI-waived or,
// for scryer.container.fill, tracked as planned (#73).
const PRODUCT_INTEGRATED_IDS = new Set([
  'scryer.model.read',
  'scryer.node.update',
  'scryer.link.add',
  'scryer.link.update',
  'scryer.link.delete',
  'scryer.node.delete',
  'scryer.group.set',
  'scryer.group.update',
  'scryer.group.delete',
  'scryer.group.add',
  'scryer.symbol.add',
  'scryer.source.update'
])

describe('Scryer 33-operation machine-parity gate', () => {
  let inputs: MachineParityInputs
  let report: MachineParityReport

  beforeAll(async () => {
    inputs = await collectDefaultMachineParityInputs()
    report = deriveMachineParityReport(inputs)
  })

  it('enumerates exactly the 33 cataloged operation ids in catalog order', () => {
    expect(report.rows).toHaveLength(33)
    expect(report.operationIds).toEqual([...ALL_SCRYER_OPERATION_IDS])
  })

  it('passes with every required evidence category present for all 33 rows', () => {
    // On failure, surface operation id + missing category + expected location.
    expect(report.failures).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('grades every operation at least adapter-verified today', () => {
    for (const row of report.rows) {
      expect(row.maturity.engine_executable, `${row.operationId} should be engine-executable`).toBe(
        true
      )
      expect(row.maturity.adapter_verified, `${row.operationId} should be adapter-verified`).toBe(
        true
      )
    }
  })

  it('marks product-integrated maturity only for operations with a real product entry', () => {
    for (const row of report.rows) {
      expect(
        row.maturity.product_integrated,
        `${row.operationId} product_integrated should be ${PRODUCT_INTEGRATED_IDS.has(row.operationId)}`
      ).toBe(PRODUCT_INTEGRATED_IDS.has(row.operationId))
    }
  })

  it('honestly reports scryer.container.fill as engine-executable/adapter-verified but NOT product-integrated', () => {
    const fill = report.rows.find((row) => row.operationId === 'scryer.container.fill')
    expect(fill).toBeDefined()
    expect(fill!.maturity.engine_executable).toBe(true)
    expect(fill!.maturity.adapter_verified).toBe(true)
    expect(fill!.maturity.product_integrated).toBe(false)
    expect(fill!.highestMaturity).toBe('adapter_verified')
    const productEntry = fill!.evidence.find((item) => item.category === 'product_entry')
    expect(productEntry!.present).toBe(false)
    expect(productEntry!.detail).toContain('planned')
  })

  it('never marks any operation as landed on a local branch', () => {
    for (const row of report.rows) {
      expect(row.maturity.landed).toBe(false)
    }
  })

  it('maps every CLI-transport operation to a real handler AND command spec', () => {
    for (const row of report.rows) {
      const cli = row.evidence.find((item) => item.category === 'cli_mapping')!
      expect(cli.present, `${row.operationId} CLI mapping: ${cli.detail}`).toBe(true)
    }
    // Precise set comparison, not a hard-coded count.
    expect(inputs.cliHandlerKeys.size).toBe(33)
    expect(inputs.cliSpecPaths.size).toBe(33)
  })

  it('backs both golden fixtures and treats them as report-only evidence', () => {
    expect([...inputs.goldenOps].sort()).toEqual(['scryer.container.fill', 'scryer.model.set'])
    for (const row of report.rows) {
      const golden = row.evidence.find((item) => item.category === 'golden')!
      expect(golden.required).toBe(false)
    }
  })
})
