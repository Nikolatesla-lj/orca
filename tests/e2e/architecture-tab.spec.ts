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

async function openArchitectureTab(page: Parameters<typeof waitForSessionReady>[0]): Promise<void> {
  await page.getByRole('button', { name: 'New tab' }).click()
  await page
    .getByRole('menuitem', { name: /New Architecture/i })
    .first()
    .click()
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

    await openArchitectureTab(orcaPage)

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
    await expect(
      orcaPage.locator('[data-testid="architecture-node"][data-node-kind="container"]')
    ).toBeVisible()
    await expect(orcaPage.getByTestId('architecture-node-shape')).toBeVisible()

    await orcaPage.getByTestId('architecture-source-pattern').fill('src/**/*.ts')
    await orcaPage.keyboard.press('Tab')

    await orcaPage.getByTestId('architecture-canvas-add-node').click()
    await expect(nameInput).toHaveValue('Container 2')
    await nameInput.fill('Worker Container')
    await orcaPage.keyboard.press('Tab')
    await orcaPage.getByTestId('architecture-edge-target').selectOption({ label: 'API Container' })
    await orcaPage.getByTestId('architecture-add-edge').click()
    await expect(
      orcaPage.getByTestId('architecture-edge-label').filter({ hasText: 'depends on' })
    ).toBeVisible()
    await expect(orcaPage.getByTestId('architecture-edge-path')).toHaveCount(1)
    await expect(orcaPage.locator('.react-flow__minimap')).toHaveCount(0)
    await expect(orcaPage.locator('.react-flow__controls')).toHaveCount(0)

    await orcaPage.getByTestId('architecture-edge-label').filter({ hasText: 'depends on' }).click()
    await expect(orcaPage.getByTestId('architecture-edge-editor')).toBeVisible()
    await orcaPage.getByTestId('architecture-edge-label-input').fill('publishes event')
    await orcaPage.getByTestId('architecture-edge-method-input').fill('HTTP')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-edge-label').filter({ hasText: 'publishes event' })
    ).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-edge-label').filter({ hasText: 'HTTP' })
    ).toBeVisible()

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
    await expect(apiNode.filter({ hasText: 'implemented' })).toBeVisible({ timeout: 10_000 })
    await apiNode
      .getByTestId('architecture-node-title')
      .filter({ hasText: 'API Container' })
      .click()
    await expect(apiNode.locator('.scryer-changed-glow')).toHaveCount(1, { timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-node-diff')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-node-diff')).toContainText('proposed')
    await expect(orcaPage.getByTestId('architecture-node-diff')).toContainText('implemented')
    await orcaPage.getByTestId('architecture-node-diff-dismiss').click()
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

    await orcaPage.getByTestId('architecture-sync-drift').click()
    const driftReport = orcaPage.getByTestId('architecture-drift-report')
    await expect(driftReport).toBeVisible({ timeout: 10_000 })
    await expect(driftReport).toContainText('API Container')
    await expect(driftReport).toContainText('src/**/*.ts')

    await orcaPage.getByTestId('architecture-sync-dismiss').click()
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
    await orcaPage.getByTestId('architecture-mode-flows').click()

    await expect(orcaPage.getByTestId('architecture-flow-editor')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-flow-name')).toHaveValue('Request flow')

    await orcaPage.getByTestId('architecture-flow-add-step').click()
    await expect(orcaPage.getByTestId('architecture-flow-step-card')).toBeVisible({
      timeout: 10_000
    })

    const firstStep = orcaPage.getByTestId('architecture-flow-step-card').first()
    await firstStep.getByTestId('architecture-flow-step-textarea').fill('API validates request')
    await firstStep.getByTestId('architecture-flow-step-textarea').click()
    await orcaPage.keyboard.press('End')
    await orcaPage.keyboard.type(' via @')
    await expect(orcaPage.getByTestId('architecture-mention-dropdown')).toBeVisible({
      timeout: 5_000
    })
    await orcaPage
      .getByTestId('architecture-mention-option')
      .filter({ hasText: 'API' })
      .first()
      .click()
    await expect(firstStep.getByTestId('architecture-flow-step-textarea')).toHaveValue(
      'API validates request via @[API]'
    )
    await firstStep.getByTestId('architecture-flow-step-add-branches').click()

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
      .click()

    const branchStep = firstStep
      .getByTestId('architecture-flow-branch-card')
      .first()
      .getByTestId('architecture-flow-step-card')
      .first()
    await branchStep.getByTestId('architecture-flow-step-textarea').fill('Return cached response')

    await orcaPage.getByTestId('architecture-flow-source-link').click()
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const file = state?.openFiles.find((entry) => entry.relativePath === 'src/flow.ts')
            return {
              activeType: state?.activeTabType,
              openFile: file?.relativePath,
              reveal: state?.pendingEditorReveal?.line
            }
          }),
        { timeout: 10_000 }
      )
      .toMatchObject({ activeType: 'editor', openFile: 'src/flow.ts', reveal: 1 })
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

    const apiAtCurrentLevel = orcaPage
      .getByTestId('architecture-node')
      .filter({ hasText: 'API' })
      .first()
    let initialLevel = 'loading'
    await expect
      .poll(
        async () => {
          if (await apiAtCurrentLevel.isVisible().catch(() => false)) {
            initialLevel = 'system'
            return initialLevel
          }
          const shopVisible = await orcaPage
            .getByTestId('architecture-node')
            .filter({ hasText: 'Shop' })
            .first()
            .isVisible()
            .catch(() => false)
          initialLevel = shopVisible ? 'root' : 'loading'
          return initialLevel
        },
        { timeout: 10_000 }
      )
      .not.toBe('loading')
    if (initialLevel === 'root') {
      const shopNode = orcaPage.getByTestId('architecture-node').filter({ hasText: 'Shop' }).first()
      await expect(shopNode.getByTestId('architecture-node-title')).toBeVisible({ timeout: 10_000 })
      await shopNode.getByTestId('architecture-node-title').click()
      await orcaPage.getByTitle('Drill into node').click()
    }
    await expect(orcaPage.getByTestId('architecture-node').filter({ hasText: 'API' })).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-mode-groups').click()

    await expect(orcaPage.getByTestId('architecture-groups-main')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-groups-palette')).toBeVisible({
      timeout: 10_000
    })

    await orcaPage.getByTestId('architecture-group-create').click()
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

    await orcaPage.getByTestId('architecture-group-create').click()
    await expect(orcaPage.getByTestId('architecture-group-card')).toHaveCount(2)
    const platformCard = orcaPage.getByTestId('architecture-group-card').last()
    await expect(platformCard.getByTestId('architecture-group-name')).toHaveValue('New group')
    await platformCard.getByTestId('architecture-group-name').fill('Platform')

    const backendHandle = backendCard.getByTestId('architecture-group-drag-handle')
    const backendHandleBox = await backendHandle.boundingBox()
    const platformBox = await platformCard.boundingBox()
    expect(backendHandleBox).not.toBeNull()
    expect(platformBox).not.toBeNull()
    await orcaPage.mouse.move(
      backendHandleBox!.x + backendHandleBox!.width / 2,
      backendHandleBox!.y + backendHandleBox!.height / 2
    )
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(
      platformBox!.x + platformBox!.width / 2,
      platformBox!.y + platformBox!.height / 2,
      { steps: 12 }
    )
    await orcaPage.mouse.up()

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

    await backendCard.click()
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

    await orcaPage.getByTestId('architecture-mode-topology').click()
    await expect(orcaPage.getByTestId('architecture-group-bubble')).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-group-bubble')).toContainText('Backend')
    await orcaPage.getByTestId('architecture-mode-groups').click()

    await backendCard.getByTestId('architecture-group-member-remove').click()

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

    await orcaPage.getByTestId('architecture-mode-topology').click()
    const apiTopologyTitle = orcaPage
      .getByTestId('architecture-node')
      .filter({ hasText: 'API' })
      .first()
      .getByTestId('architecture-node-title')
    const workerTopologyTitle = orcaPage
      .getByTestId('architecture-node')
      .filter({ hasText: 'Worker' })
      .first()
      .getByTestId('architecture-node-title')
    await orcaPage.keyboard.down('Shift')
    await apiTopologyTitle.click()
    await workerTopologyTitle.click()
    await orcaPage.keyboard.up('Shift')
    await expect(orcaPage.getByTestId('architecture-multi-selection-panel')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-multi-group-name').fill('Runtime')
    await orcaPage.getByTestId('architecture-multi-create-group').click()
    await expect(orcaPage.getByTestId('architecture-selected-group-editor')).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-selected-group-name')).toHaveValue('Runtime')
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

    await orcaPage.getByRole('button', { name: /Architecture/i }).click()
    await expect(orcaPage.getByTestId('architecture-sync-lock-toggle')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-sync-lock-toggle').click()
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', '.implementing')), {
        timeout: 5_000
      })
      .toBe(true)

    await orcaPage.getByTestId('architecture-sync-lock-toggle').click()
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

    await orcaPage.getByRole('button', { name: /Architecture/i }).click()
    const apiTitle = orcaPage
      .getByTestId('architecture-node')
      .filter({ hasText: 'API' })
      .getByTestId('architecture-node-title')
    await apiTitle.click()
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('API')
    await orcaPage.getByTitle('Drill into node').click()
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Handler' })
    ).toBeVisible({ timeout: 10_000 })
    const handlerNode = orcaPage.getByTestId('architecture-node').filter({ hasText: 'Handler' })
    await handlerNode.getByTestId('architecture-node-title').click()
    await handlerNode.getByTitle('Drill into node').click()
    await expect(orcaPage.getByTestId('architecture-code-level-rack')).toBeVisible({
      timeout: 10_000
    })
    await orcaPage.getByTestId('architecture-code-add-operation').click()
    await expect(orcaPage.getByTestId('architecture-code-card')).toBeVisible({ timeout: 10_000 })
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Operation 1')
    await orcaPage.getByTestId('architecture-node-name').fill('Handle Request')
    await orcaPage.keyboard.press('Tab')
    await expect(
      orcaPage.getByTestId('architecture-code-card').filter({ hasText: 'Handle Request' })
    ).toBeVisible({ timeout: 10_000 })
    await orcaPage.getByTestId('architecture-undo').click()
    await expect(
      orcaPage.getByTestId('architecture-code-card').filter({ hasText: 'Handle Request' })
    ).toHaveCount(0)
    await orcaPage.getByTestId('architecture-redo').click()
    await expect(
      orcaPage.getByTestId('architecture-code-card').filter({ hasText: 'Handle Request' })
    ).toBeVisible({ timeout: 10_000 })
    await orcaPage.getByTestId('architecture-code-level-back').click()
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Handler' })
    ).toBeVisible({ timeout: 10_000 })
    const terminalCountBefore = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const activeWorktreeId = state?.activeWorktreeId
      return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).length : 0
    })

    await orcaPage.getByTestId('architecture-sync-start').click()
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

    await orcaPage.getByTestId('architecture-sync-cancel').click()
    await expect(orcaPage.getByTestId('architecture-node').filter({ hasText: 'API' })).toBeVisible({
      timeout: 10_000
    })
    await expect(
      orcaPage.getByTestId('architecture-node').filter({ hasText: 'Changed During Sync' })
    ).toHaveCount(0)
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
    await expect(orcaPage.getByTestId('architecture-node').filter({ hasText: 'Shop' })).toBeVisible(
      {
        timeout: 10_000
      }
    )

    const statusReportingAgentCommand = `node -e ${JSON.stringify(
      'process.stdout.write(\'\\x1b]9999;{"state":"working","agentType":"codex"}\\x07\'); setTimeout(()=>{process.stdout.write(\'\\x1b]9999;{"state":"done","agentType":"codex","lastAssistantMessage":"sync complete"}\\x07\')},1000); setTimeout(()=>process.exit(0),1100)'
    )}`

    await orcaPage.evaluate((command) => {
      window.__store?.setState((state) => ({
        settings: {
          ...state.settings,
          defaultTuiAgent: 'codex',
          agentCmdOverrides: {
            ...state.settings?.agentCmdOverrides,
            codex: command
          }
        }
      }))
    }, statusReportingAgentCommand)

    await orcaPage.getByTestId('architecture-sync-start').click()
    await expect
      .poll(() => existsSync(path.join(worktreePath, '.scryer', '.implementing')), {
        timeout: 5_000
      })
      .toBe(true)
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

    await orcaPage.getByRole('button', { name: /Architecture/i }).click()
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
