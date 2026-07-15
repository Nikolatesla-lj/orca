import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ScryerEngineError } from './engine-error'
import type { ScryModel } from './model'
import type { ScryerPaths } from './paths'
import {
  atomicWriteStateFile,
  readOptionalStateFile,
  restoreStateFile,
  serializeScryerModel,
  stateIoDetails
} from './state-model-files'
import type {
  ScryerBestEffortCommitItem,
  ScryerPrimaryCommitItem,
  ScryerStateCommitPlan,
  ScryerStateCommitResult,
  StateStoreFailureInjection
} from './state-store-contracts'
import type { ScryerOperationWarning } from './types'

function targetPath(paths: ScryerPaths, target: ScryerPrimaryCommitItem['target']): string {
  switch (target) {
    case 'planned':
      return paths.plannedPath
    case 'committed':
      return paths.modelPath
    case 'sync':
      return paths.syncPath
    case 'anchor_baseline':
      return paths.anchorBaselinePath
  }
}

async function writePrimary(
  paths: ScryerPaths,
  item: ScryerPrimaryCommitItem,
  failureInjection?: StateStoreFailureInjection
): Promise<void> {
  if (failureInjection?.failPrimaryTarget === item.target) {
    throw new Error(`Injected primary write failure for ${item.target}`)
  }
  switch (item.target) {
    case 'planned':
      await atomicWriteStateFile(paths.plannedPath, serializeScryerModel(item.model))
      break
    case 'committed':
      await atomicWriteStateFile(paths.modelPath, serializeScryerModel(item.model))
      break
    case 'sync':
      await atomicWriteStateFile(paths.syncPath, `${JSON.stringify(item.state, null, 2)}\n`)
      break
    case 'anchor_baseline':
      await atomicWriteStateFile(
        paths.anchorBaselinePath,
        `${JSON.stringify({ refreshedAt: Date.now() })}\n`
      )
      break
  }
}

async function writeBestEffort(
  paths: ScryerPaths,
  item: ScryerBestEffortCommitItem,
  committed: ScryModel | undefined,
  failureInjection?: StateStoreFailureInjection
): Promise<void> {
  if (failureInjection?.failBestEffortTarget === item.target) {
    throw new Error(`Injected best-effort write failure for ${item.target}`)
  }
  switch (item.target) {
    case 'history':
      await mkdir(dirname(paths.historyPath), { recursive: true })
      await writeFile(
        paths.historyPath,
        `${item.events.map((event) => JSON.stringify(event)).join('\n')}\n`,
        { encoding: 'utf8', flag: 'a' }
      )
      break
    case 'baseline':
      if (committed) {
        await atomicWriteStateFile(paths.baselinePath, serializeScryerModel(committed))
      }
      break
    case 'sync':
      await atomicWriteStateFile(paths.syncPath, `${JSON.stringify(item.state, null, 2)}\n`)
      break
    case 'anchor_baseline':
      await atomicWriteStateFile(
        paths.anchorBaselinePath,
        `${JSON.stringify({ refreshedAt: Date.now() })}\n`
      )
      break
    case 'committed_source_map_reanchor':
      if (committed) {
        await atomicWriteStateFile(paths.modelPath, serializeScryerModel(committed))
      }
      break
  }
}

export async function commitScryerStatePlan(args: {
  plan: ScryerStateCommitPlan
  paths: ScryerPaths
  failureInjection?: StateStoreFailureInjection
  readCommitted(): Promise<ScryModel>
}): Promise<ScryerStateCommitResult> {
  const backups = new Map<string, string | null>()
  const committed = args.plan.primary.find((item) => item.target === 'committed') as
    | { target: 'committed'; model: ScryModel }
    | undefined
  try {
    for (const item of args.plan.primary) {
      const path = targetPath(args.paths, item.target)
      if (!backups.has(path)) {
        backups.set(path, await readOptionalStateFile(path))
      }
      await writePrimary(args.paths, item, args.failureInjection)
    }
  } catch (error) {
    for (const [path, raw] of [...backups].toReversed()) {
      await restoreStateFile(path, raw).catch(() => undefined)
    }
    throw new ScryerEngineError(
      'io_error',
      `Failed to commit Scryer state for ${args.plan.operationId}`,
      stateIoDetails('model', 'write', args.paths.scryerDir, error)
    )
  }

  const warnings: ScryerOperationWarning[] = []
  const committedModel =
    committed?.model ?? (existsSync(args.paths.modelPath) ? await args.readCommitted() : undefined)
  for (const item of args.plan.bestEffort) {
    try {
      await writeBestEffort(args.paths, item, committedModel, args.failureInjection)
    } catch (error) {
      warnings.push({
        code: 'maintenance_write_failed',
        message: `Best-effort Scryer maintenance write failed for ${item.target}`,
        target: item.target,
        details: { cause: error instanceof Error ? error.message : String(error) }
      })
    }
  }
  return { warnings }
}
