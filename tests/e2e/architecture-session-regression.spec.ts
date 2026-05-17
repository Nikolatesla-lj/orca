import { readFileSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

type SavedModel = {
  nodes: {
    id: string
    data: {
      name: string
      description?: string
      kind: string
    }
  }[]
  edges: unknown[]
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

async function seedModel(page: Page, projectPath: string, model: SavedModel): Promise<void> {
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

function getModelPath(projectPath: string): string {
  return path.join(projectPath, '.scryer', 'model.scry')
}

function readSavedModel(projectPath: string): SavedModel {
  return JSON.parse(readFileSync(getModelPath(projectPath), 'utf8'))
}

async function terminalTabCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const activeWorktreeId = state?.activeWorktreeId
    return activeWorktreeId ? (state.tabsByWorktree[activeWorktreeId] ?? []).length : 0
  })
}

test.describe('Architecture model session regressions', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('merges a node field save with an external model edit made while the input is focused', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await openArchitectureTab(orcaPage)
    await seedModel(orcaPage, worktreePath, {
      nodes: [
        {
          id: 'api',
          data: { name: 'API', description: 'Initial description', kind: 'system' }
        }
      ],
      edges: []
    })
    await expect(orcaPage.getByTestId('architecture-node-name')).toHaveValue('API')

    const nameInput = orcaPage.getByTestId('architecture-node-name')
    await nameInput.focus()
    await nameInput.fill('API Local Draft')

    const externallyEdited = readSavedModel(worktreePath)
    externallyEdited.nodes[0]!.data.description = 'External editor description'
    writeFileSync(getModelPath(worktreePath), `${JSON.stringify(externallyEdited, null, 2)}\n`)

    await orcaPage.keyboard.press('Tab')

    await expect
      .poll(() => readSavedModel(worktreePath).nodes[0]?.data.name, { timeout: 5_000 })
      .toBe('API Local Draft')
    expect(readSavedModel(worktreePath).nodes[0]?.data.description).toBe(
      'External editor description'
    )
  })

  test('guards Build with AI against rapid duplicate launches', async ({ orcaPage }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await orcaPage.evaluate(() => {
      window.__store?.setState((state) => ({
        settings: {
          ...state.settings,
          defaultTuiAgent: 'codex',
          agentCmdOverrides: {
            ...state.settings?.agentCmdOverrides,
            codex: 'node -e "setTimeout(()=>process.exit(1),200)"'
          }
        }
      }))
    })
    await openArchitectureTab(orcaPage)
    await expect(orcaPage.getByTestId('architecture-build-ai')).toBeVisible({ timeout: 10_000 })
    const before = await terminalTabCount(orcaPage)

    await orcaPage.getByTestId('architecture-build-ai').dblclick()

    await expect
      .poll(async () => terminalTabCount(orcaPage), { timeout: 10_000 })
      .toBeGreaterThan(before)
    expect(await terminalTabCount(orcaPage)).toBe(before + 1)
  })

  test('opens a dirty model with warnings instead of blanking the architecture panel', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    const modelDir = path.join(worktreePath, '.scryer')
    const modelPath = getModelPath(worktreePath)
    await orcaPage.evaluate(async (projectPath) => {
      await window.api.architecture.writeModel({
        projectPath,
        model: { nodes: [], edges: [] }
      })
    }, worktreePath)
    const dirtyModel = {
      nodes: [
        {
          id: 'api',
          data: {
            name: 'API',
            description: 'Calls @[Ghost API]',
            kind: 'container',
            contract: {
              expect: [
                {
                  text: 'Attach evidence',
                  image: {
                    filename: 'evidence.png',
                    mimeType: 'image/png',
                    dataUrl: 'data:image/png;base64,abc123'
                  }
                }
              ]
            }
          }
        }
      ],
      edges: [],
      sourceMap: {
        api: [{ pattern: ' src/api.ts ', line: 9, endLine: 2 }],
        ghost: [{ pattern: 'src/ghost.ts' }]
      },
      groups: [{ id: 'backend', name: 'Backend', nodeIds: ['api', 'ghost'] }],
      flows: [
        {
          id: 'flow-1',
          name: 'Dirty Flow',
          steps: [
            {
              id: 'step-1',
              branches: [{ condition: 42, steps: [{ id: 'branch-step' }] }]
            }
          ]
        }
      ]
    }
    expect(modelDir).toBe(path.dirname(modelPath))
    writeFileSync(modelPath, `${JSON.stringify(dirtyModel, null, 2)}\n`)

    await openArchitectureTab(orcaPage)

    await expect(orcaPage.getByTestId('architecture-panel')).toBeVisible({ timeout: 30_000 })
    await expect(orcaPage.getByTestId('architecture-model-warning')).toContainText('model warning')
    await expect(
      orcaPage.getByTestId('architecture-node-title').filter({ hasText: 'API' })
    ).toBeVisible()
  })
})
