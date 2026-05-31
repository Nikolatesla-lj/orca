import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../persistence'
import { invalidateAuthorizedRootsCache } from './filesystem-auth'
import {
  openDiagramSourceTarget,
  resolveWorkspaceSourcePattern,
  type SourceOpenLocation
} from './diagram-source-targets'

function storeFor(projectPath: string): Store {
  return {
    getRepos: () => [
      {
        id: 'repo-1',
        path: projectPath,
        displayName: 'repo',
        badgeColor: '#000',
        addedAt: 0
      }
    ],
    getSettings: () => ({})
  } as unknown as Store
}

function storeWithoutRepos(): Store {
  return {
    getRepos: () => [],
    getSettings: () => ({})
  } as unknown as Store
}

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-source-target-'))
  await mkdir(join(projectPath, 'src', 'api'), { recursive: true })
  await mkdir(join(projectPath, 'test'), { recursive: true })
  await writeFile(join(projectPath, 'src', 'api', 'index.ts'), 'export const api = 1\n', 'utf8')
  await writeFile(join(projectPath, 'src', 'api', 'worker.ts'), 'export const worker = 1\n', 'utf8')
  await writeFile(join(projectPath, 'test', 'flow.test.ts'), 'test("flow", () => {})\n', 'utf8')
  return projectPath
}

beforeEach(() => {
  invalidateAuthorizedRootsCache()
})

describe('diagram source target runtime helpers', () => {
  it('resolves exact and glob source targets only after project authorization', async () => {
    const projectPath = await createProject()
    const context = { projectPath, store: storeFor(projectPath) }

    await expect(resolveWorkspaceSourcePattern(context, 'src/api/index.ts')).resolves.toEqual({
      ok: true,
      authorizedProjectPath: projectPath,
      normalizedPattern: 'src/api/index.ts',
      matchedRelativePaths: ['src/api/index.ts']
    })

    await expect(resolveWorkspaceSourcePattern(context, 'src/**/*.ts')).resolves.toEqual({
      ok: true,
      authorizedProjectPath: projectPath,
      normalizedPattern: 'src/**/*.ts',
      matchedRelativePaths: ['src/api/index.ts', 'src/api/worker.ts']
    })

    await expect(
      resolveWorkspaceSourcePattern({ projectPath, store: storeWithoutRepos() }, 'src/api/index.ts')
    ).resolves.toMatchObject({
      ok: false,
      code: 'controller.invalid-source-target',
      reason: 'unauthorized-project'
    })
  })

  it('opens one source target with target line metadata and requires selection for multiple matches', async () => {
    const projectPath = await createProject()
    const context = { projectPath, store: storeFor(projectPath) }

    await expect(
      openDiagramSourceTarget(context, {
        type: 'source',
        pattern: 'src/api/index.ts',
        line: 7,
        endLine: 9
      })
    ).resolves.toEqual({
      ok: true,
      action: 'opened',
      locations: [
        { relativePath: 'src/api/index.ts', line: 7, endLine: 9 } satisfies SourceOpenLocation
      ]
    })

    await expect(
      openDiagramSourceTarget(context, { type: 'source', pattern: 'src/**/*.ts', line: 3 })
    ).resolves.toEqual({
      ok: true,
      action: 'selection-required',
      locations: [
        { relativePath: 'src/api/index.ts', line: 3 },
        { relativePath: 'src/api/worker.ts', line: 3 }
      ]
    })
  })

  it('rejects unsafe, missing, and symlink-escaped source targets without opening outside the project', async () => {
    const projectPath = await createProject()
    const outsidePath = await mkdtemp(join(tmpdir(), 'orca-scryer-source-outside-'))
    await writeFile(join(outsidePath, 'secret.ts'), 'export const secret = 1\n', 'utf8')
    await symlink(join(outsidePath, 'secret.ts'), join(projectPath, 'src', 'api', 'secret-link.ts'))
    const context = { projectPath, store: storeFor(projectPath) }

    await expect(
      openDiagramSourceTarget(context, { type: 'source', pattern: '../outside.ts' })
    ).resolves.toMatchObject({
      ok: false,
      code: 'controller.invalid-source-target',
      reason: 'parent-traversal'
    })

    await expect(
      openDiagramSourceTarget(context, { type: 'source', pattern: 'src/missing.ts' })
    ).resolves.toMatchObject({
      ok: false,
      code: 'controller.source-open-failed',
      reason: 'no-matches'
    })

    await expect(
      openDiagramSourceTarget(context, { type: 'source', pattern: 'src/api/*.ts' })
    ).resolves.toMatchObject({
      ok: false,
      code: 'controller.invalid-source-target',
      reason: 'glob-escape'
    })

    await expect(readFile(join(outsidePath, 'secret.ts'), 'utf8')).resolves.toContain('secret')
  })
})
