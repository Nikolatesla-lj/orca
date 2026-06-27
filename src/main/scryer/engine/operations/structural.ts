import { existsSync } from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { join, relative, sep } from 'path'
import type { ScryGroup, ScryKind, ScryModel, ScryNode, ScryResponsibility } from '../model'
import { scryModelSchema, groupSchema } from '../schemas'
import type { ScryerOperationExecutor, ScryerFieldError } from '../types'
import { diffModels, summarizePending } from '../diff'
import { scryerPaths } from '../paths'
import { failure, success } from './helpers'

type RecordInput = Record<string, unknown>

const DRIFT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.scryer',
  '.next',
  '__pycache__',
  '.direnv',
  '.venv',
  '.turbo',
  '.cache',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.parcel-cache',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  '.build',
  'bin',
  'obj',
  'pkg'
])

function cloneModel(model: ScryModel): ScryModel {
  return JSON.parse(JSON.stringify(model)) as ScryModel
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.split(sep).join('/')
  let output = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const afterNext = normalized[index + 2]
    if (char === '*' && next === '*' && afterNext === '/') {
      output += '(?:.*/)?'
      index += 2
    } else if (char === '*' && next === '*') {
      output += '.*'
      index += 1
    } else if (char === '*') {
      output += '[^/]*'
    } else if (char === '?') {
      output += '[^/]'
    } else {
      output += escapeRegex(char ?? '')
    }
  }
  output += '$'
  return new RegExp(output)
}

async function walkProjectFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!DRIFT_SKIP_DIRS.has(entry.name)) {
          await walk(join(dir, entry.name))
        }
      } else if (entry.isFile()) {
        files.push(join(dir, entry.name))
      }
    }
  }
  await walk(root)
  return files
}

async function readActiveDriftModel(projectRoot: string, fallback?: ScryModel): Promise<ScryModel | null> {
  const paths = scryerPaths(projectRoot)
  if (existsSync(paths.plannedPath)) {
    const parsed = scryModelSchema.safeParse(JSON.parse(await readFile(paths.plannedPath, 'utf8')))
    if (parsed.success) {
      return parsed.data
    }
  }
  return fallback ?? null
}

function formatZodPath(path: unknown[], key?: string): string {
  const base = path
    .map((part) => (typeof part === 'number' ? `[${part}]` : String(part)))
    .join('.')
    .replaceAll('.[', '[')
  return key ? (base ? `${base}.${key}` : key) : base || 'input'
}

function fieldErrorsFromZod(error: { issues?: unknown }): ScryerFieldError[] {
  const issues = Array.isArray(error.issues)
    ? (error.issues as { path?: unknown[]; message?: string; code?: string; keys?: string[] }[])
    : []
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      return issue.keys.map((key) => ({
        path: formatZodPath(issue.path ?? [], key),
        message: issue.message ?? 'Unrecognized key',
        code: issue.code
      }))
    }
    return [
      {
        path: formatZodPath(issue.path ?? []),
        message: issue.message ?? 'Invalid value',
        ...(issue.code ? { code: issue.code } : {})
      }
    ]
  })
}

function hasUnrecognizedKeys(error: { issues?: unknown }): boolean {
  return Array.isArray(error.issues)
    ? (error.issues as { code?: string }[]).some((issue) => issue.code === 'unrecognized_keys')
    : false
}

function parseModel(data: unknown) {
  const result = scryModelSchema.safeParse(data)
  if (result.success) {
    return { ok: true as const, model: result.data }
  }
  const fieldErrors = fieldErrorsFromZod(result.error)
  return {
    ok: false as const,
    reason: hasUnrecognizedKeys(result.error) ? 'unknown_fields' : 'invalid_schema',
    fieldErrors
  }
}

function responsibilitiesFromInput(input: unknown, ids: { responsibility(): string }): ScryResponsibility[] | undefined {
  if (!Array.isArray(input)) {
    return undefined
  }
  return input
    .map((item) =>
      typeof item === 'string'
        ? { id: ids.responsibility(), statement: item }
        : typeof item === 'object' && item !== null
          ? {
              id: ids.responsibility(),
              statement: String((item as { statement?: unknown }).statement ?? '')
            }
          : null
    )
    .filter((item): item is ScryResponsibility => Boolean(item && item.statement.trim()))
}

