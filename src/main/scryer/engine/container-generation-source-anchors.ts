import type { GeneratedSourceEntry } from './container-generation-identity'
import type { ScryModel, ScrySourceLocation } from './model'
import type { ScryerSourceRouter } from './operation-services'

export function planGeneratedSourceAnchors(args: {
  committed: ScryModel
  planned: ScryModel
  entries: GeneratedSourceEntry[]
  sourceRouter: ScryerSourceRouter
}): void {
  if (args.entries.length === 0) {
    return
  }
  const decisions = args.entries.map((entry) =>
    args.sourceRouter.routeSourceEntry({
      target:
        entry.kind === 'node'
          ? { kind: 'node', nodeId: entry.key }
          : { kind: 'responsibility', responsibilityId: entry.key },
      entry: entry.entry,
      committed: args.committed,
      planned: args.planned,
      // Generation writes both state layers, unlike ordinary planned-only
      // authoring, so routing begins at committed state before mirroring.
      targetLayer: 'committed'
    })
  )
  const routed = args.sourceRouter.applySourceRoutes({
    committed: args.committed,
    planned: args.planned,
    decisions
  })
  args.committed.sourceMap = routed.committed.sourceMap
  args.committed.boundaries = routed.committed.boundaries
  args.planned.sourceMap = routed.planned.sourceMap
  args.planned.boundaries = routed.planned.boundaries

  for (const entry of args.entries) {
    args.planned.sourceMap[entry.key] = JSON.parse(
      JSON.stringify(entry.entry)
    ) as ScrySourceLocation[]
  }
}
