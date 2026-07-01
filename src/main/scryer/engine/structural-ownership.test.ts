import { readFile } from 'fs/promises'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const STRUCTURAL_MODULES = [
  'src/main/scryer/engine/structural-planner.ts',
  'src/main/scryer/engine/operations/structural-mutations.ts'
]

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

async function readModule(path: string): Promise<string> {
  return readFile(join(ROOT, path), 'utf8')
}

describe('#32 structural module ownership', () => {
  it('forbids structural planner and executors from importing legacy or adapter layers', async () => {
    for (const path of STRUCTURAL_MODULES) {
      const source = await readModule(path)
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source, `${path} must not import ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('keeps direct .scryer file IO out of structural planner and executors', async () => {
    for (const path of STRUCTURAL_MODULES) {
      const source = await readModule(path)

      expect(source, `${path} filesystem imports`).not.toMatch(/from ['"]fs(?:\/promises)?['"]/)
      expect(source, `${path} state-store import`).not.toContain('state-store')
      expect(source, `${path} path helper import`).not.toContain('./paths')
      expect(source, `${path} direct writer`).not.toMatch(
        /\b(writeFile|rename|appendFile|rm|unlink)\b/
      )
    }
  })
})
