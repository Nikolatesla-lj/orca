import { containerGenerationSourceKey } from './container-generation-identity'
import type { ScryModel, ScryNode } from './model'
import type { ScryerContainerFillInput } from './container-generation-contracts'
import type {
  ScryerExecutorFailure,
  ScryerExecutorResult,
  ScryerValidationFinding
} from './operation-results'
import { semanticPath } from './semantic-paths'

// Snapshot findings that must block a durable write; anything else remains
// observable evidence in the successful generation report.
const BLOCKING_CODES = new Set<ScryerValidationFinding['code']>([
  'duplicate_id',
  'missing_reference',
  'invalid_hierarchy',
  'invalid_external',
  'illegal_link',
  'invalid_group',
  'unknown_source_map_target',
  'unknown_boundary_target'
])

export function failContainerGeneration(
  failure: ScryerExecutorFailure
): ScryerExecutorResult<never> {
  return { ok: false, failure }
}

export function invalidContainerGenerationProposal(
  message: string,
  findings: ScryerValidationFinding[]
): ScryerExecutorResult<never> {
  return failContainerGeneration({
    code: 'validation_failed',
    message,
    details: { reason: 'generation_proposal_invalid', findings }
  })
}

export function containerGenerationError(
  code: ScryerValidationFinding['code'],
  message: string,
  path: string,
  details?: Record<string, unknown>
): ScryerValidationFinding {
  return { code, severity: 'error', message, path, ...(details ? { details } : {}) }
}

function checkProposalKey(args: {
  key: string
  keys: Set<string>
  existingIds: Set<string>
  findings: ScryerValidationFinding[]
}): void {
  if (args.keys.has(args.key)) {
    args.findings.push(
      containerGenerationError(
        'duplicate_id',
        `Duplicate component/symbol key '${args.key}'`,
        semanticPath.model(),
        { key: args.key, reason: 'duplicate_local_key' }
      )
    )
  }
  args.keys.add(args.key)
  if (args.existingIds.has(args.key)) {
    args.findings.push(
      containerGenerationError(
        'duplicate_id',
        `Local key '${args.key}' conflicts with an existing model node id`,
        semanticPath.model(),
        { key: args.key, reason: 'local_key_conflicts_existing_id' }
      )
    )
  }
}

export function validateContainerGenerationProposal(args: {
  input: ScryerContainerFillInput
  container: ScryNode
  committed: ScryModel
  planned: ScryModel
}): ScryerExecutorResult<never> | null {
  const findings: ScryerValidationFinding[] = []

  if (args.container.kind !== 'container') {
    findings.push(
      containerGenerationError(
        'invalid_hierarchy',
        `Node '${args.container.id}' is not a container`,
        semanticPath.node(args.container.id),
        { nodeId: args.container.id, kind: args.container.kind, reason: 'not_a_container' }
      )
    )
    return invalidContainerGenerationProposal('container.fill target is not a container', findings)
  }

  // Effective-state emptiness spans both durable layers: a container is "non-empty"
  // if either the committed model or the planned draft already holds a direct
  // component child, so a planned-only child from a concurrent session still blocks.
  const hasComponentChild = [...args.committed.nodes, ...args.planned.nodes].some(
    (node) => node.parentId === args.container.id && node.kind === 'component'
  )
  if (hasComponentChild) {
    findings.push(
      containerGenerationError(
        'invalid_hierarchy',
        `Container '${args.container.id}' already has components; atomic generation only fills an empty subtree`,
        semanticPath.node(args.container.id),
        { nodeId: args.container.id, reason: 'empty_generation_target_required' }
      )
    )
  }

  const existingIds = new Set([
    ...args.committed.nodes.map((node) => node.id),
    ...args.planned.nodes.map((node) => node.id)
  ])
  const keys = new Set<string>()
  const anchors = new Set<string>()
  for (const component of args.input.components) {
    checkProposalKey({ key: component.key, keys, existingIds, findings })
    for (const symbol of component.symbols) {
      checkProposalKey({ key: symbol.key, keys, existingIds, findings })
      const anchor = containerGenerationSourceKey(symbol.source_file, symbol.name)
      if (anchors.has(anchor)) {
        findings.push(
          containerGenerationError(
            'duplicate_id',
            `Source anchor '${symbol.source_file}#${symbol.name}' is assigned more than once`,
            semanticPath.model(),
            {
              sourceFile: symbol.source_file,
              name: symbol.name,
              reason: 'duplicate_source_anchor'
            }
          )
        )
      }
      anchors.add(anchor)
      if (
        symbol.line !== undefined &&
        symbol.end_line !== undefined &&
        symbol.end_line < symbol.line
      ) {
        findings.push(
          containerGenerationError(
            'invalid_symbol_name',
            `Symbol '${symbol.key}' has an inverted line range`,
            semanticPath.model(),
            {
              key: symbol.key,
              line: symbol.line,
              endLine: symbol.end_line,
              reason: 'invalid_line_range'
            }
          )
        )
      }
    }
  }

  for (const [index, group] of (args.input.groups ?? []).entries()) {
    const seen = new Set<string>()
    for (const memberKey of group.member_keys) {
      if (seen.has(memberKey)) {
        findings.push(
          containerGenerationError(
            'invalid_group',
            `Group '${group.name}' repeats member '${memberKey}'`,
            semanticPath.model(),
            { groupIndex: index, memberKey, reason: 'duplicate_group_member' }
          )
        )
      }
      seen.add(memberKey)
    }
  }

  return findings.length > 0
    ? invalidContainerGenerationProposal(
        'container.fill proposal failed structural validation',
        findings
      )
    : null
}

export function isBlockingContainerGenerationFinding(finding: ScryerValidationFinding): boolean {
  return finding.severity === 'error' || BLOCKING_CODES.has(finding.code)
}

// The committed and planned snapshots share the freshly generated subtree, so a
// finding about generated content appears identically in both layers. Collapse
// exact duplicates by a stable key before surfacing/counting so a single issue
// is never double-reported. This is purely a surfacing concern: both layers are
// still validated, and any blocking finding still rejects the write.
export function dedupeContainerGenerationFindings(
  findings: ScryerValidationFinding[]
): ScryerValidationFinding[] {
  const seen = new Set<string>()
  const unique: ScryerValidationFinding[] = []
  for (const finding of findings) {
    const key = JSON.stringify([
      finding.code,
      finding.severity,
      finding.path ?? null,
      finding.jsonPointer ?? null,
      finding.message,
      finding.details ?? null
    ])
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(finding)
  }
  return unique
}