function stringField(record: RecordInput, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function stringArrayField(record: RecordInput, key: string): string[] | undefined {
  const value = record[key]
  return Array.isArray(value) ? value.map(String) : undefined
}

function appendNode(args: {
  planned: ScryModel
  item: RecordInput
  kind: ScryKind
  ids: { node(): string; responsibility(): string }
}): ScryNode {
  const responsibilities = responsibilitiesFromInput(args.item.responsibilities, args.ids)
  const node: ScryNode = {
    id: args.ids.node(),
    kind: args.kind,
    name: stringField(args.item, 'name')?.trim() || 'Untitled',
    ...(stringField(args.item, 'parent_id') ? { parentId: stringField(args.item, 'parent_id') } : {}),
    ...(typeof args.item.external === 'boolean' ? { external: args.item.external } : {}),
    ...(stringField(args.item, 'technology') ? { technology: stringField(args.item, 'technology') } : {}),
    ...(stringField(args.item, 'description') !== undefined
      ? { description: stringField(args.item, 'description') }
      : {}),
    ...(responsibilities ? { responsibilities } : {}),
    ...(Array.isArray(args.item.properties) ? { properties: args.item.properties as never } : {}),
    ...(typeof args.item.visual === 'boolean' ? { visual: args.item.visual } : {})
  }
  args.planned.nodes.push(node)
  const sourceFile = stringField(args.item, 'source_file')
  if (sourceFile) {
    args.planned.sourceMap[node.id] = [
      {
        pattern: sourceFile,
        ...(typeof args.item.line === 'number' ? { line: args.item.line } : {}),
        ...(typeof args.item.endLine === 'number' ? { endLine: args.item.endLine } : {})
      }
    ]
  }
  return node
}

function plannedOrFailure(state: { planned?: ScryModel }, operationId: string) {
  if (!state.planned) {
    return failure('internal_error', `Planned state was not loaded for ${operationId}`, {
      reason: 'policy_violation',
      contractOperationId: operationId
    })
  }
  return null
}

export const modelSetOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({ input }) => {
  const parsed = parseModel(input.data)
  if (!parsed.ok) {
    return failure(
      'incompatible_model',
      'Scryer model.set data failed schema validation',
      {
        path: 'input.data',
        expectedVersion: '0.3',
        reason: parsed.reason,
        fields: parsed.fieldErrors.map((error) => error.path.replace(/^input\./, ''))
      },
      { fieldErrors: parsed.fieldErrors.map((error) => ({ ...error, path: `data.${error.path}` })) }
    )
  }
  return success({
    result: {
      updatedCount: 1,
      nodeCount: parsed.model.nodes.length,
      linkCount: parsed.model.links.length,
      groupCount: parsed.model.groups.length
    },
    changes: {
      committed: parsed.model,
      planned: cloneModel(parsed.model),
      baseline: 'refresh'
    }
  })
}

function addNodesOperation(kind: ScryKind): ScryerOperationExecutor<RecordInput, RecordInput> {
  return ({ input, state, services }) => {
    const stateFailure = plannedOrFailure(state, `scryer.${kind}.add`)
    if (stateFailure) {
      return stateFailure
    }
    const committed = state.committed ?? state.planned!
    const planned = cloneModel(state.planned!)
    const added = (Array.isArray(input.items) ? input.items : []).map((item) =>
      appendNode({
        planned,
        item: item as RecordInput,
        kind,
        ids: services.ids
      })
    )
    return success({
      result: {
        added: added.map((node) => ({ kind: 'node', id: node.id, nodeKind: node.kind })),
        addedIds: added.map((node) => node.id),
        pendingSummary: summarizePending(diffModels(committed, planned))
      },
      changes: { planned }
    })
  }
}

export const personAddOperation = addNodesOperation('person')
export const systemAddOperation = addNodesOperation('system')
export const containerAddOperation = addNodesOperation('container')
export const componentAddOperation = addNodesOperation('component')
export const symbolAddOperation = addNodesOperation('symbol')

export const groupAddOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({
  input,
  state,
  services
}) => {
  const stateFailure = plannedOrFailure(state, 'scryer.group.add')
  if (stateFailure) {
    return stateFailure
  }
  const committed = state.committed ?? state.planned!
  const planned = cloneModel(state.planned!)
  const added = (Array.isArray(input.items) ? input.items : []).map((item) => {
    const record = item as RecordInput
    const responsibilities = responsibilitiesFromInput(record.responsibilities, services.ids)
    const group: ScryGroup = {
      id: services.ids.group(),
      name: stringField(record, 'name')?.trim() || 'New group',
      memberIds: stringArrayField(record, 'member_ids') ?? [],
      ...(stringField(record, 'description') !== undefined
        ? { description: stringField(record, 'description') }
        : {}),
      ...(stringField(record, 'parent_id') ? { parentNodeId: stringField(record, 'parent_id') } : {}),
      ...(responsibilities ? { responsibilities } : {})
    }
    planned.groups.push(group)
    return group
  })
  return success({
    result: {
      added: added.map((group) => ({ kind: 'group', id: group.id })),
      addedIds: added.map((group) => group.id),
      pendingSummary: summarizePending(diffModels(committed, planned))
    },
    changes: { planned }
  })
}

export const groupSetOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({ input, state }) => {
  const stateFailure = plannedOrFailure(state, 'scryer.group.set')
  if (stateFailure) {
    return stateFailure
  }
  if (!Array.isArray(input.data)) {
    return failure('invalid_input', 'group.set data must be an array', undefined, {
      fieldErrors: [{ path: 'data', message: 'Expected group array' }]
    })
  }
  const parsed = input.data.map((group) => groupSchema.safeParse(group))
  const firstInvalid = parsed.find((result) => !result.success)
  if (firstInvalid && !firstInvalid.success) {
    return failure('invalid_input', 'group.set data failed schema validation', undefined, {
      fieldErrors: fieldErrorsFromZod(firstInvalid.error)
    })
  }
  const committed = state.committed ?? state.planned!
  const planned = cloneModel(state.planned!)
  planned.groups = parsed.map((result) => (result.success ? result.data : ({} as ScryGroup)))
  return success({
    result: {
      updatedCount: planned.groups.length,
      pendingSummary: summarizePending(diffModels(committed, planned))
    },
    changes: { planned }
  })
}

export const groupUpdateOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({
  input,
  state
}) => {
  const stateFailure = plannedOrFailure(state, 'scryer.group.update')
  if (stateFailure) {
    return stateFailure
  }
  const committed = state.committed ?? state.planned!
  const planned = cloneModel(state.planned!)
  let updatedCount = 0
  for (const item of Array.isArray(input.items) ? input.items : []) {
    const record = item as RecordInput
    const groupId = stringField(record, 'group_id')
    const group = groupId ? planned.groups.find((candidate) => candidate.id === groupId) : undefined
    if (!group || !groupId) {
      return failure('not_found', `Group '${groupId ?? '<missing>'}' not found`, {
        entity: 'group',
        id: groupId ?? '<missing>',
        field: 'group_id'
      })
    }
    if (stringField(record, 'name') !== undefined) {
      group.name = stringField(record, 'name')!
    }
    if (stringField(record, 'description') !== undefined) {
      group.description = stringField(record, 'description')
    }
    if (Array.isArray(record.member_ids)) {
      group.memberIds = record.member_ids.map(String)
    }
    if (record.parent_group_id === null || typeof record.parent_group_id === 'string') {
      group.parentGroupId = record.parent_group_id ?? undefined
    }
    if (record.parent_node_id === null || typeof record.parent_node_id === 'string') {
      group.parentNodeId = record.parent_node_id as string | null
    }
    updatedCount += 1
  }
  return success({
    result: {
      updatedCount,
      pendingSummary: summarizePending(diffModels(committed, planned))
    },
    changes: { planned }
  })
}

export const groupDeleteOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({
  input,
  state
}) => {
  const stateFailure = plannedOrFailure(state, 'scryer.group.delete')
  if (stateFailure) {
    return stateFailure
  }
  const groupId = stringField(input, 'group_id')
  const deleted = groupId ? state.planned!.groups.find((group) => group.id === groupId) : undefined
  if (!groupId || !deleted) {
    return failure('not_found', `Group '${groupId ?? '<missing>'}' not found`, {
      entity: 'group',
      id: groupId ?? '<missing>',
      field: 'group_id'
    })
  }
  const committed = state.committed ?? state.planned!
  const planned = cloneModel(state.planned!)
  planned.groups = planned.groups
    .filter((group) => group.id !== groupId)
    .map((group) =>
      group.parentGroupId === groupId ? { ...group, parentGroupId: deleted.parentGroupId } : group
    )
  return success({
    result: {
      deletedCount: 1,
      pendingSummary: summarizePending(diffModels(committed, planned))
    },
    changes: { planned }
  })
}

function locationsFromInput(value: unknown): ScryModel['sourceMap'][string] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is RecordInput => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      pattern: String(entry.pattern ?? ''),
      ...(typeof entry.symbol === 'string' ? { symbol: entry.symbol } : {}),
      ...(typeof entry.line === 'number' ? { line: entry.line } : {}),
      ...(typeof entry.endLine === 'number' ? { endLine: entry.endLine } : {}),
      ...(typeof entry.command === 'string' ? { command: entry.command } : {})
    }))
    .filter((entry) => entry.pattern.trim())
}

