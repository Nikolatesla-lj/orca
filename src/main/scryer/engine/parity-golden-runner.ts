import { existsSync } from 'fs'
import { cp, mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createScryerEngine } from './index'
import type { ScryModel } from './model'
import { loadParityFixture, type ScryerParityFixture } from './parity-fixtures'
import type { ScryerOperationContext, ScryerOperationResult } from './types'

export type ParityGoldenOutcome = {
  fixture: ScryerParityFixture
  result: ScryerOperationResult
  model: ScryModel | null
  planned: ScryModel | null
}

async function readOptionalModel(path: string): Promise<ScryModel | null> {
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as ScryModel) : null
}

// Seeds a fresh temp project from the case's `project/` tree, runs the operation
// through the engine, and returns the envelope plus the final committed/planned
// `.scryer` state for golden comparison. Deterministic clock/request ids keep
// generated timestamps and request ids stable across runs.
export async function runParityGoldenCase(caseDir: string): Promise<ParityGoldenOutcome> {
  const fixture = await loadParityFixture(join(caseDir, 'case.json'))
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-parity-golden-'))
  await cp(join(caseDir, 'project'), projectPath, { recursive: true })
  const context: ScryerOperationContext = {
    requestId: 'req-parity',
    transport: 'cli',
    caller: 'human',
    cwd: projectPath,
    projectRoot: projectPath,
    ...(fixture.context as Partial<ScryerOperationContext>)
  }
  const engine = createScryerEngine({
    clock: { nowIso: () => '2026-07-13T00:00:00.000Z' },
    requestIds: { next: () => 'scryer-parity' }
  })
  const result = await engine.executeOperation(fixture.operationId, fixture.input, context)
  return {
    fixture,
    result,
    model: await readOptionalModel(join(projectPath, '.scryer', 'model.scry')),
    planned: await readOptionalModel(join(projectPath, '.scryer', 'planned.scry'))
  }
}

export async function loadParityExpected(caseDir: string, file: string): Promise<unknown> {
  const path = join(caseDir, 'expected', file)
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as unknown) : null
}
