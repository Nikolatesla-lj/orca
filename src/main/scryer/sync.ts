import type { C4ModelData, DriftReport } from '../../shared/scryer/model-types'
import { parseModelData } from '../../shared/scryer/parse-model'
import { serializeModelForPrompt, syncPrompt } from '../../shared/scryer/prompts'
import { readDriftReport } from './architecture-drift-report'
import type { CompletionGateResult } from './edit-session-gate'
import { createScryerEngine } from './engine'
import {
  clearPreSyncSnapshot,
  hasPreSyncSnapshot,
  markSynced,
  setImplementing,
  writePreSyncSnapshot
} from './model-store'

export type BeginSyncResult = {
  prompt: string
  drift: DriftReport
}

const syncEngine = createScryerEngine()

function syncContext(projectPath: string) {
  return {
    requestId: `sync-${Date.now()}`,
    transport: 'ipc' as const,
    caller: 'human' as const,
    cwd: projectPath,
    projectRoot: projectPath
  }
}

// Why: sync reads the committed architecture through the Engine seam (never the legacy
// readModel), then adapts the strict 0.3 model into the C4 shape the prompt serializer
// expects. This is prompt/snapshot maintenance, not legacy semantic ownership.
async function readCommittedArchitectureModel(projectPath: string): Promise<C4ModelData> {
  const view = await syncEngine.readView(
    { layer: 'committed', view: 'full' },
    syncContext(projectPath)
  )
  if (!view.ok) {
    throw new Error(view.error.message)
  }
  const model = view.result.view === 'full' ? view.result.model : null
  if (!model) {
    throw new Error('Scryer readView did not return a full model for architecture sync')
  }
  return { ...parseModelData(JSON.stringify(model)), projectPath }
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

// Why: the completion gate result is the only durable signal of a retained,
// attention-blocked sync (main keeps implementing + snapshot open). Exposing it lets
// the renderer re-derive an attention terminal after its local state is lost on a panel
// remount, instead of misreading the still-open session as a running spinner.
export function readSyncCompletionGate(projectPath: string): CompletionGateResult | null {
  return completionGatesByProject.get(projectPath) ?? null
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
  const [model, drift] = await Promise.all([
    readCommittedArchitectureModel(projectPath),
    readDriftReport(syncEngine, syncContext(projectPath))
  ])
  await writePreSyncSnapshot(projectPath, model)
  await setImplementing(projectPath, true)
  return {
    prompt: syncPrompt({
      modelName: options?.modelName ?? 'Architecture',
      cwd: projectPath,
      drift,
      modelJson: serializeModelForPrompt(model)
    }),
    drift
  }
}

// Why: cancelling a sync tears down the sync sentinel and implementing flag only. It does
// NOT restore the committed model through a legacy writer — the sync agent's edits live in
// the plan layer behind its edit-session lease, and cancelling that session (#70) discards
// them. There is nothing for cancelSync to roll back on the committed model.
export async function cancelSync(projectPath: string): Promise<void> {
  const hadSnapshot = hasPreSyncSnapshot(projectPath)
  await clearPreSyncSnapshot(projectPath)
  await setImplementing(projectPath, false)
  completionGatesByProject.delete(projectPath)
  if (!hadSnapshot) {
    throw new Error('No pre-sync architecture snapshot found.')
  }
}

export async function finishSync(projectPath: string): Promise<void> {
  requireSuccessfulCompletionGate(projectPath)
  await markSynced(projectPath)
  await clearPreSyncSnapshot(projectPath)
  await setImplementing(projectPath, false)
  completionGatesByProject.delete(projectPath)
}
