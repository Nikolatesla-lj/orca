import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename as pathBasename, join } from 'node:path'
import { loadParityFixture } from './parity-fixtures'
import type { ScryerOperationId } from './operation-identifiers'

// Declaration sites (catalog authoring + schema tables) legitimately name every id;
// counting them as call-sites would let the catalog prove itself. The gate's own
// source is excluded for the same reason.
const EXCLUDED_CALLSITE_BASENAMES = new Set([
  'catalog.ts',
  'catalog-policy.ts',
  'catalog-validation.ts',
  'catalog-operation-ids.ts',
  'catalog-read-rows.ts',
  'catalog-structural-rows.ts',
  'catalog-authoring-rows.ts',
  'catalog-generation-drift-rows.ts',
  'catalog-transport-support.ts',
  'operation-schemas.ts',
  'operation-identifiers.ts',
  'schemas.ts'
])

function isExcludedCallsiteFile(path: string): boolean {
  // Why: paths come from join(), so the separator is platform-dependent; a
  // hand-rolled '/' split would break the exclusion list on Windows.
  const basename = pathBasename(path)
  if (basename.includes('machine-parity')) {
    return true
  }
  if (basename.endsWith('.test.ts') || basename.endsWith('.test.tsx')) {
    return true
  }
  return EXCLUDED_CALLSITE_BASENAMES.has(basename)
}

function walkTypeScriptFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__fixtures__') {
        continue
      }
      files.push(...walkTypeScriptFiles(path))
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(path)
    }
  }
  return files
}

// Scans product source for genuine references to each operation id (dispatch sites in
// CLI handlers, the generic IPC registrar, the renderer controller, MCP bridge, etc.),
// excluding the gate itself and the id/schema declaration tables.
export function discoverOperationCallSites(
  srcRoot: string,
  expectedIds: readonly ScryerOperationId[]
): Set<ScryerOperationId> {
  const found = new Set<ScryerOperationId>()
  const ids = new Set<string>(expectedIds)
  for (const file of walkTypeScriptFiles(srcRoot)) {
    if (isExcludedCallsiteFile(file)) {
      continue
    }
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/['"](scryer\.[a-z0-9.-]+)['"]/g)) {
      const id = match[1]!
      if (ids.has(id)) {
        found.add(id as ScryerOperationId)
      }
    }
  }
  return found
}

// The precise CLI handler-key set (`'scryer x y': async`), scanned statically so the
// gate compares against the real adapter surface rather than a hard-coded count.
export function discoverCliHandlerKeys(handlerFile: string): Set<string> {
  const source = readFileSync(handlerFile, 'utf8')
  const keys = new Set<string>()
  for (const match of source.matchAll(/['"](scryer(?: [a-z0-9-]+)+)['"]\s*:\s*async/g)) {
    keys.add(match[1]!)
  }
  return keys
}

// The precise CLI command-spec path set (`path: ['scryer', 'x', 'y']`).
export function discoverCliSpecPaths(specFiles: string[]): Set<string> {
  const paths = new Set<string>()
  for (const file of specFiles) {
    if (!existsSync(file)) {
      continue
    }
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/path:\s*\[([^\]]+)\]/g)) {
      const tokens = [...match[1]!.matchAll(/['"]([a-z0-9-]+)['"]/g)].map((token) => token[1]!)
      if (tokens[0] === 'scryer' && tokens.length > 1) {
        paths.add(tokens.join(' '))
      }
    }
  }
  return paths
}

function findCaseJsonFiles(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...findCaseJsonFiles(path))
    } else if (entry.name === 'case.json') {
      files.push(path)
    }
  }
  return files
}

// Operations backed by a zod-validated parity golden fixture (any provenance grade).
export async function discoverParityGoldenOps(fixtureRoots: string[]): Promise<Set<string>> {
  const ops = new Set<string>()
  for (const root of fixtureRoots) {
    for (const caseFile of findCaseJsonFiles(root)) {
      const fixture = await loadParityFixture(caseFile)
      ops.add(fixture.operationId)
    }
  }
  return ops
}
