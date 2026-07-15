import type {
  ScryerContainerFillCreatedGroup,
  ScryerContainerFillInput,
  ScryerContainerFillResult
} from './container-generation-contracts'
import type { GeneratedSubtreeIdentity } from './container-generation-identity'
import type { GeneratedRelationships } from './container-generation-relationships'
import type { ScryModel } from './model'
import type { ScryerExecutorResult, ScryerValidationFinding } from './operation-results'
import type { ScryerClock, ScryerHistoryEvent } from './operation-state-contracts'

export function planContainerGenerationResult(args: {
  input: ScryerContainerFillInput
  build: GeneratedSubtreeIdentity
  groups: ScryerContainerFillCreatedGroup[]
  links: GeneratedRelationships
  findings: ScryerValidationFinding[]
}): ScryerContainerFillResult {
  return {
    commit: { committedWritten: true, plannedMirrored: true, baselineRefreshed: false },
    summary: {
      containerId: args.input.container_id,
      components: args.build.created.length,
      symbols: args.build.createdSymbols.length,
      groups: args.groups.length,
      derivedLinks: args.links.derivedCount,
      keptLinks: args.links.keptAgentCount,
      droppedLinks: args.links.dropped.length,
      sourceAnchors: args.build.sourceEntries.length
    },
    created: {
      components: args.build.created,
      symbols: args.build.createdSymbols,
      groups: args.groups
    },
    reports: {
      droppedLinks: args.links.dropped,
      edgeGraphStatus: args.links.edgeGraphStatus,
      thinSymbolCount: args.build.thinSymbolCount,
      findings: args.findings
    },
    recommendedNextReads: [
      {
        operationId: 'scryer.model.read',
        input: { view: 'subtree', node: args.input.container_id, layer: 'plan' },
        reason: 'Inspect the generated container subtree'
      }
    ]
  }
}

export function planContainerGenerationHistory(args: {
  created: GeneratedSubtreeIdentity['created']
  clock: ScryerClock
}): ScryerHistoryEvent[] {
  const at = args.clock.nowIso()
  return args.created.map((component) => {
    const responsibilities = component.responsibilityIds.length
    const symbols = component.symbolIds.length
    const text = `${responsibilities} ${responsibilities === 1 ? 'responsibility' : 'responsibilities'} · ${symbols} ${symbols === 1 ? 'symbol' : 'symbols'} · component`
    return {
      at,
      kind: 'born',
      nodeId: component.id,
      driver: 'build',
      rows: [{ op: '+', text }]
    }
  })
}

export function completeContainerGeneration(args: {
  result: ScryerContainerFillResult
  committed: ScryModel
  planned: ScryModel
  historyEvents: ScryerHistoryEvent[]
}): ScryerExecutorResult<ScryerContainerFillResult> {
  return {
    ok: true,
    outcome: {
      result: args.result,
      changes: {
        committed: args.committed,
        planned: args.planned,
        // Atomic generation defers baseline and drift reconciliation to later
        // lifecycle operations; history remains the only declared sidecar.
        ...(args.historyEvents.length > 0 ? { historyEvents: args.historyEvents } : {})
      }
    }
  }
}
