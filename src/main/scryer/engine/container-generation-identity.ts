import type { ScryNode, ScryResponsibility, ScrySchemaProperty, ScrySourceLocation } from './model'
import type {
  ScryerContainerFillCreatedComponent,
  ScryerContainerFillCreatedSymbol,
  ScryerContainerFillInput,
  ScryerProposedSymbol
} from './container-generation-contracts'
import type { ScryerIdMinter } from './operation-services'

export type GeneratedSourceEntry = {
  key: string
  kind: 'node' | 'responsibility'
  entry: ScrySourceLocation[]
}

export type GeneratedSubtreeIdentity = {
  nodes: ScryNode[]
  componentIdByKey: Map<string, string>
  localIds: Map<string, string>
  symbolNodeByLoc: Map<string, string>
  symbolComponent: Map<string, string>
  // Source files this generation drew symbols from — the scope for judging which
  // build-edge endpoints are relevant to the fill.
  sourceFiles: Set<string>
  sourceEntries: GeneratedSourceEntry[]
  created: ScryerContainerFillCreatedComponent[]
  createdSymbols: ScryerContainerFillCreatedSymbol[]
  thinSymbolCount: number
}

// Preserve the historical runtime delimiter without embedding a literal NUL byte in source.
const NUL_SEPARATOR = String.fromCharCode(0)

export function containerGenerationSourceKey(sourceFile: string, name: string): string {
  return `${sourceFile}${NUL_SEPARATOR}${name}`
}

function mintResponsibilities(statements: string[], ids: ScryerIdMinter): ScryResponsibility[] {
  const responsibilities: ScryResponsibility[] = []
  for (const statement of statements) {
    if (typeof statement !== 'string' || !statement.trim()) {
      continue
    }
    responsibilities.push({ id: ids.responsibility(), statement })
  }
  return responsibilities
}

function mintSymbol(
  symbol: ScryerProposedSymbol,
  componentId: string,
  ids: ScryerIdMinter
): { node: ScryNode; sourceEntries: GeneratedSourceEntry[]; thin: boolean } {
  const symbolId = ids.node()
  const responsibilities: ScryResponsibility[] = []
  const sourceEntries: GeneratedSourceEntry[] = []

  for (const responsibility of symbol.responsibilities ?? []) {
    const statement = typeof responsibility === 'string' ? responsibility : responsibility.statement
    if (typeof statement !== 'string' || !statement.trim()) {
      continue
    }
    const responsibilityId = ids.responsibility()
    responsibilities.push({ id: responsibilityId, statement })
    // A plain-string responsibility anchors to the whole symbol ({pattern, symbol})
    // with no line range; only a responsibility object may carry an explicit
    // sub-range. It never inherits the symbol's declared line/end_line.
    const line = typeof responsibility === 'object' ? responsibility.line : undefined
    const endLine = typeof responsibility === 'object' ? responsibility.endLine : undefined
    sourceEntries.push({
      key: responsibilityId,
      kind: 'responsibility',
      entry: [
        {
          pattern: symbol.source_file,
          symbol: symbol.name,
          ...(line !== undefined ? { line } : {}),
          ...(endLine !== undefined ? { endLine } : {})
        }
      ]
    })
  }

  const properties: ScrySchemaProperty[] = (symbol.properties ?? []).map((property) => ({
    label: property.label,
    ...(property.description !== undefined ? { description: property.description } : {})
  }))

  // Every generated symbol keeps a persistent node-level source anchor — its own
  // durable code identity — even a thin re-export with no responsibilities or
  // properties, so it never floats without a location we can re-resolve.
  sourceEntries.push({
    key: symbolId,
    kind: 'node',
    entry: [
      {
        pattern: symbol.source_file,
        symbol: symbol.name,
        ...(symbol.line !== undefined ? { line: symbol.line } : {}),
        ...(symbol.end_line !== undefined ? { endLine: symbol.end_line } : {})
      }
    ]
  })

  const node: ScryNode = {
    id: symbolId,
    kind: 'symbol',
    name: symbol.name,
    parentId: componentId,
    ...(typeof symbol.visual === 'boolean' ? { visual: symbol.visual } : {}),
    ...(responsibilities.length > 0 ? { responsibilities } : {}),
    ...(properties.length > 0 ? { properties } : {})
  }
  return { node, sourceEntries, thin: responsibilities.length === 0 && properties.length === 0 }
}

export function planGeneratedSubtreeIdentity(args: {
  input: ScryerContainerFillInput
  containerId: string
  ids: ScryerIdMinter
}): GeneratedSubtreeIdentity {
  const nodes: ScryNode[] = []
  const componentIdByKey = new Map<string, string>()
  const localIds = new Map<string, string>()
  const symbolNodeByLoc = new Map<string, string>()
  const symbolComponent = new Map<string, string>()
  const sourceFiles = new Set<string>()
  const sourceEntries: GeneratedSourceEntry[] = []
  const created: ScryerContainerFillCreatedComponent[] = []
  const createdSymbols: ScryerContainerFillCreatedSymbol[] = []
  let thinSymbolCount = 0

  for (const component of args.input.components) {
    const componentId = args.ids.node()
    componentIdByKey.set(component.key, componentId)
    localIds.set(component.key, componentId)
    const componentResponsibilities = mintResponsibilities(
      component.responsibilities ?? [],
      args.ids
    )
    nodes.push({
      id: componentId,
      kind: 'component',
      name: component.name,
      parentId: args.containerId,
      ...(component.description !== undefined ? { description: component.description } : {}),
      ...(componentResponsibilities.length > 0
        ? { responsibilities: componentResponsibilities }
        : {})
    })

    const symbolIds: string[] = []
    for (const symbol of component.symbols) {
      const generatedSymbol = mintSymbol(symbol, componentId, args.ids)
      nodes.push(generatedSymbol.node)
      symbolIds.push(generatedSymbol.node.id)
      sourceFiles.add(symbol.source_file)
      localIds.set(symbol.key, generatedSymbol.node.id)
      symbolNodeByLoc.set(
        containerGenerationSourceKey(symbol.source_file, symbol.name),
        generatedSymbol.node.id
      )
      symbolComponent.set(generatedSymbol.node.id, componentId)
      sourceEntries.push(...generatedSymbol.sourceEntries)
      if (generatedSymbol.thin) {
        thinSymbolCount += 1
      }
      createdSymbols.push({
        id: generatedSymbol.node.id,
        key: symbol.key,
        name: symbol.name,
        parentComponentId: componentId,
        responsibilityIds: (generatedSymbol.node.responsibilities ?? []).map((item) => item.id),
        propertyLabels: (generatedSymbol.node.properties ?? []).map((item) => item.label),
        sourceKeys: generatedSymbol.sourceEntries.map((entry) => entry.key)
      })
    }

    created.push({
      id: componentId,
      key: component.key,
      name: component.name,
      responsibilityIds: componentResponsibilities.map((item) => item.id),
      symbolIds
    })
  }

  return {
    nodes,
    componentIdByKey,
    localIds,
    symbolNodeByLoc,
    symbolComponent,
    sourceFiles,
    sourceEntries,
    created,
    createdSymbols,
    thinSymbolCount
  }
}

export function mintGeneratedResponsibilities(
  statements: string[],
  ids: ScryerIdMinter
): ScryResponsibility[] {
  return mintResponsibilities(statements, ids)
}