function sourcesFromInput(value: unknown): ScryModel['boundaries'][string] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is RecordInput => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      pattern: String(entry.pattern ?? ''),
      ...(typeof entry.comment === 'string' ? { comment: entry.comment } : {})
    }))
    .filter((entry) => entry.pattern.trim())
}

function applySourceUpdates(model: ScryModel, input: RecordInput): void {
  for (const item of Array.isArray(input.entries) ? input.entries : []) {
    const record = item as RecordInput
    const nodeId = stringField(record, 'node_id') ?? stringField(record, 'owner_id')
    if (nodeId) {
      const locations = locationsFromInput(record.locations ?? record.sources)
      if (locations.length > 0) {
        model.sourceMap[nodeId] = locations
      } else {
        delete model.sourceMap[nodeId]
      }
    }
  }
  for (const item of Array.isArray(input.schemas) ? input.schemas : []) {
    const record = item as RecordInput
    const nodeId = stringField(record, 'node_id')
    if (nodeId) {
      const locations = locationsFromInput(record.locations)
      if (locations.length > 0) {
        model.sourceMap[nodeId] = locations
      } else {
        delete model.sourceMap[nodeId]
      }
    }
  }
  for (const item of Array.isArray(input.boundaries) ? input.boundaries : []) {
    const record = item as RecordInput
    const nodeId = stringField(record, 'node_id')
    if (nodeId) {
      const sources = sourcesFromInput(record.sources)
      if (sources.length > 0) {
        model.boundaries[nodeId] = sources
      } else {
        delete model.boundaries[nodeId]
      }
    }
  }
}

