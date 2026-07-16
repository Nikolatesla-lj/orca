import type { C4ModelData, DriftReport } from '../../shared/scryer/model-types'
import { serializeModelForPrompt, syncPrompt } from '../../shared/scryer/prompts'
import { checkDrift } from './drift'
import type { CompletionGateResult } from './edit-session-gate'
import {
  clearPreSyncSnapshot,
  markSynced,
  readModel,
  readPreSyncSnapshot,
  setImplementing,
  writeModel,
  writePreSyncSnapshot
} from './model-store'

export type BeginSyncResult = {
  prompt: string
  drift: DriftReport
  snapshot: C4ModelData
}

const completionGatesByProject = new Map<string, CompletionGateResult>()
const ATTENTION_ACTIONS = new Set(['fix_validation', 'manual_review', 'blocked_by_lease'])

function isSuccessfulCompletionGate(gate: CompletionGateResult): boolean {
  return (
    (gate.outcome === 'folded' || gate.outcome === 'nothing_to_fold') &&
    !ATTENTION_ACTIONS.has(gate.nextAction) &&
    gate.leaseDisposition === 'released_after_completion'
  )
}

export function recordSyncCompletionGate(projectPath: string, gate: CompletionGateResult): void {
  const current = completionGatesByProject.get(projectPath)
  if (current && isSuccessfulCompletionGate(current)) {
    return
  }
  completionGatesByProject.set(projectPath, gate)
}

function requireSuccessfulCompletionGate(projectPath: string): CompletionGateResult {
  const gate = completionGatesByProject.get(projectPath)
  if (!gate) {
    throw new Error('No Scryer completion gate result is available for this sync.')
  }
  if (
    gate.outcome === 'needs_attention' ||
    ATTENTION_ACTIONS.has(gate.nextAction) ||
    (gate.outcome !== 'folded' && gate.outcome !== 'nothing_to_fold')
  ) {
    throw new Error(`Scryer completion gate requires '${gate.nextAction}' before sync can finish.`)
  }
  if (gate.leaseDisposition !== 'released_after_completion') {
    throw new Error('Scryer completion gate did not release the active edit lease.')
  }
  return gate
}

export async function beginSync(
  projectPath: string,
  options?: { modelName?: string }
): Promise<BeginSyncResult> {
  completionGatesByProject.delete(projectPath)
  const [model, drift] = await Promise.all([readModel(projectPath), checkDrift(projectPath)])
  await writePreSyncSnapshot(projectPath, model)
  await setImplementing(projectPath, true)
  return {
    prompt: syncPrompt({
      modelName: options?.modelName ?? 'Architecture',
      cwd: projectPath,
      drift,
      modelJson: serializeModelForPrompt(model)
    }),
    drift,
    snapshot: model
  }
}

export async function cancelSync(projectPath: string): Promise<C4ModelData> {
  const snapshot = await readPreSyncSnapshot(projectPath)
  if (!snapshot) {
    completionGatesByProject.delete(projectPath)
    await setImplementing(projectPath, false)
    throw new Error('No pre-sync architecture snapshot found.')
  }
  await writeModel(projectPath, snapshot)
  await clearPreSyncSnapshot(projectPath)
  await setImplementing(projectPath, false)
  completionGatesByProject.delete(projectPath)
  return snapshot
}

export async function finishSync(projectPath: string): Promise<void> {
  requireSuccessfulCompletionGate(projectPath)
  await markSynced(projectPath)
  await clearPreSyncSnapshot(projectPath)
  await setImplementing(projectPath, false)
  completionGatesByProject.delete(projectPath)
}
