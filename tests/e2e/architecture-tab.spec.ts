/* eslint-disable max-lines -- Why: this live suite intentionally exercises the full Orca/Scryer loop: canvas editing, MCP updates, drift, source-map editor opening, sync/cancel, and restart persistence. */
/**
 * Live architecture-tab coverage for the Orca/Scryer integration.
 *
 * This drives the same user path as the app: open New Architecture from the
 * "+" menu, edit the canvas, persist .scryer/model.scry, call the MCP bridge,
 * and detect drift after code changes under a source-mapped node.
 */

import { existsSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { TEST_REPO_PATH_FILE } from './global-setup'

async function getActiveWorktreePath(
  page: Parameters<typeof waitForSessionReady>[0]
): Promise<string> {
  return page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)
    if (!worktree) {
      throw new Error('active worktree not found')
    }
    return worktree.path
  })
}

test.describe('Architecture tab live Scryer sync', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('edits the visual model, persists model.scry, syncs MCP updates, and detects code drift', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await orcaPage.getByRole('button', { name: 'New tab' }).click()
    await orcaPage
      .getByRole('menuitem', { name: /New Architecture/i })
      .first()
      .click()

    const panel = orcaPage.getByTestId('architecture-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    await orcaPage.getByTestId('architecture-add-node').click()
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'System 1' })
    ).toBeVisible()

    const nameInput = orcaPage.getByTestId('architecture-node-name')
    await expect(nameInput).toHaveValue('System 1')
    await nameInput.fill('Shop System')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Shop System' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-add-node').click()
    await expect(nameInput).toHaveValue('Container 1')
    await nameInput.fill('API Container')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'API Container' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-source-pattern').fill('src/**/*.ts')
    await orcaPage.keyboard.press('Tab')

    const apiNode = orcaPage.getByTestId('architecture-node').filter({ hasText: 'API Container' })
    const box = await apiNode.boundingBox()
    expect(box).not.toBeNull()
    await orcaPage.mouse.move(box!.x + 12, box!.y + 12)
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(box!.x + 92, box!.y + 52)
    await orcaPage.mouse.up()
    await expect
      .poll(async () => (await apiNode.boundingBox())?.x ?? 0, {
        timeout: 5_000,
        message: 'dragging the architecture node did not move it on the live canvas'
      })
      .toBeGreaterThan(box!.x + 40)

    const modelPath = path.join(worktreePath, '.scryer', 'model.scry')
    await expect.poll(() => existsSync(modelPath), { timeout: 5_000 }).toBe(true)
    await expect
      .poll(
        () => {
          const saved = JSON.parse(readFileSync(modelPath, 'utf8'))
          const node = saved.nodes.find(
            (candidate: { data?: { name?: string } }) => candidate.data?.name === 'API Container'
          )
          return node && saved.sourceMap?.[node.id]?.[0]?.pattern === 'src/**/*.ts'
        },
        {
          timeout: 5_000,
          message: 'architecture tab did not persist the edited node name and source map'
        }
      )
      .toBeTruthy()
    const savedAfterCanvas = JSON.parse(readFileSync(modelPath, 'utf8'))
    const api = savedAfterCanvas.nodes.find(
      (node: { data?: { name?: string } }) => node.data?.name === 'API Container'
    )
    expect(api).toBeTruthy()
    const apiId = (api as { id: string }).id
    expect(savedAfterCanvas.sourceMap?.[apiId]).toEqual([{ pattern: 'src/**/*.ts' }])

    const mcpResult = await orcaPage.evaluate(
      async ({ projectPath, nodeId }) => {
        return window.api.architecture.callTool({
          projectPath,
          call: {
            toolName: 'update_nodes',
            arguments: {
              nodes: [
                {
                  node_id: nodeId,
                  status: 'implemented',
                  reason: 'Live E2E simulated agent implementation',
                  notes: ['Updated through architecture MCP bridge']
                }
              ]
            }
          }
        })
      },
      { projectPath: worktreePath, nodeId: apiId }
    )
    expect(mcpResult.ok).toBe(true)
    await expect(apiNode.filter({ hasText: 'implemented' })).toBeVisible({ timeout: 10_000 })

    await orcaPage.getByRole('button', { name: /Synced/i }).click()
    await orcaPage.waitForTimeout(100)
    await orcaPage.evaluate(async (projectPath) => {
      const separator = projectPath.includes('\\') ? '\\' : '/'
      await window.api.fs.writeFile({
        filePath: `${projectPath}${separator}src${separator}index.ts`,
        content: 'export const hello = "architecture-drift-live-test"\\n'
      })
    }, worktreePath)

    await orcaPage.getByRole('button', { name: /Drift/i }).click()
    const driftReport = orcaPage.getByTestId('architecture-drift-report')
    await expect(driftReport).toBeVisible({ timeout: 10_000 })
    await expect(driftReport).toContainText('API Container')
    await expect(driftReport).toContainText('src/**/*.ts')
  })

  test('opens source-map files in the Orca editor and restores the pre-sync model on cancel', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await orcaPage.getByRole('button', { name: 'New tab' }).click()
    await orcaPage
      .getByRole('menuitem', { name: /New Architecture/i })
      .first()
      .click()

    await expect(orcaPage.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })

    const seedResult = await orcaPage.evaluate(async (projectPath) => {
      return window.api.architecture.callTool({
        projectPath,
        call: {
          toolName: 'set_model',
          arguments: {
            data: JSON.stringify({
              nodes: [
                {
                  id: 'system',
                  data: { name: 'Shop', description: 'Commerce', kind: 'system' }
                },
                {
                  id: 'api',
                  parentId: 'system',
                  data: {
                    name: 'API',
                    description: 'HTTP API',
                    kind: 'container',
                    status: 'implemented'
                  }
                }
              ],
              edges: [],
              sourceMap: { api: [{ pattern: 'src/index.ts', line: 1, endLine: 1 }] }
            })
          }
        }
      })
    }, worktreePath)
    expect(seedResult.ok).toBe(true)

    await expect(orcaPage.getByTestId('architecture-node').filter({ hasText: 'API' })).toBeVisible({
      timeout: 10_000
    })

    await orcaPage
      .getByTestId('architecture-source-link')
      .filter({ hasText: 'src/index.ts' })
      .click()
    await expect
      .poll(
        async () => {
          return orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            return {
              activeTabType: state?.activeTabType,
              activeFile: state?.openFiles.find((file) => file.relativePath === 'src/index.ts'),
              reveal: state?.pendingEditorReveal
            }
          })
        },
        { timeout: 10_000 }
      )
      .toMatchObject({
        activeTabType: 'editor',
        activeFile: { relativePath: 'src/index.ts' },
        reveal: { line: 1 }
      })

    await orcaPage.evaluate(() => {
      window.__store?.setState((state) => ({
        settings: {
          ...state.settings,
          defaultTuiAgent: 'codex',
          agentCmdOverrides: {
            ...state.settings?.agentCmdOverrides,
            codex: 'node -e "setTimeout(()=>{},30000)"'
          }
        }
      }))
    })

    await orcaPage.getByRole('button', { name: /Architecture/i }).click()
    const terminalCountBefore = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })

    await orcaPage.getByTestId('architecture-start-sync').click()
    await expect
      .poll(
        async () => {
          return orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const activeWorktreeId = state?.activeWorktreeId
            return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
          })
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(terminalCountBefore)
    await orcaPage.getByRole('button', { name: /Architecture/i }).click()
    await expect(orcaPage.getByTestId('architecture-add-node')).toBeDisabled()

    await orcaPage.evaluate(async (projectPath) => {
      const model = await window.api.architecture.readModel({ projectPath })
      const api = model.nodes.find((node) => node.id === 'api')
      if (!api) {
        throw new Error('api node missing')
      }
      api.data.name = 'Changed During Sync'
      await window.api.architecture.writeModel({ projectPath, model })
    }, worktreePath)
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Changed During Sync' })
    ).toBeVisible({ timeout: 10_000 })

    await orcaPage.getByTestId('architecture-cancel-sync').click()
    await expect(orcaPage.getByTestId('architecture-node').filter({ hasText: 'API' })).toBeVisible({
      timeout: 10_000
    })
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Changed During Sync' })
    ).toHaveCount(0)
    expect(existsSync(path.join(worktreePath, '.scryer', '.implementing'))).toBe(false)
  })

  test('restores architecture tabs and model state after a clean relaunch', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
  {}, testInfo) => {
    const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
    if (!repoPath || !existsSync(repoPath)) {
      test.skip(true, 'Global setup did not produce a seeded test repo')
      return
    }

    const session = createRestartSession(testInfo)
    let firstApp: Awaited<ReturnType<typeof session.launch>>['app'] | null = null
    let secondApp: Awaited<ReturnType<typeof session.launch>>['app'] | null = null

    try {
      const firstLaunch = await session.launch()
      firstApp = firstLaunch.app
      const worktreeId = await attachRepoAndOpenTerminal(firstLaunch.page, repoPath)
      await waitForSessionReady(firstLaunch.page)
      const worktreePath = await firstLaunch.page.evaluate((id) => {
        const state = window.__store?.getState()
        const worktree = Object.values(state?.worktreesByRepo ?? {})
          .flat()
          .find((entry) => entry.id === id)
        if (!worktree) {
          throw new Error('worktree not found')
        }
        return worktree.path
      }, worktreeId)
      rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

      await firstLaunch.page.evaluate(
        async ({ worktreeId, worktreePath }) => {
          const store = window.__store
          if (!store) {
            throw new Error('store missing')
          }
          const state = store.getState()
          const groupId =
            state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id
          state.createArchitectureTab(worktreeId, {
            targetGroupId: groupId,
            projectPath: worktreePath,
            title: 'Architecture'
          })
          await window.api.architecture.writeModel({
            projectPath: worktreePath,
            model: {
              nodes: [
                {
                  id: 'system',
                  type: 'c4',
                  data: {
                    name: 'Restart Shop',
                    description: 'Persisted architecture',
                    kind: 'system'
                  }
                }
              ],
              edges: [],
              sourceMap: {},
              projectPath: worktreePath
            }
          })
        },
        { worktreeId, worktreePath }
      )

      await expect
        .poll(
          () =>
            firstLaunch.page.evaluate((worktreeId) => {
              const state = window.__store?.getState()
              return {
                activeType: state?.activeTabTypeByWorktree[worktreeId],
                architectureCount: state?.architectureTabsByWorktree[worktreeId]?.length ?? 0
              }
            }, worktreeId),
          { timeout: 10_000 }
        )
        .toMatchObject({ activeType: 'architecture', architectureCount: 1 })

      await session.close(firstApp)
      firstApp = null

      const secondLaunch = await session.launch()
      secondApp = secondLaunch.app
      await waitForSessionReady(secondLaunch.page)

      await expect
        .poll(
          () =>
            secondLaunch.page.evaluate((worktreeId) => {
              const state = window.__store?.getState()
              return {
                activeWorktreeId: state?.activeWorktreeId,
                activeType: state?.activeTabTypeByWorktree[worktreeId],
                architectureCount: state?.architectureTabsByWorktree[worktreeId]?.length ?? 0,
                hasUnifiedArchitecture: (state?.unifiedTabsByWorktree[worktreeId] ?? []).some(
                  (tab) => tab.contentType === 'architecture'
                )
              }
            }, worktreeId),
          { timeout: 15_000 }
        )
        .toMatchObject({
          activeWorktreeId: worktreeId,
          activeType: 'architecture',
          architectureCount: 1,
          hasUnifiedArchitecture: true
        })

      await expect(secondLaunch.page.getByTestId('architecture-panel')).toBeVisible({
        timeout: 10_000
      })
      await expect(
        secondLaunch.page.getByTestId('architecture-node').filter({ hasText: 'Restart Shop' })
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      if (secondApp) {
        await session.close(secondApp)
      }
      if (firstApp) {
        await session.close(firstApp)
      }
      session.dispose()
    }
  })
})
