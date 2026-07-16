import type {
  C4Kind,
  C4Node,
  Contract,
  ModelProperty,
  SourceLocation,
  Status
} from '../../shared/scryer/model-types'
import { isRecord } from './mcp-tool-execution'

export function normalizeContract(value: unknown): Contract | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return {
    expect: Array.isArray(value.expect) ? (value.expect as Contract['expect']) : [],
    ask: Array.isArray(value.ask) ? (value.ask as Contract['ask']) : [],
    never: Array.isArray(value.never) ? (value.never as Contract['never']) : []
  }
}

export function normalizeSources(value: unknown): C4Node['data']['sources'] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .filter(isRecord)
    .map((source) => ({
      pattern: String(source.pattern ?? ''),
      comment: String(source.comment ?? '')
    }))
    .filter((source) => source.pattern)
}

export function normalizeSourceLocations(value: unknown): SourceLocation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .filter(isRecord)
    .map((source) => ({
      pattern: String(source.pattern ?? ''),
      ...(typeof source.line === 'number' ? { line: source.line } : {}),
      ...(typeof source.endLine === 'number' ? { endLine: source.endLine } : {}),
      ...(typeof source.command === 'string' ? { command: source.command } : {})
    }))
    .filter((source) => source.pattern)
}

export function normalizeProperties(value: unknown): ModelProperty[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .filter(isRecord)
    .map((property) => ({
      label: String(property.label ?? ''),
      description: String(property.description ?? '')
    }))
    .filter((property) => property.label)
}

export function isStatus(value: unknown): value is Status {
  return (
    value === 'proposed' || value === 'implemented' || value === 'verified' || value === 'vagrant'
  )
}

export function kindLabel(kind: C4Kind): string {
  return kind
}

export function validatePropertyLabels(properties: ModelProperty[], label: string): string | null {
  for (const property of properties) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property.label)) {
      return `${label} has invalid property label '${property.label}'`
    }
  }
  return null
}
