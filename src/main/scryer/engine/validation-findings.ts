import type { ScryerValidationFinding } from './operation-results'
import { semanticPath } from './semantic-paths'

export function coverageGapFinding(directory: string, manifest: string): ScryerValidationFinding {
  return {
    code: 'coverage_gap',
    severity: 'warning',
    message: `Manifest directory ${directory} has no Scryer source coverage`,
    path: semanticPath.model(),
    details: { directory, manifest }
  }
}

export function coverageOverlapFinding(
  directory: string,
  containerIds: string[]
): ScryerValidationFinding {
  return {
    code: 'coverage_overlap',
    severity: 'warning',
    message: `Source directory ${directory} is mapped to multiple containers`,
    path: semanticPath.model(),
    details: { directory, containerIds }
  }
}

export function anchorRangeWarningFinding(args: {
  responsibilityId: string
  pattern: string
  symbol?: string
}): ScryerValidationFinding {
  return {
    code: 'anchor_range_warning',
    severity: 'warning',
    message: `Responsibility ${args.responsibilityId} uses a broad source range`,
    path: semanticPath.sourceMapResponsibility(args.responsibilityId),
    details: {
      responsibilityId: args.responsibilityId,
      pattern: args.pattern,
      ...(args.symbol ? { symbol: args.symbol } : {})
    }
  }
}

export function invalidDriftMarkerTransitionFinding(args: {
  entity: 'node' | 'responsibility' | 'property'
  id: string
  reason: 'vagrant_move' | 'missing_verdict' | 'stale_fold_without_target'
}): ScryerValidationFinding {
  return {
    code: 'invalid_drift_marker_transition',
    severity: 'error',
    message: `Invalid drift marker transition for ${args.entity} ${args.id}`,
    path: args.entity === 'node' ? semanticPath.node(args.id) : semanticPath.model(),
    details: { entity: args.entity, id: args.id, reason: args.reason }
  }
}
