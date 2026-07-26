import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertParityEnvelopeShape, scrubParityValue } from './parity-fixtures'
import { loadParityExpected, runParityGoldenCase } from './parity-golden-runner'

const FIXTURE_ROOT = join(process.cwd(), 'src/main/scryer/engine/__fixtures__/local-regression')

// Cross-cutting golden cases: whole-model replacement and atomic container
// generation. Both are graded as Orca-only deterministic regressions (their expected
// state cannot be traced to an independently reproduced upstream revision). Each seeds
// a project, runs the operation, and asserts the final committed/planned `.scryer`
// state and the structured envelope.
const GOLDEN_CASES = [
  'scryer.model.set/replace-whole-model',
  'scryer.container.fill/fill-empty-container'
]

describe('Scryer local-regression golden state', () => {
  for (const relativeCase of GOLDEN_CASES) {
    it(`reproduces golden committed/planned state for ${relativeCase}`, async () => {
      const caseDir = join(FIXTURE_ROOT, relativeCase)
      const outcome = await runParityGoldenCase(caseDir)

      assertParityEnvelopeShape(outcome.fixture, outcome.result)

      const expectedResult = await loadParityExpected(caseDir, 'result.json')
      if (expectedResult) {
        expect(scrubParityValue(outcome.result)).toMatchObject(expectedResult as object)
      }

      const expectedModel = await loadParityExpected(caseDir, 'model.scry')
      if (expectedModel) {
        expect(outcome.model).toEqual(expectedModel)
      }

      const expectedPlanned = await loadParityExpected(caseDir, 'planned.scry')
      if (expectedPlanned) {
        expect(outcome.planned).toEqual(expectedPlanned)
      }
    })
  }
})
