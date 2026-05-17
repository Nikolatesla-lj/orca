/* eslint-disable max-lines -- Why: this live checklist keeps the remaining human migration scenarios together so the feature matrix is auditable. */
/**
 * Human-style Scryer migration checks that complement architecture-tab.spec.ts.
 *
 * These tests use the live Electron renderer, click the same controls a user
 * would click, and verify that the .scry files or local settings persist.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const THEME_ROLES = [
  'background',
  'foreground',
  'surface',
  'muted',
  'border',
  'primary',
  'secondary',
  'accent',
  'canvas',
  'nodeFill',
  'nodeBorder'
] as const

const PALETTE_BY_ROLE = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue'
] as const

type SavedModel = {
  nodes: {
    id: string
    parentId?: string
    data?: Record<string, unknown>
    position?: { x: number; y: number }
  }[]
  edges?: { id: string; source: string; target: string; data?: Record<string, unknown> }[]
  sourceMap?: Record<string, unknown>
}

async function getActiveWorktreePath(page: Page): Promise<string> {
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

async function openArchitectureTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New tab' }).click()
  await page
    .getByRole('menuitem', { name: /New Architecture/i })
    .first()
    .click()
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 30_000 })
}

async function seedArchitectureModel(
  page: Page,
  projectPath: string,
  model: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ({ nextProjectPath, nextModel }) => {
      await window.api.architecture.writeModel({
        projectPath: nextProjectPath,
        model: nextModel
      })
    },
    { nextProjectPath: projectPath, nextModel: model }
  )
}

function readSavedModel(projectPath: string): SavedModel {
  return JSON.parse(readFileSync(path.join(projectPath, '.scryer', 'model.scry'), 'utf8'))
}

async function addNodeFromCanvasContext(page: Page, x = 42, y = 120): Promise<void> {
  const canvas = page.getByTestId('architecture-canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).not.toBeNull()
  const horizontalPadding = Math.min(32, Math.max(8, canvasBox!.width / 4))
  const verticalPadding = Math.min(64, Math.max(16, canvasBox!.height / 5))
  const safeX = Math.min(
    Math.max(x, horizontalPadding),
    Math.max(horizontalPadding, canvasBox!.width - horizontalPadding)
  )
  const safeY = Math.min(
    Math.max(y, verticalPadding),
    Math.max(verticalPadding, canvasBox!.height - verticalPadding)
  )
  await page.mouse.click(canvasBox!.x + safeX, canvasBox!.y + safeY, { button: 'right' })
  await expect(page.getByTestId('architecture-canvas-context-menu')).toBeVisible()
  await page.getByTestId('architecture-context-add-node').click()
}

async function renameSelectedNode(page: Page, name: string, description?: string): Promise<void> {
  const nameInput = page.getByTestId('architecture-node-name')
  await expect(nameInput).toBeVisible({ timeout: 10_000 })
  await nameInput.fill(name)
  await page.keyboard.press('Tab')
  if (description !== undefined) {
    const descriptionInput = page.getByTestId('architecture-node-description')
    await descriptionInput.fill(description)
    await page.keyboard.press('Tab')
  }
  await expect
    .poll(
      async () => {
        const canvasTitleVisible = await page
          .getByTestId('architecture-node-title')
          .filter({ hasText: name })
          .first()
          .isVisible()
          .catch(() => false)
        const codeCardVisible = await page
          .getByTestId('architecture-code-card')
          .filter({ hasText: name })
          .first()
          .isVisible()
          .catch(() => false)
        return canvasTitleVisible || codeCardVisible
      },
      { timeout: 10_000 }
    )
    .toBe(true)
}

function findSavedNodeId(projectPath: string, nodeName: string): string {
  const node = readSavedModel(projectPath).nodes.find(
    (candidate) => candidate.data?.name === nodeName
  )
  if (!node) {
    throw new Error(`Saved node not found: ${nodeName}`)
  }
  return node.id
}

function savedNodeLocator(page: Page, projectPath: string, nodeName: string) {
  const nodeId = findSavedNodeId(projectPath, nodeName)
  return page.locator(`[data-testid="architecture-node"][data-node-id="${nodeId}"]`)
}

async function drillIntoSavedNode(
  page: Page,
  projectPath: string,
  nodeName: string
): Promise<void> {
  const node = savedNodeLocator(page, projectPath, nodeName)
  await expect(node).toBeVisible({ timeout: 10_000 })
  await node.click({ position: { x: 90, y: 80 } })
  const drillButton = node.getByTitle('Drill into node')
  if (await drillButton.isVisible().catch(() => false)) {
    await drillButton.click()
    return
  }
  await node.dblclick({ position: { x: 90, y: 80 } })
}

async function enterCodeLevelForComponent(page: Page, componentName: string): Promise<void> {
  await page.getByTestId('architecture-tree-node').filter({ hasText: componentName }).click()
  await expect(page.getByTestId('architecture-node-name')).toHaveValue(componentName)
  await expect(page.getByTitle('Drill into node')).toBeVisible({ timeout: 10_000 })
  await page.getByTitle('Drill into node').click()
}

test.describe('Architecture human migration checklist', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('persists complete theme customization across a renderer refresh', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await openArchitectureTab(orcaPage)

    await orcaPage.getByTestId('architecture-theme-open').click()
    await expect(orcaPage.getByTestId('architecture-theme-editor')).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-theme-role-background').locator('option')
    ).toHaveCount(22)

    await orcaPage.getByTestId('architecture-theme-mode').selectOption('light')
    await expect(orcaPage.getByTestId('architecture-theme-mode')).toHaveValue('light')
    await orcaPage.getByTestId('architecture-theme-mode').selectOption('dark')
    await expect(orcaPage.getByTestId('architecture-theme-mode')).toHaveValue('dark')
    await orcaPage.getByTestId('architecture-theme-mode').selectOption('system')

    for (const [index, role] of THEME_ROLES.entries()) {
      await orcaPage
        .getByTestId(`architecture-theme-role-${role}`)
        .selectOption(PALETTE_BY_ROLE[index])
    }
    await orcaPage.getByTestId('architecture-theme-light-offset').fill('2')
    await orcaPage.getByTestId('architecture-theme-dark-offset').fill('-1')
    await orcaPage.getByTestId('architecture-theme-canvas-bg').fill('#101820')
    await orcaPage.getByTestId('architecture-theme-node-fill').fill('#fef3c7')

    await expect
      .poll(() =>
        orcaPage.evaluate(() => {
          const raw = window.localStorage.getItem('orca-scryer:architecture-theme')
          return raw ? JSON.parse(raw) : null
        })
      )
      .toMatchObject({
        mode: 'system',
        lightOffset: 2,
        darkOffset: -1,
        canvasBackground: '#101820',
        nodeFill: '#fef3c7',
        paletteByRole: {
          background: 'red',
          nodeBorder: 'blue'
        }
      })

    await orcaPage.reload()
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await expect(orcaPage.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() =>
        orcaPage.evaluate(() => {
          const raw = window.localStorage.getItem('orca-scryer:architecture-theme')
          const panel = document.querySelector<HTMLElement>('[data-testid="architecture-panel"]')
          const style = panel ? window.getComputedStyle(panel) : null
          return {
            stored: raw ? JSON.parse(raw) : null,
            canvasBackground: style?.getPropertyValue('--architecture-canvas-bg').trim(),
            nodeFill: style?.getPropertyValue('--architecture-node-fill').trim()
          }
        })
      )
      .toMatchObject({
        stored: {
          mode: 'system',
          lightOffset: 2,
          darkOffset: -1,
          canvasBackground: '#101820',
          nodeFill: '#fef3c7',
          paletteByRole: {
            background: 'red',
            nodeBorder: 'blue'
          }
        },
        canvasBackground: '#101820',
        nodeFill: '#fef3c7'
      })
  })

  test('refreshes the UI for real model edits but ignores temporary Scryer files', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    const modelPath = path.join(worktreePath, '.scryer', 'model.scry')
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Watched Before', description: 'Initial', kind: 'system' }
        }
      ],
      edges: [],
      sourceMap: {},
      groups: [],
      flows: []
    })
    await openArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Watched Before')

    writeFileSync(
      modelPath,
      `${JSON.stringify(
        {
          nodes: [
            {
              id: 'system',
              type: 'c4',
              data: { name: 'Watched After', description: 'External edit', kind: 'system' }
            }
          ],
          edges: [],
          sourceMap: {},
          groups: [],
          flows: []
        },
        null,
        2
      )}\n`
    )
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Watched After', {
      timeout: 10_000
    })

    const ignoredModel = `${JSON.stringify(
      {
        nodes: [
          {
            id: 'system',
            type: 'c4',
            data: { name: 'Ignored Refresh', description: 'Should not load', kind: 'system' }
          }
        ],
        edges: []
      },
      null,
      2
    )}\n`
    writeFileSync(path.join(worktreePath, '.scryer', '.editor.tmp'), ignoredModel)
    writeFileSync(path.join(worktreePath, '.scryer', 'model.baseline.scry'), ignoredModel)
    writeFileSync(path.join(worktreePath, '.scryer', 'model.presync.scry'), ignoredModel)
    await orcaPage.waitForTimeout(900)
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Watched After')
    await expect(orcaPage.getByText('Ignored Refresh')).toHaveCount(0)
  })

  test('builds an Issue Tracker C4 model through canvas controls and saves the hierarchy', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await openArchitectureTab(orcaPage)
    await orcaPage.getByTestId('architecture-start-blank').click()

    await addNodeFromCanvasContext(orcaPage, 48, 150)
    await renameSelectedNode(orcaPage, 'Issue Tracker', 'Tracks issues and comments')

    for (const shape of ['rectangle', 'person', 'cylinder', 'pipe', 'hexagon']) {
      await orcaPage.getByTestId('architecture-node-shape-select').selectOption(shape)
      await expect(
        orcaPage.getByTestId('architecture-node').filter({ hasText: 'Issue Tracker' })
      ).toHaveAttribute('data-node-shape', shape)
    }

    await orcaPage.getByTestId('architecture-zoom-in').click()
    await orcaPage.getByTestId('architecture-zoom-out').click()
    await orcaPage.getByTestId('architecture-zoom-fit').click()

    await drillIntoSavedNode(orcaPage, worktreePath, 'Issue Tracker')
    for (const [index, name] of ['Web App', 'API', 'Database'].entries()) {
      await addNodeFromCanvasContext(orcaPage, 70 + index * 160, 170)
      await renameSelectedNode(orcaPage, name, `${name} for the issue tracker`)
    }
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' })
    ).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Database' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Web App' }).click()
    await orcaPage.getByTestId('architecture-node-description').fill('Calls @[Ghost API]')
    await orcaPage.keyboard.press('Tab')
    await expect(orcaPage.getByTestId('architecture-mention-warning')).toContainText(
      'does not match a sibling node'
    )

    await orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'API' }).click()
    await orcaPage.getByTestId('architecture-source-pattern').fill('src/api/**/*.ts')
    await orcaPage.keyboard.press('Tab')
    await orcaPage.getByTestId('architecture-edge-target').selectOption({ label: 'Database' })
    await orcaPage.getByTestId('architecture-add-edge').click()
    await expect(
      orcaPage.getByTestId('architecture-edge-label').filter({ hasText: 'depends on' })
    ).toBeVisible({ timeout: 10_000 })

    const apiNode = orcaPage.getByTestId('architecture-node').filter({ hasText: 'API' }).first()
    const apiTitle = apiNode.getByTestId('architecture-node-title')
    const apiBox = await apiNode.boundingBox()
    const apiTitleBox = await apiTitle.boundingBox()
    expect(apiBox).not.toBeNull()
    expect(apiTitleBox).not.toBeNull()
    await orcaPage.mouse.move(
      apiTitleBox!.x + apiTitleBox!.width / 2,
      apiTitleBox!.y + apiTitleBox!.height / 2
    )
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(apiTitleBox!.x + 93, apiTitleBox!.y + 47, { steps: 10 })
    await orcaPage.mouse.up()

    await expect
      .poll(() => {
        const saved = readSavedModel(worktreePath)
        const api = saved.nodes.find((node) => node.data?.name === 'API')
        return api?.position
      })
      .toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
    const draggedApi = readSavedModel(worktreePath).nodes.find((node) => node.data?.name === 'API')
    expect(draggedApi?.position?.x % 20).toBe(0)
    expect(draggedApi?.position?.y % 20).toBe(0)

    await expect
      .poll(() => {
        const saved = readSavedModel(worktreePath)
        return {
          hierarchyNames: saved.nodes.map((node) => node.data?.name).sort()
        }
      })
      .toEqual({
        hierarchyNames: ['API', 'Database', 'Issue Tracker', 'Web App']
      })
  })

  test('creates operation, process, and model code-level nodes and saves them', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Issue Tracker', description: 'Tracks issues', kind: 'system' }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container' }
        },
        {
          id: 'auth-controller',
          parentId: 'api',
          type: 'c4',
          data: { name: 'Auth Controller', description: 'Handles auth', kind: 'component' }
        }
      ],
      edges: [],
      sourceMap: {},
      groups: [],
      flows: []
    })
    await openArchitectureTab(orcaPage)
    await enterCodeLevelForComponent(orcaPage, 'Auth Controller')
    await expect(orcaPage.getByTestId('architecture-code-level-rack')).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Auth Controller')
    await orcaPage.waitForTimeout(400)

    await orcaPage.getByTestId('architecture-code-add-operation').click()
    await renameSelectedNode(orcaPage, 'loginUser', 'Creates a user session')
    await orcaPage.getByTestId('architecture-code-add-process').click()
    await renameSelectedNode(orcaPage, 'loginFlow', 'Checks credentials then issues a token')
    await orcaPage.getByTestId('architecture-code-add-model').click()
    await renameSelectedNode(orcaPage, 'Task', 'Task record used by @[loginUser]')

    await expect
      .poll(() => {
        const saved = readSavedModel(worktreePath)
        return saved.nodes
          .filter((node) => ['operation', 'process', 'model'].includes(String(node.data?.kind)))
          .map((node) => node.data?.name)
          .sort()
      })
      .toEqual(['Task', 'loginFlow', 'loginUser'])
  })

  test('edits model properties in code-level view and persists them', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: { name: 'Issue Tracker', description: 'Tracks issues', kind: 'system' }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container' }
        },
        {
          id: 'auth-controller',
          parentId: 'api',
          type: 'c4',
          data: { name: 'Auth Controller', description: 'Handles auth', kind: 'component' }
        },
        {
          id: 'task-model',
          parentId: 'auth-controller',
          type: 'model',
          data: {
            name: 'Task',
            description: 'Task record',
            kind: 'model',
            properties: [{ label: 'id', description: 'Old description' }]
          }
        }
      ],
      edges: [],
      sourceMap: {},
      groups: [],
      flows: []
    })
    await openArchitectureTab(orcaPage)
    await enterCodeLevelForComponent(orcaPage, 'Auth Controller')
    await expect(orcaPage.getByTestId('architecture-code-level-rack')).toBeVisible({
      timeout: 10_000
    })

    await orcaPage.getByTestId('architecture-code-card').filter({ hasText: 'Task' }).click()
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('Task')
    await expect(orcaPage.getByTestId('architecture-model-properties')).toBeVisible()
    const propertyInputs = orcaPage.getByTestId('architecture-model-properties').locator('input')
    await expect(propertyInputs).toHaveCount(2)
    await propertyInputs.nth(1).fill('Unique task id')
    const savePropertiesButton = orcaPage.getByTestId('architecture-model-property-save')
    if (await savePropertiesButton.isVisible().catch(() => false)) {
      await expect(savePropertiesButton).toBeEnabled()
      await savePropertiesButton.click()
    } else {
      await orcaPage.keyboard.press('Tab')
    }

    await expect
      .poll(() => {
        const saved = readSavedModel(worktreePath)
        return saved.nodes.find((node) => node.data?.name === 'Task')?.data?.properties
      })
      .toEqual([{ label: 'id', description: 'Unique task id' }])
  })

  test('writes MCP tool config files and runs get_task one task at a time', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    rmSync(path.join(worktreePath, '.codex'), { recursive: true, force: true })
    rmSync(path.join(worktreePath, '.mcp.json'), { force: true })

    await seedArchitectureModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'system',
          type: 'c4',
          data: {
            name: 'Issue Tracker',
            description: 'Tracks issues',
            kind: 'system',
            status: 'proposed',
            contract: {
              expect: [{ text: 'API tests pass', passed: true }],
              ask: [],
              never: ['Store plaintext passwords']
            }
          }
        },
        {
          id: 'api',
          parentId: 'system',
          type: 'c4',
          data: { name: 'API', description: 'HTTP API', kind: 'container', status: 'proposed' }
        },
        {
          id: 'service',
          parentId: 'api',
          type: 'c4',
          data: {
            name: 'Issue Service',
            description: 'Business rules',
            kind: 'component',
            status: 'proposed'
          }
        },
        {
          id: 'controller',
          parentId: 'api',
          type: 'c4',
          data: {
            name: 'Issue Controller',
            description: 'HTTP controller',
            kind: 'component',
            status: 'proposed'
          }
        }
      ],
      edges: [
        {
          id: 'edge-controller-service',
          source: 'controller',
          target: 'service',
          data: { label: 'uses' }
        }
      ],
      sourceMap: {},
      groups: [],
      flows: []
    })
    await openArchitectureTab(orcaPage)

    await orcaPage.getByTestId('architecture-mcp-config').click()
    await expect.poll(() => existsSync(path.join(worktreePath, '.mcp.json'))).toBe(true)
    await expect.poll(() => existsSync(path.join(worktreePath, '.codex', 'config.toml'))).toBe(true)
    expect(readFileSync(path.join(worktreePath, '.mcp.json'), 'utf8')).toContain('scryer')
    expect(readFileSync(path.join(worktreePath, '.codex', 'config.toml'), 'utf8')).toContain(
      worktreePath
    )

    const firstTask = await orcaPage.evaluate(async (projectPath) => {
      return window.api.architecture.callTool({
        projectPath,
        call: { toolName: 'get_task', arguments: { node_id: 'api' } }
      })
    }, worktreePath)
    expect(firstTask.ok).toBe(true)
    expect(firstTask.content).toContain('Build: Issue Service')
    expect(firstTask.content).toContain('Store plaintext passwords')
    expect(firstTask.content).not.toContain('Build: Issue Controller')

    const updateService = await orcaPage.evaluate(async (projectPath) => {
      return window.api.architecture.callTool({
        projectPath,
        call: {
          toolName: 'update_nodes',
          arguments: {
            nodes: [
              {
                node_id: 'service',
                status: 'implemented',
                reason: 'Implemented service first',
                source: [{ pattern: 'src/services/issues.ts' }]
              }
            ]
          }
        }
      })
    }, worktreePath)
    expect(updateService.ok).toBe(true)

    const secondTask = await orcaPage.evaluate(async (projectPath) => {
      return window.api.architecture.callTool({
        projectPath,
        call: { toolName: 'get_task', arguments: { node_id: 'api' } }
      })
    }, worktreePath)
    expect(secondTask.ok).toBe(true)
    expect(secondTask.content).toContain('Build: Issue Controller')
    expect(secondTask.content).not.toContain('Build: Issue Service')
  })
})
