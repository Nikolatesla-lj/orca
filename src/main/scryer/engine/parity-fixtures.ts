import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ALL_SCRYER_OPERATION_IDS } from './catalog'
import type { ScryerOperationResult } from './types'

const operationIdSchema = z.enum(ALL_SCRYER_OPERATION_IDS)

// Provenance is the honest grade of a fixture's expected state:
// - upstream_parity: reproduces an independently-observed upstream (Rust) result and
//   therefore MUST cite a real upstream revision the reader could check out.
// - local_regression: an Orca-only deterministic regression whose expected state we
//   cannot independently derive from upstream (e.g. #69 anchor-corrected generation).
export const parityProvenanceSchema = z.enum(['upstream_parity', 'local_regression'])
export type ScryerParityProvenance = z.infer<typeof parityProvenanceSchema>

const REAL_UPSTREAM_REVISION = /^[0-9a-f]{40}$/

// A placeholder revision proves nothing: an all-zero or short/non-hex string cannot
// be checked out, so it can never back an upstream-parity claim.
export function isPlaceholderUpstreamRevision(commit: string | undefined): boolean {
  return !commit || !REAL_UPSTREAM_REVISION.test(commit) || /^0+$/.test(commit)
}

const parityFixtureShape = z
  .object({
    operationId: operationIdSchema,
    provenance: parityProvenanceSchema,
    // Optional now: only upstream_parity requires a real revision (checked below).
    upstreamCommit: z.string().optional(),
    upstreamAnchors: z.array(z.string().min(1)).min(1),
    input: z.unknown(),
    context: z.record(z.string(), z.unknown()).default({}),
    expected: z.union([z.literal('success'), z.literal('failure')]),
    // The Orca-specific difference from the Rust reference. Required for both grades
    // so every fixture documents why its expected state is what it is.
    orcaDifferenceReason: z.string().min(1),
    // Documents why the expected state cannot be traced to an upstream revision and is
    // therefore recorded as an Orca-only regression.
    localRegressionReason: z.string().min(1).optional(),
    result: z.unknown().optional(),
    goldenState: z.record(z.string(), z.unknown()).optional()
  })
  .strict()

export const parityFixtureSchema = parityFixtureShape.superRefine((fixture, ctx) => {
  if (fixture.provenance === 'upstream_parity') {
    if (isPlaceholderUpstreamRevision(fixture.upstreamCommit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upstreamCommit'],
        message:
          'upstream_parity requires a real 40-char upstream revision; a placeholder/all-zero commit cannot prove upstream parity and must be recorded as local_regression'
      })
    }
    return
  }
  // local_regression: must document the Orca-only expected state so it is never
  // silently mistaken for an independently-verified upstream result.
  if (!fixture.localRegressionReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['localRegressionReason'],
      message:
        'local_regression requires localRegressionReason documenting the Orca-only expected state'
    })
  }
})

export type ScryerParityFixture = z.infer<typeof parityFixtureSchema>

export async function loadParityFixture(filePath: string): Promise<ScryerParityFixture> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  return parityFixtureSchema.parse(parsed)
}

function scrubString(value: string): string {
  const tempRoot = resolve('/tmp')
  if (value.startsWith(tempRoot)) {
    return '<tmp-path>'
  }
  if (value.startsWith('/')) {
    return '<abs-path>'
  }
  if (/^req-[A-Za-z0-9_-]+$/.test(value) || /^scryer-[A-Za-z0-9_-]+$/.test(value)) {
    return '<request-id>'
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return '<timestamp>'
  }
  return value
}

export function scrubParityValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return scrubString(value)
  }
  if (Array.isArray(value)) {
    return value.map(scrubParityValue)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'requestId' || key === 'timestamp' || key === 'reconciledAt'
          ? `<${key}>`
          : scrubParityValue(item)
      ])
    )
  }
  return value
}

export function assertParityEnvelopeShape(
  fixture: ScryerParityFixture,
  result: ScryerOperationResult
): void {
  if (fixture.expected === 'success' && result.ok !== true) {
    throw new Error(`Parity fixture ${fixture.operationId} expected ok:true`)
  }
  if (fixture.expected === 'failure' && result.ok !== false) {
    throw new Error(`Parity fixture ${fixture.operationId} expected ok:false`)
  }
}
