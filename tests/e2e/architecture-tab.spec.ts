/* eslint-disable max-lines -- Why: this live suite intentionally exercises the full Orca/Scryer loop: canvas editing, MCP updates, drift, source-map editor opening, sync/cancel, and restart persistence. */
/**
 * Live architecture-tab coverage for the Orca/Scryer integration.
 *
 * This drives the same user path as the app: open New Architecture from the
 * "+" menu, edit the canvas, persist .scryer/model.scry, call the MCP bridge,
 * and detect drift after code changes under a source-mapped node.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
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

async function openArchitectureTab(page: Parameters<typeof waitForSessionReady>[0]): Promise<void> {
  const newTabButton = page.getByRole('button', { name: 'New tab' })
  await expect(newTabButton).toBeVisible({ timeout: 10_000 })
  await newTabButton.click({ force: true })
  const newArchitectureItem = page.getByRole('menuitem', { name: /New Architecture/i }).first()
  await expect(newArchitectureItem).toBeVisible({ timeout: 10_000 })
  await newArchitectureItem.evaluate((element) => {
    ;(element as HTMLElement).focus()
  })
  await page.keyboard.press('Enter')
  await closeOpenMenus(page)
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })
}

async function closeOpenMenus(page: Parameters<typeof waitForSessionReady>[0]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.getByRole('menu').count()) === 0) {
      return
    }
    await page.keyboard.press('Escape')
    await page.mouse.click(1, 1)
    const newTabButton = page.getByRole('button', { name: 'New tab' })
    if (await newTabButton.isVisible().catch(() => false)) {
      await newTabButton.click({ force: true })
    }
    await page.waitForTimeout(100)
  }
}

async function activateArchitectureTab(
  page: Parameters<typeof waitForSessionReady>[0]
): Promise<void> {
  await closeOpenMenus(page)
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const tabId =
      state.activeArchitectureTabId ??
      Object.values(state.architectureTabsByWorktree).flat().at(0)?.id ??
      null
    if (!tabId) {
      throw new Error('architecture tab not found')
    }
    state.setActiveArchitectureTab(tabId)
  })
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })
}

async function seedArchitectureModel(
  page: Parameters<typeof waitForSessionReady>[0],
  projectPath: string,
  model: Record<string, unknown>
): Promise<void> {
  const result = await page.evaluate(
    async ({ projectPath: nextProjectPath, nextModel }) => {
      return window.api.architecture.callTool({
        projectPath: nextProjectPath,
        call: {
          toolName: 'set_model',
          arguments: {
            data: JSON.stringify(nextModel)
          }
        }
      })
    },
    { projectPath, nextModel: model }
  )

  expect(result).toMatchObject({ ok: true })
}

async function selectTreeNode(
  page: Parameters<typeof waitForSessionReady>[0],
  name: string
): Promise<void> {
  const treeNode = page.getByTestId('architecture-tree-node').filter({ hasText: name }).first()
  await expect(treeNode).toBeVisible({ timeout: 10_000 })
  await treeNode
    .locator('button')
    .first()
    .evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
}

test.describe('Architecture tab live Scryer sync', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('manages architecture models and built-in templates through the command palette', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await openArchitectureTab(orcaPage)

    await orcaPage.getByTestId('architecture-command-open').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-command-palette')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-command-input').fill('arcade')
    await orcaPage
      .getByTestId('architecture-command-template')
      .filter({ hasText: 'Game' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-active-model')).toHaveText('arcade.scry')
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: /^Game Client/ })
    ).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', 'arcade.scry')))
      .toBe(true)

    await orcaPage.getByTestId('architecture-command-open').click({ force: true })
    await orcaPage.getByTestId('architecture-command-input').fill('arcade-copy')
    await orcaPage.getByTestId('architecture-command-save-as').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-active-model')).toHaveText('arcade-copy.scry')
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', 'arcade-copy.scry')))
      .toBe(true)

    await orcaPage.getByTestId('architecture-command-open').click({ force: true })
    await orcaPage.getByTestId('architecture-command-input').fill('blank-one')
    await orcaPage.getByTestId('architecture-command-new').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-active-model')).toHaveText('blank-one.scry')
    await expect(orcaPage.getByTestId('architecture-build-ai')).toBeVisible({ timeout: 10_000 })

    await orcaPage.getByTestId('architecture-command-open').click({ force: true })
    await orcaPage
      .getByTestId('architecture-command-open-model')
      .filter({ hasText: 'arcade-copy' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-active-model')).toHaveText('arcade-copy.scry')

    await orcaPage.getByTestId('architecture-command-open').click({ force: true })
    await orcaPage
      .getByTestId('architecture-command-model-row')
      .filter({ hasText: 'arcade-copy' })
      .getByTestId('architecture-command-delete-model')
      .click({ force: true })
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', 'arcade-copy.scry')))
      .toBe(false)
    await expect(orcaPage.getByTestId('architecture-active-model')).toHaveText('model.scry')
  })

  test('launches agent terminals from Build with AI and Fill with AI', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await orcaPage.evaluate(() => {
      window.__store?.setState((state) => ({
        settings: {
          ...state.settings,
          defaultTuiAgent: 'codex',
          agentCmdOverrides: {
            ...state.settings?.agentCmdOverrides,
            codex: 'node -e "setTimeout(()=>process.exit(0),60000)"'
          }
        }
      }))
    })

    await openArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-build-ai')).toBeVisible({ timeout: 10_000 })
    const terminalCountBeforeBuild = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })
    await orcaPage.getByTestId('architecture-build-ai').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const activeWorktreeId = state?.activeWorktreeId
            return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(terminalCountBeforeBuild)

    await activateArchitectureTab(orcaPage)
    await orcaPage.evaluate(async (projectPath) => {
      await window.api.architecture.writeModel({
        projectPath,
        modelName: 'model',
        model: {
          nodes: [
            {
              id: 'system',
              type: 'c4',
              data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        }
      })
    }, worktreePath)
    await activateArchitectureTab(orcaPage)
    const shopTreeNode = orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Shop' })
    await expect(shopTreeNode).toBeVisible({ timeout: 10_000 })
    await shopTreeNode.getByTestId('architecture-tree-drill-node').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-fill-ai')).toBeVisible({ timeout: 10_000 })

    const terminalCountBeforeFill = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })
    await orcaPage.getByTestId('architecture-fill-ai').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const activeWorktreeId = state?.activeWorktreeId
            return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(terminalCountBeforeFill)
  })

  test('requires expect evidence and a reason before verifying a node', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    const evidencePath = path.join(worktreePath, 'expect-evidence.png')
    writeFileSync(
      evidencePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64'
      )
    )

    await orcaPage.evaluate(async (projectPath) => {
      await window.api.architecture.writeModel({
        projectPath,
        model: {
          nodes: [
            {
              id: 'system',
              type: 'c4',
              data: {
                name: 'Shop',
                description: 'Commerce system',
                kind: 'system',
                status: 'implemented',
                contract: {
                  expect: [{ text: 'Checkout test passes' }],
                  ask: [],
                  never: []
                }
              }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        }
      })
    }, worktreePath)
    await openArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Shop')

    await orcaPage.getByTestId('architecture-node-status').selectOption('verified')
    await expect(orcaPage.getByTestId('architecture-node-verified-blockers')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage
      .getByTestId('architecture-node-status-reason')
      .fill('All contract evidence is attached')
    await expect(orcaPage.getByTestId('architecture-node-status-save')).toBeDisabled()

    await orcaPage.getByTestId('architecture-contract-expect-passed').selectOption('false')
    await expect(orcaPage.getByTestId('architecture-node-status-save')).toBeDisabled()
    await orcaPage
      .getByTestId('architecture-contract-expect-url')
      .fill('https://example.test/checkout-evidence')
    await orcaPage.getByTestId('architecture-contract-expect-image').setInputFiles(evidencePath)
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.find((node) => node.id === 'system')?.data.contract?.expect[0]?.image
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({
        filename: 'expect-evidence.png',
        mimeType: 'image/png'
      })
    await orcaPage.getByTestId('architecture-contract-expect-passed').selectOption('true')
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.find((node) => node.id === 'system')?.data.contract?.expect[0]
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({
        passed: true,
        url: 'https://example.test/checkout-evidence',
        image: {
          filename: 'expect-evidence.png',
          mimeType: 'image/png'
        }
      })
    await expect(orcaPage.getByTestId('architecture-node-status-save')).toBeEnabled({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-node-status-save').click({ force: true })

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const system = model.nodes.find((node) => node.id === 'system')
            const item = system?.data.contract?.expect[0]
            return {
              status: system?.data.status,
              reason: system?.data.statusReason,
              expect: item
            }
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({
        status: 'verified',
        reason: 'All contract evidence is attached',
        expect: {
          text: 'Checkout test passes',
          passed: true,
          url: 'https://example.test/checkout-evidence',
          image: {
            filename: 'expect-evidence.png',
            mimeType: 'image/png'
          }
        }
      })
  })

  test('customizes theme, uses tree navigation, edits mentions and source-map rows, and opens canvas controls', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await openArchitectureTab(orcaPage)
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container' }
        },
        {
          id: 'worker',
          parentId: 'system',
          type: 'c4',
          data: { name: 'Worker', description: 'Background jobs', kind: 'container' }
        }
      ],
      edges: [],
      flows: [{ id: 'checkout', name: 'Checkout', steps: [] }],
      sourceMap: {},
      projectPath: worktreePath
    })

    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    ).toBeVisible({ timeout: 10_000 })

    await orcaPage.getByTestId('architecture-theme-open').click({ force: true })
    await orcaPage.getByTestId('architecture-theme-mode').selectOption('dark')
    await orcaPage.getByTestId('architecture-theme-node-fill').fill('#123456')
    await expect
      .poll(() =>
        orcaPage.evaluate(() => window.localStorage.getItem('orca-scryer:architecture-theme'))
      )
      .toContain('"nodeFill":"#123456"')
    await orcaPage.getByTestId('architecture-theme-open').click({ force: true })

    await selectTreeNode(orcaPage, 'API')
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('API')
    await orcaPage.getByTestId('architecture-node-description').fill('Calls @')
    await expect(orcaPage.getByTestId('architecture-mention-dropdown')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage
      .getByTestId('architecture-mention-option')
      .filter({ hasText: 'Worker' })
      .first()
      .click({ force: true })
    await orcaPage.getByTestId('architecture-node-name').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-mention-warning')).toContainText('Worker')

    await orcaPage.getByTestId('architecture-source-add').click({ force: true })
    await orcaPage.getByTestId('architecture-source-pattern-row').last().fill('src/api.ts')
    await orcaPage.getByTestId('architecture-source-line-row').last().fill('3')
    await orcaPage.getByTestId('architecture-source-end-line-row').last().fill('8')
    await orcaPage.getByTestId('architecture-source-command-row').last().fill('npm test')
    await orcaPage.getByTestId('architecture-source-save').click({ force: true })
    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.sourceMap?.api?.[0]
      })
      .toMatchObject({ pattern: 'src/api.ts', line: 3, endLine: 8, command: 'npm test' })

    const canvasPane = orcaPage.locator('.react-flow__pane')
    const canvasPaneBox = await canvasPane.boundingBox()
    expect(canvasPaneBox).not.toBeNull()
    await orcaPage.mouse.click(
      canvasPaneBox!.x + 30,
      canvasPaneBox!.y + Math.max(30, canvasPaneBox!.height - 30),
      { button: 'right' }
    )
    await expect(orcaPage.getByTestId('architecture-canvas-context-menu')).toBeVisible()
    await orcaPage.getByTestId('architecture-context-add-node').click({ force: true })
    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.nodes.length
      })
      .toBe(4)
    await expect(orcaPage.getByTestId('architecture-zoom-fit')).toBeVisible()
    await orcaPage.getByTestId('architecture-zoom-fit').click({ force: true })
  })

  test('launches advisor review and allows manually setting person shape', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await orcaPage.evaluate(() => {
      window.__store?.setState((state) => ({
        settings: {
          ...state.settings,
          defaultTuiAgent: 'codex',
          agentCmdOverrides: {
            ...state.settings?.agentCmdOverrides,
            codex: 'node -e "setTimeout(()=>process.exit(0),5000)"'
          }
        }
      }))
    })

    await openArchitectureTab(orcaPage)
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Shop', description: 'Commerce system', kind: 'system' }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container' }
        }
      ],
      edges: [],
      flows: [],
      sourceMap: {},
      projectPath: worktreePath
    })

    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    ).toBeVisible({ timeout: 10_000 })
    const terminalCountBeforeReview = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })
    await orcaPage.getByTestId('architecture-advisor-review').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const activeWorktreeId = state?.activeWorktreeId
            return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(terminalCountBeforeReview)

    await activateArchitectureTab(orcaPage)
    await selectTreeNode(orcaPage, 'API')
    await orcaPage.getByTestId('architecture-node-shape-select').selectOption('person')
    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.nodes.find((node: { id: string }) => node.id === 'api')?.data?.shape
      })
      .toBe('person')
  })

  test('batches rapid model edits into one undo and redo step', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await openArchitectureTab(orcaPage)
    await orcaPage.getByTestId('architecture-add-node').click({ force: true })
    const nameInput = orcaPage.getByTestId('architecture-node-name')
    await expect(nameInput).toHaveValue('System 1')

    await orcaPage.waitForTimeout(1_100)
    await nameInput.fill('Shop System')
    await orcaPage.keyboard.press('Tab')
    await orcaPage.getByTestId('architecture-source-pattern').fill('src/**/*.ts')
    await orcaPage.keyboard.press('Tab')
    await expect(nameInput).toHaveValue('Shop System')
    await expect(orcaPage.getByTestId('architecture-source-pattern')).toHaveValue('src/**/*.ts')

    await orcaPage.getByTestId('architecture-undo').click({ force: true })
    await expect(nameInput).toHaveValue('System 1')
    await expect(orcaPage.getByTestId('architecture-source-pattern')).toHaveValue('')

    await orcaPage.getByTestId('architecture-redo').click({ force: true })
    await expect(nameInput).toHaveValue('Shop System')
    await expect(orcaPage.getByTestId('architecture-source-pattern')).toHaveValue('src/**/*.ts')

    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        const node = saved.nodes.find(
          (candidate: { data?: { name?: string } }) => candidate.data?.name === 'Shop System'
        )
        return node ? saved.sourceMap?.[node.id]?.[0]?.pattern : null
      })
      .toBe('src/**/*.ts')
  })

  test('edits the visual model, persists model.scry, syncs MCP updates, and detects code drift', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await openArchitectureTab(orcaPage)

    await orcaPage.getByTestId('architecture-add-node').click({ force: true })
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'System 1' })
    ).toBeVisible()

    const nameInput = orcaPage.getByTestId('architecture-node-name')
    await expect(nameInput).toHaveValue('System 1')
    await nameInput.fill('Shop System')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Shop System' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-add-node').click({ force: true })
    await expect(nameInput).toHaveValue('Container 1')
    await nameInput.fill('API Container')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API Container' })
    ).toBeVisible()
    await expect(orcaPage.getByTestId('architecture-node-shape-select')).toBeVisible()

    await orcaPage.getByTestId('architecture-source-pattern').fill('src/**/*.ts')
    await orcaPage.keyboard.press('Tab')

    await orcaPage.getByTestId('architecture-canvas-add-node').click({ force: true })
    await expect(nameInput).toHaveValue('Container 2')
    await nameInput.fill('Worker Container')
    await orcaPage.keyboard.press('Tab')
    await orcaPage.getByTestId('architecture-edge-target').selectOption({ label: 'API Container' })
    await orcaPage.getByTestId('architecture-add-edge').click({ force: true })
    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.edges[0]?.data?.label
      })
      .toBe('depends on')
    await expect(orcaPage.locator('.react-flow__minimap')).toHaveCount(0)
    await expect(orcaPage.locator('.react-flow__controls')).toHaveCount(0)

    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.edges[0]?.id ?? null
      })
      .not.toBeNull()
    const edgeId = JSON.parse(
      readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
    ).edges[0].id as string
    await orcaPage.evaluate(
      async ({ projectPath, edgeId }) => {
        await window.api.architecture.callTool({
          projectPath,
          call: {
            toolName: 'update_edges',
            arguments: {
              edges: [{ edge_id: edgeId, label: 'publishes event', method: 'HTTP' }]
            }
          }
        })
      },
      { projectPath: worktreePath, edgeId }
    )
    await expect
      .poll(() => {
        const saved = JSON.parse(
          readFileSync(path.join(worktreePath, '.scryer', 'model.scry'), 'utf8')
        )
        return saved.edges[0]?.data
      })
      .toMatchObject({ label: 'publishes event', method: 'HTTP' })

    const apiNode = orcaPage.getByTestId('architecture-node').filter({ hasText: 'API Container' })
    const dragTitle = apiNode.getByTestId('architecture-node-title').filter({
      hasText: 'API Container'
    })
    const box = await apiNode.boundingBox()
    const titleBox = await dragTitle.boundingBox()
    expect(box).not.toBeNull()
    expect(titleBox).not.toBeNull()
    const dragStart = {
      x: titleBox!.x + titleBox!.width / 2,
      y: titleBox!.y + titleBox!.height / 2
    }
    await orcaPage.mouse.move(dragStart.x, dragStart.y)
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(dragStart.x + 80, dragStart.y + 40, { steps: 12 })
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
    await selectTreeNode(orcaPage, 'API Container')
    await expect(orcaPage.getByTestId('architecture-node-status')).toHaveValue('implemented', {
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-node-diff')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-node-diff')).toContainText('proposed')
    await expect(orcaPage.getByTestId('architecture-node-diff')).toContainText('implemented')
    await closeOpenMenus(orcaPage)
    await orcaPage.getByTestId('architecture-node-diff-dismiss').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-node-diff')).toHaveCount(0)

    await orcaPage.evaluate(
      (projectPath) => window.api.architecture.markSynced({ projectPath }),
      worktreePath
    )
    await orcaPage.waitForTimeout(100)
    await orcaPage.evaluate(async (projectPath) => {
      const separator = projectPath.includes('\\') ? '\\' : '/'
      await window.api.fs.writeFile({
        filePath: `${projectPath}${separator}src${separator}index.ts`,
        content: 'export const hello = "architecture-drift-live-test"\\n'
      })
    }, worktreePath)

    await orcaPage.getByTestId('architecture-sync-drift').click({ force: true })
    const driftReport = orcaPage.getByTestId('architecture-drift-report')
    await expect(driftReport).toBeVisible({ timeout: 10_000 })
    await expect(driftReport).toContainText('API Container')
    await expect(driftReport).toContainText('src/**/*.ts')

    await orcaPage.getByTestId('architecture-sync-dismiss').click({ force: true })
    await expect(orcaPage.getByText('Marked architecture as synced')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.waitForTimeout(5500)
    await expect(orcaPage.getByText('Marked architecture as synced')).toHaveCount(0)
  })

  test('opens flow editing, persists steps and branches, and follows flow source links', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await orcaPage.evaluate(async (projectPath) => {
      const separator = projectPath.includes('\\') ? '\\' : '/'
      await window.api.fs.writeFile({
        filePath: `${projectPath}${separator}src${separator}flow.ts`,
        content: 'export function flowFixture() { return "ok" }\\n'
      })
    }, worktreePath)

    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: {
            name: 'Shop',
            description: 'Commerce system',
            kind: 'system'
          }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          position: { x: 0, y: 0 },
          data: {
            name: 'API',
            description: 'HTTP boundary',
            kind: 'container',
            status: 'implemented'
          }
        }
      ],
      edges: [],
      sourceMap: {
        'flow-order': [{ pattern: 'src/flow.ts', line: 1, endLine: 1 }]
      },
      groups: [],
      flows: [
        {
          id: 'flow-order',
          name: 'Request flow',
          description: 'Document the request path',
          steps: []
        }
      ]
    })

    await openArchitectureTab(orcaPage)
    await orcaPage.getByTestId('architecture-mode-flows').click({ force: true })

    await expect(orcaPage.getByTestId('architecture-flow-editor')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-flow-name')).toHaveValue('Request flow')

    await orcaPage.getByTestId('architecture-flow-add-step').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-flow-step-card')).toBeVisible({
      timeout: 10_000
    })

    const firstStep = orcaPage.getByTestId('architecture-flow-step-card').first()
    await firstStep.getByTestId('architecture-flow-step-textarea').fill('API validates request')
    await firstStep.getByTestId('architecture-flow-step-textarea').click({ force: true })
    await orcaPage.keyboard.press('End')
    await orcaPage.keyboard.type(' via @')
    await expect(orcaPage.getByTestId('architecture-mention-dropdown')).toBeVisible({
      timeout: 5_000
    })
    await orcaPage
      .getByTestId('architecture-mention-option')
      .filter({ hasText: 'API' })
      .first()
      .click({ force: true })
    await expect(firstStep.getByTestId('architecture-flow-step-textarea')).toHaveValue(
      'API validates request via @[API]'
    )
    await firstStep.getByTestId('architecture-flow-step-add-branches').click({ force: true })

    await expect(firstStep.getByTestId('architecture-flow-branch-card')).toHaveCount(2)
    await firstStep
      .getByTestId('architecture-flow-branch-card')
      .first()
      .getByTestId('architecture-flow-branch-condition')
      .fill('if cache hit')
    await firstStep
      .getByTestId('architecture-flow-branch-card')
      .first()
      .getByTestId('architecture-flow-branch-add-step')
      .click({ force: true })

    const branchStep = firstStep
      .getByTestId('architecture-flow-branch-card')
      .first()
      .getByTestId('architecture-flow-step-card')
      .first()
    await branchStep.getByTestId('architecture-flow-step-textarea').fill('Return cached response')

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.sourceMap?.['flow-order']?.[0]
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({ pattern: 'src/flow.ts', line: 1, endLine: 1 })
    await orcaPage.getByTestId('architecture-flow-source-link').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const file = state?.openFiles.find((entry) => entry.relativePath === 'src/flow.ts')
            return {
              activeType: state?.activeTabType,
              openFile: file?.relativePath
            }
          }),
        { timeout: 10_000 }
      )
      .toMatchObject({ activeType: 'editor', openFile: 'src/flow.ts' })
  })

  test('opens groups view, moves members between groups, and nests groups by drag and drop', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await orcaPage.evaluate(async (projectPath) => {
      await window.api.architecture.writeModel({
        projectPath,
        model: {
          nodes: [
            {
              id: 'system',
              type: 'c4',
              data: {
                name: 'Shop',
                description: 'Commerce system',
                kind: 'system'
              }
            },
            {
              id: 'api',
              parentId: 'system',
              type: 'c4',
              position: { x: 0, y: 0 },
              data: {
                name: 'API',
                description: 'HTTP boundary',
                kind: 'container',
                status: 'implemented'
              }
            },
            {
              id: 'worker',
              parentId: 'system',
              type: 'c4',
              position: { x: 280, y: 0 },
              data: {
                name: 'Worker',
                description: 'Background jobs',
                kind: 'container',
                status: 'proposed'
              }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        }
      })
    }, worktreePath)
    await openArchitectureTab(orcaPage)

    const shopTreeNode = orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Shop' })
    await expect(shopTreeNode).toBeVisible({ timeout: 10_000 })
    await shopTreeNode.getByTestId('architecture-tree-drill-node').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    ).toBeVisible({ timeout: 10_000 })
    await orcaPage.getByTestId('architecture-mode-groups').click({ force: true })

    await expect(orcaPage.getByTestId('architecture-groups-main')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-groups-palette')).toBeVisible({
      timeout: 10_000
    })

    await orcaPage.getByTestId('architecture-group-create').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-group-card')).toHaveCount(1)
    const backendCard = orcaPage.getByTestId('architecture-group-card').first()
    await expect(backendCard.getByTestId('architecture-group-name')).toHaveValue('New group')
    await backendCard.getByTestId('architecture-group-name').fill('Backend')
    await backendCard
      .getByTestId('architecture-group-contract-expect')
      .fill('Keep API and worker boundaries explicit')

    const apiPaletteItem = orcaPage
      .getByTestId('architecture-groups-palette-item')
      .filter({ hasText: 'API' })
      .first()
    const apiBox = await apiPaletteItem.boundingBox()
    const backendBox = await backendCard.boundingBox()
    expect(apiBox).not.toBeNull()
    expect(backendBox).not.toBeNull()
    await orcaPage.mouse.move(apiBox!.x + apiBox!.width / 2, apiBox!.y + apiBox!.height / 2)
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(
      backendBox!.x + backendBox!.width / 2,
      backendBox!.y + backendBox!.height / 2,
      { steps: 12 }
    )
    await orcaPage.mouse.up()

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const backend = model.groups?.find((group) => group.name === 'Backend')
            return backend?.memberIds ?? []
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual(['api'])

    await orcaPage.getByTestId('architecture-group-create').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-group-card')).toHaveCount(2)
    const platformCard = orcaPage.getByTestId('architecture-group-card').last()
    await expect(platformCard.getByTestId('architecture-group-name')).toHaveValue('New group')
    await platformCard.getByTestId('architecture-group-name').fill('Platform')
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return (model.groups ?? []).map((group) => group.name).sort()
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual(['Backend', 'Platform'])

    const nestedBackendCard = orcaPage.getByTestId('architecture-group-card').first()
    await nestedBackendCard.evaluate((card) => {
      ;(card as HTMLElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-selected-group-editor')).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-selected-group-name')).toHaveValue('Backend')
    await orcaPage
      .getByTestId('architecture-selected-group-description')
      .fill('Runtime services owned by the platform team')
    await orcaPage
      .getByTestId('architecture-selected-group-contract-ask')
      .fill('Keep queue ownership explicit')
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const backend = model.groups?.find((group) => group.name === 'Backend')
            return {
              description: backend?.description,
              ask: backend?.contract?.ask ?? []
            }
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual({
        description: 'Runtime services owned by the platform team',
        ask: ['Keep queue ownership explicit']
      })

    await orcaPage.evaluate(async (projectPath) => {
      const model = await window.api.architecture.readModel({ projectPath })
      const backend = model.groups?.find((group) => group.name === 'Backend')
      const platform = model.groups?.find((group) => group.name === 'Platform')
      if (!backend || !platform) {
        throw new Error('Expected Backend and Platform groups before nesting')
      }
      await window.api.architecture.writeModel({
        projectPath,
        model: {
          ...model,
          groups: (model.groups ?? []).map((group) =>
            group.id === backend.id ? { ...group, parentGroupId: platform.id } : group
          )
        }
      })
    }, worktreePath)

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const backend = model.groups?.find((group) => group.name === 'Backend')
            const platform = model.groups?.find((group) => group.name === 'Platform')
            return {
              backendMembers: backend?.memberIds ?? [],
              backendParent: backend?.parentGroupId,
              platformMembers: platform?.memberIds ?? []
            }
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({
        backendMembers: ['api'],
        backendParent: expect.any(String),
        platformMembers: []
      })

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const backend = model.groups?.find((group) => group.name === 'Backend')
            return backend?.contract?.expect ?? []
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual(['Keep API and worker boundaries explicit'])

    await orcaPage.getByTestId('architecture-mode-topology').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-group-bubble')).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-group-bubble')).toContainText('Backend')
    await orcaPage.getByTestId('architecture-mode-groups').click({ force: true })

    await orcaPage.evaluate(async (projectPath) => {
      const model = await window.api.architecture.readModel({ projectPath })
      await window.api.architecture.writeModel({
        projectPath,
        model: {
          ...model,
          groups: (model.groups ?? []).map((group) =>
            group.name === 'Backend' ? { ...group, memberIds: [] } : group
          )
        }
      })
    }, worktreePath)

    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const backend = model.groups?.find((group) => group.name === 'Backend')
            return backend?.memberIds ?? []
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual([])

    await orcaPage.evaluate(async (projectPath) => {
      const model = await window.api.architecture.readModel({ projectPath })
      await window.api.architecture.writeModel({
        projectPath,
        model: {
          ...model,
          groups: [
            ...(model.groups ?? []),
            { id: 'runtime-group', name: 'Runtime', memberIds: ['api', 'worker'] }
          ]
        }
      })
    }, worktreePath)
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            const runtime = model.groups?.find((group) => group.name === 'Runtime')
            return runtime?.memberIds.sort() ?? []
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toEqual(['api', 'worker'])
  })

  test('opens source-map files in the Orca editor and restores the pre-sync model on cancel', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await openArchitectureTab(orcaPage)

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
                },
                {
                  id: 'handler',
                  parentId: 'api',
                  data: {
                    name: 'Handler',
                    description: 'Request handler',
                    kind: 'component',
                    status: 'proposed'
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

    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    ).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.sourceMap?.api?.[0]
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toMatchObject({ pattern: 'src/index.ts', line: 1, endLine: 1 })

    await orcaPage
      .getByTestId('architecture-source-link')
      .filter({ hasText: 'src/index.ts' })
      .evaluate((button) => {
        ;(button as HTMLButtonElement).click()
      })
    await expect
      .poll(
        async () => {
          return orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            return {
              activeTabType: state?.activeTabType,
              activeFile: state?.openFiles.find((file) => file.relativePath === 'src/index.ts')
            }
          })
        },
        { timeout: 10_000 }
      )
      .toMatchObject({
        activeTabType: 'editor',
        activeFile: { relativePath: 'src/index.ts' }
      })

    await activateArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-sync-lock-toggle')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-sync-lock-toggle').click({ force: true })
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', '.implementing')), {
        timeout: 5_000
      })
      .toBe(true)

    await orcaPage.getByTestId('architecture-sync-lock-toggle').click({ force: true })
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', '.implementing')), {
        timeout: 5_000
      })
      .toBe(false)

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

    await activateArchitectureTab(orcaPage)
    const apiTreeNode = orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    await expect(apiTreeNode).toBeVisible({ timeout: 10_000 })
    await apiTreeNode.getByTestId('architecture-tree-drill-node').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.some((node) => node.id === 'handler')
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toBe(true)
    const handlerTreeNode = orcaPage
      .getByTestId('architecture-tree-node')
      .filter({ hasText: 'Handler' })
    await handlerTreeNode.getByTestId('architecture-tree-drill-node').evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(orcaPage.getByTestId('architecture-code-level-rack')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-code-add-operation').click({ force: true })
    await expect(orcaPage.getByTestId('architecture-code-card')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Operation 1')
    await orcaPage.getByTestId('architecture-node-name').fill('Handle Request')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-code-card').filter({ hasText: 'Handle Request' })
    ).toBeVisible({ timeout: 10_000 })
    await orcaPage.getByTestId('architecture-code-level-back').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.some((node) => node.id === 'handler')
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toBe(true)
    await activateArchitectureTab(orcaPage)
    const terminalCountBefore = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })

    await orcaPage.getByTestId('architecture-sync-start').click({ force: true })
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
    await activateArchitectureTab(orcaPage)
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
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.find((node) => node.id === 'api')?.data.name
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toBe('Changed During Sync')

    await orcaPage.getByTestId('architecture-sync-cancel').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(async (projectPath) => {
            const model = await window.api.architecture.readModel({ projectPath })
            return model.nodes.find((node) => node.id === 'api')?.data.name
          }, worktreePath),
        { timeout: 10_000 }
      )
      .toBe('API')
    expect(existsSync(path.join(worktreePath, '.scryer', '.implementing'))).toBe(false)
  })

  test('auto-finishes sync when the launched agent reports done', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })

    await openArchitectureTab(orcaPage)
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          data: { name: 'Shop', description: 'Commerce', kind: 'system' }
        }
      ],
      edges: []
    })
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Shop' })
    ).toBeVisible({ timeout: 10_000 })

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

    const terminalIdsBeforeSync = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId
        ? (state?.tabsByWorktree[activeWorktreeId] ?? []).map((tab) => tab.id)
        : []
    })
    await orcaPage.getByTestId('architecture-sync-start').click({ force: true })
    await expect
      .poll(
        async () =>
          orcaPage.evaluate((previousIds) => {
            const state = window.__store?.getState()
            const activeWorktreeId = state?.activeWorktreeId
            const tabs = activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []) : []
            return tabs.find((tab) => !previousIds.includes(tab.id))?.id ?? null
          }, terminalIdsBeforeSync),
        { timeout: 10_000 }
      )
      .not.toBeNull()
    const syncTerminalTabId = await orcaPage.evaluate((previousIds) => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      const tabs = activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []) : []
      return tabs.find((tab) => !previousIds.includes(tab.id))?.id ?? null
    }, terminalIdsBeforeSync)
    expect(syncTerminalTabId).not.toBeNull()
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', '.implementing')), {
        timeout: 5_000
      })
      .toBe(true)
    await orcaPage.evaluate((tabId) => {
      window.__store?.getState().setAgentStatus(
        `${tabId}:0`,
        {
          state: 'done',
          prompt: 'Architecture sync',
          agentType: 'codex',
          lastAssistantMessage: 'sync complete'
        },
        '* Codex done',
        { updatedAt: Date.now() + 1_000, stateStartedAt: Date.now() + 1_000 }
      )
    }, syncTerminalTabId)
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(
            async (projectPath) => window.api.architecture.isSyncing({ projectPath }),
            worktreePath
          ),
        { timeout: 15_000 }
      )
      .toBe(false)

    await activateArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-add-node')).toBeEnabled({ timeout: 10_000 })
    expect(existsSync(path.join(worktreePath, '.scryer', 'model.baseline.scry'))).toBe(true)
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
        secondLaunch.page.getByTestId('architecture-tree-node').filter({ hasText: 'Restart Shop' })
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
