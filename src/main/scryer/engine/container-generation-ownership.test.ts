import { readFile } from 'fs/promises'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const FORBIDDEN_IMPORTS = [
  'mcp-tools',
  'model-store',
  'legacy-c4',
  'renderer',
  'src/cli',
  '../../cli',
  '../../../cli',
  '../../../../cli',
  'src/main/ipc',
  '../../ipc',
  '../../../ipc',
  '../../../../ipc'
]

const DIRECT_WRITERS = /\b(writeFile|rename|appendFile|rm|unlink)\b/

async function readModule(path: string): Promise<string> {
  return readFile(join(ROOT, path), 'utf8')
}

describe('#34 container generation ownership', () => {
  it('keeps the generation planner a pure deep module with no IO or legacy imports', async () => {
    const source = await readModule('src/main/scryer/engine/container-generation-planner.ts')
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source, `planner must not import ${forbidden}`).not.toContain(forbidden)
    }
    expect(source, 'planner filesystem import').not.toMatch(/from ['"]fs(?:\/promises)?['"]/)
    expect(source, 'planner state-store import').not.toContain('state-store')
    expect(source, 'planner path helper import').not.toContain('./paths')
    expect(source, 'planner direct writer').not.toMatch(DIRECT_WRITERS)
  })

  it('lets the operation read only the build-edge cache seam and never a legacy writer', async () => {
    const source = await readModule('src/main/scryer/engine/operations/container-fill.ts')
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source, `operation must not import ${forbidden}`).not.toContain(forbidden)
    }
    // The operation reads build edges through the cache seam, never a legacy
    // semantic writer, and never a direct .scryer model write.
    expect(source, 'operation direct writer').not.toMatch(DIRECT_WRITERS)
    expect(source, 'operation state-store import').not.toContain('state-store')
    expect(source).toContain('readBuildEdgeGraph')
  })

  it('keeps the build-edge cache read-only', async () => {
    const source = await readModule('src/main/scryer/engine/build-edge-cache.ts')
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source, `build-edge cache must not import ${forbidden}`).not.toContain(forbidden)
    }
    expect(source, 'build-edge cache must not write').not.toMatch(DIRECT_WRITERS)
  })

  it('routes the CLI scryer handler through the engine, not a legacy writer', async () => {
    const source = await readModule('src/cli/handlers/scryer.ts')
    expect(source, 'CLI handler must reach state through the engine seam').toContain(
      'executeOperation'
    )
    for (const forbidden of ['mcp-tools', 'model-store', 'legacy-c4']) {
      expect(source, `CLI handler must not import ${forbidden}`).not.toContain(forbidden)
    }
    expect(source, 'CLI handler must not write model files directly').not.toMatch(DIRECT_WRITERS)
  })
})