export const sourceUpdateOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({
  input,
  state
}) => {
  const stateFailure = plannedOrFailure(state, 'scryer.source.update')
  if (stateFailure) {
    return stateFailure
  }
  const planned = cloneModel(state.planned!)
  const committed = state.committed ? cloneModel(state.committed) : undefined
  applySourceUpdates(planned, input)
  if (committed) {
    applySourceUpdates(committed, input)
  }
  return success({
    result: {
      updatedCount:
        (Array.isArray(input.entries) ? input.entries.length : 0) +
        (Array.isArray(input.schemas) ? input.schemas.length : 0) +
        (Array.isArray(input.boundaries) ? input.boundaries.length : 0)
    },
    changes: {
      planned,
      ...(committed ? { committed } : {})
    }
  })
}

export const driftGetOperation: ScryerOperationExecutor<RecordInput, RecordInput> = async ({
  project,
  state
}) => {
  const model = await readActiveDriftModel(project.projectRoot, state.committed)
  if (!model) {
    return success({ result: { clean: true, scopes: [], baseline: {}, recommendedNextReads: [] } })
  }

  const paths = scryerPaths(project.projectRoot)
  const baseline = existsSync(paths.syncPath) ? (await stat(paths.syncPath)).mtime : new Date(0)
  const files = await walkProjectFiles(project.projectRoot)
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
  const scopes: RecordInput[] = []

  for (const node of model.nodes) {
    const patterns = [
      ...(model.sourceMap[node.id] ?? []).map((location) => location.pattern),
      ...(model.boundaries[node.id] ?? []).map((source) => source.pattern)
    ].filter((pattern, index, all) => pattern && all.indexOf(pattern) === index)
    const driftedPatterns: string[] = []
    for (const pattern of patterns) {
      const matcher = globToRegex(pattern)
      for (const file of files) {
        const rel = relative(project.projectRoot, file).split(sep).join('/')
        if (matcher.test(rel) && (await stat(file)).mtime > baseline) {
          driftedPatterns.push(pattern)
          break
        }
      }
    }
    if (driftedPatterns.length === 1) {
      scopes.push({ nodeId: node.id, nodeName: node.name, path: driftedPatterns[0] })
    } else if (driftedPatterns.length > 1) {
      scopes.push({ nodeId: node.id, nodeName: node.name, changedFiles: driftedPatterns })
    }
  }

  const structureChanged = await (async () => {
    for (const file of files) {
      const fileStat = await stat(file)
      const birthtime = fileStat.birthtimeMs > 0 ? fileStat.birthtime : fileStat.mtime
      if (birthtime > baseline) {
        const rel = relative(project.projectRoot, file).split(sep).join('/')
        const covered = scopes.some((scope) => {
          const node = typeof scope.nodeId === 'string' ? nodeById.get(scope.nodeId) : undefined
          const patterns = node
            ? [
                ...(model.sourceMap[node.id] ?? []).map((location) => location.pattern),
                ...(model.boundaries[node.id] ?? []).map((source) => source.pattern)
              ]
            : []
          return patterns.some((pattern) => globToRegex(pattern).test(rel))
        })
        if (!covered) {
          return true
        }
      }
    }
    return false
  })()

  return success({
    result: {
      clean: scopes.length === 0 && !structureChanged,
      scopes,
      baseline: { syncedAt: baseline.toISOString() },
      recommendedNextReads: []
    }
  })
}

export const driftReconcileOperation: ScryerOperationExecutor<RecordInput, RecordInput> = ({
  services
}) =>
  success({
    result: { reconciledAt: services.clock.nowIso() },
    changes: {
      syncState: { reconciledAt: services.clock.nowIso() },
      anchorBaseline: 'refresh'
    }
  })
