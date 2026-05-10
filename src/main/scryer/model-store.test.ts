import { mkdir, mkdtemp, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  getProjectModelPath,
  markSynced,
  readBaseline,
  readModel,
  writeBaseline,
  writeModel
} from './model-store'

describe('project-local Scryer model store', () => {
  it('creates and round-trips .scryer/model.scry with a real project path', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-model-'))
    const model = await readModel(projectPath)

    expect(model).toMatchObject({
      nodes: [],
      edges: [],
      startingLevel: 'system',
      sourceMap: {},
      projectPath
    })
    expect(await readFile(getProjectModelPath(projectPath), 'utf8')).toContain('"nodes"')

    model.nodes.push({
      id: 'node-1',
      type: 'c4',
      position: { x: 10, y: 20 },
      data: {
        name: 'Web App',
        description: 'User interface',
        kind: 'container',
        status: 'proposed'
      }
    })
    await writeModel(projectPath, model)

    expect((await readModel(projectPath)).nodes[0].data.name).toBe('Web App')
  })

  it('writes baseline and sync timestamp files used by drift checks', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-baseline-'))
    const model = await readModel(projectPath)
    await writeBaseline(projectPath, model)
    await markSynced(projectPath)

    expect(await readBaseline(projectPath)).toMatchObject({ nodes: [], edges: [] })
    expect((await stat(join(projectPath, '.scryer', '.sync'))).isFile()).toBe(true)
  })

  it('rejects invalid model JSON instead of silently creating a fake graph', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-invalid-'))
    await mkdir(join(projectPath, '.scryer'), { recursive: true })
    await writeFile(getProjectModelPath(projectPath), '{"nodes":')

    await expect(readModel(projectPath)).rejects.toThrow(/Invalid Scryer model JSON/)
  })
})
