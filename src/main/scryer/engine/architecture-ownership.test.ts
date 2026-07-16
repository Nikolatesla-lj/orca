import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(path)
    }
  }
  return files
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/import\s+(?:type\s+)?(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g)].map(
    (match) => match[1]!
  )
}

describe('Scryer architecture ownership', () => {
  it('keeps operation files behind the engine seam and away from IO/adapters', async () => {
    const operationFiles = await filesUnder(join(ROOT, 'src/main/scryer/engine/operations'))
    const forbidden = [
      '../state-store',
      '../pipeline',
      '../catalog',
      '../adapters',
      '../../model-store',
      '../../mcp-tools',
      '../../../../shared/scryer/model-types'
    ]

    for (const file of operationFiles) {
      const imports = importsOf(await readFile(file, 'utf8'))
      expect(
        imports.filter((specifier) =>
          forbidden.some((blocked) => specifier === blocked || specifier.startsWith(`${blocked}/`))
        ),
        `${relative(ROOT, file)} imports a forbidden dependency`
      ).toEqual([])
    }
  })

  it('prevents product adapters from importing engine internals directly', async () => {
    const adapterFiles = [
      join(ROOT, 'src/main/ipc/architecture.ts'),
      join(ROOT, 'src/cli/handlers/scryer.ts')
    ]
    const forbidden = [
      '/scryer/engine/state-store',
      '/scryer/engine/pipeline',
      '/scryer/engine/catalog',
      '/scryer/engine/operations',
      '/scryer/engine/validators',
      '/scryer/engine/diff',
      '/scryer/engine/fold',
      '/scryer/engine/id-minter',
      '/scryer/engine/source-router',
      '/scryer/engine/error-mapper'
    ]

    for (const file of adapterFiles) {
      const imports = importsOf(await readFile(file, 'utf8'))
      expect(
        imports.filter((specifier) =>
          forbidden.some((blocked) => specifier.includes(blocked.replace(/^\//, '')))
        ),
        `${relative(ROOT, file)} imports an engine internal module`
      ).toEqual([])
    }
  })

  it('keeps the architecture view adapter off engine internals and legacy C4 types', async () => {
    const imports = importsOf(
      await readFile(join(ROOT, 'src/main/scryer/architecture-view-adapter.ts'), 'utf8')
    )
    const forbidden = [
      './engine/model',
      './engine/validators',
      './engine/diff',
      './engine/fold',
      './engine/read-selector',
      './engine/state-store',
      './engine/pipeline',
      '../../shared/scryer/model-types'
    ]

    expect(
      imports.filter((specifier) =>
        forbidden.some((blocked) => specifier === blocked || specifier.startsWith(`${blocked}/`))
      ),
      'architecture-view-adapter.ts imports an engine internal or legacy C4 semantic type'
    ).toEqual([])
  })

  it('keeps the MCP bridge off legacy model mutation and disk-format probing', async () => {
    const mcpFiles = [
      'src/main/scryer/mcp-tools.ts',
      'src/main/scryer/mcp-model-persistence.ts',
      'src/main/scryer/mcp-node-write-tools.ts',
      'src/main/scryer/mcp-strict-operation-adapters.ts',
      'src/main/scryer/mcp-tool-execution.ts'
    ]
    // Retired legacy seams: MCP writes go through cataloged Engine operations only, and
    // there is no disk-format probing or fallback to a legacy C4 document.
    const forbidden = [
      /\bwriteModelAndBaseline\b/,
      /\bisStrictScryerModel\b/,
      /\bwriteModel\s*\(/,
      /\bwriteModelDocument\s*\(/,
      /\bpatchNodeData\s*\(/
    ]

    for (const file of mcpFiles) {
      const source = await readFile(join(ROOT, file), 'utf8')
      for (const pattern of forbidden) {
        expect(pattern.test(source), `${file} still references ${pattern.source}`).toBe(false)
      }
    }
  })

  it('keeps the sync adapter off legacy C4 model IO and the legacy drift reader', async () => {
    const source = await readFile(join(ROOT, 'src/main/scryer/sync.ts'), 'utf8')
    const imports = importsOf(source)

    // The legacy standalone drift module and engine internals are off-limits; drift
    // comes from the Engine via the shared drift-report adapter.
    expect(
      imports.filter(
        (specifier) =>
          (specifier.includes('/drift') && !specifier.includes('drift-report')) ||
          specifier.includes('/engine/')
      )
    ).toEqual([])

    // Legacy semantic model IO is retired; only Engine reads + snapshot/sentinel
    // maintenance (writePreSyncSnapshot, setImplementing, markSynced) remain.
    const forbidden = [/\breadModel\b/, /\bwriteModel\b/, /\bcheckDrift\b/]
    for (const pattern of forbidden) {
      expect(pattern.test(source), `sync.ts still references ${pattern.source}`).toBe(false)
    }
  })

  it('keeps the architecture IPC bridge off the retired raw-document write surface', async () => {
    const source = await readFile(join(ROOT, 'src/main/ipc/architecture.ts'), 'utf8')
    // The retired default raw-mutation channels and legacy semantic writers must not
    // reappear. Read channels (readModel/readModelDocument) remain legitimate.
    const forbidden = [
      /architecture:writeModel\b/,
      /architecture:writeModelDocument\b/,
      /architecture:patchNodeData\b/,
      /\bwriteModelDocument\b/,
      /\bpatchNodeData\b/,
      /\bwriteModelAndBaseline\b/
    ]
    for (const pattern of forbidden) {
      expect(pattern.test(source), `architecture.ts still references ${pattern.source}`).toBe(false)
    }
  })

  it('keeps the preload architecture API off the retired raw-document write channels', async () => {
    const index = await readFile(join(ROOT, 'src/preload/index.ts'), 'utf8')
    const apiTypes = await readFile(join(ROOT, 'src/preload/api-types.ts'), 'utf8')
    const forbidden = [
      /architecture:writeModel\b/,
      /architecture:writeModelDocument\b/,
      /architecture:patchNodeData\b/
    ]
    for (const pattern of forbidden) {
      expect(pattern.test(index), `preload/index.ts still references ${pattern.source}`).toBe(false)
    }
    // The renderer-facing type surface no longer declares the raw write methods.
    for (const method of ['writeModelDocument', 'patchNodeData']) {
      expect(apiTypes.includes(`${method}:`), `api-types.ts still declares ${method}`).toBe(false)
    }
  })

  it('keeps state-store independent of operations and product adapters', async () => {
    const imports = importsOf(
      await readFile(join(ROOT, 'src/main/scryer/engine/state-store.ts'), 'utf8')
    )

    expect(
      imports.filter(
        (specifier) =>
          specifier.includes('/operations') ||
          specifier.includes('/adapters') ||
          specifier.includes('/renderer') ||
          specifier.includes('/cli/')
      )
    ).toEqual([])
  })
})
