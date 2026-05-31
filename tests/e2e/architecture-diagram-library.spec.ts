/* eslint-disable max-lines -- Why: this E2E spec keeps the Scryer Diagram Library real .scry flows together across S1 and S2 regression coverage. */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'

const DIAGRAM_PREVIEW_STORAGE_KEY = 'orca-scryer:enableArchitectureDiagramLibraryPreview'

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

async function openArchitectureTab(page: Page, projectPath: string) {
  await page.evaluate((nextProjectPath) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const worktreeId = state.activeWorktreeId
    if (!worktreeId) {
      throw new Error('active worktree not found')
    }
    state.createArchitectureTab(worktreeId, {
      projectPath: nextProjectPath,
      title: 'Architecture'
    })
    state.setActiveTabType('architecture')
  }, projectPath)
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })
}

function seedFx2(projectPath: string): string {
  return seedFixture(projectPath, 'valid-diagrams-and-refs.scry')
}

function seedFx9(projectPath: string): string {
  return seedFixture(projectPath, 'many-diagrams-for-prompt.scry')
}

function seedFixture(projectPath: string, fixtureName: string): string {
  const modelPath = path.join(projectPath, '.scryer', 'model.scry')
  mkdirSync(path.dirname(modelPath), { recursive: true })
  writeFileSync(
    modelPath,
    readFileSync(
      path.join(
        process.cwd(),
        'src',
        'shared',
        'scryer',
        '__fixtures__',
        'diagram-library',
        fixtureName
      ),
      'utf8'
    )
  )
  return modelPath
}

function readDiagramFixture(fixtureName: string): string {
  return readFileSync(
    path.join(
      process.cwd(),
      'src',
      'shared',
      'scryer',
      '__fixtures__',
      'diagram-library',
      fixtureName
    ),
    'utf8'
  )
}

function updateDiagramSourceOnDisk(modelPath: string, diagramId: string, source: string): void {
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as {
    diagrams?: { id: string; source: string }[]
  }
  model.diagrams = (model.diagrams ?? []).map((diagram) =>
    diagram.id === diagramId ? { ...diagram, source } : diagram
  )
  writeFileSync(modelPath, JSON.stringify(model, null, 2))
}

function deleteDiagramOnDisk(modelPath: string, diagramId: string): void {
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as {
    diagrams?: { id: string }[]
    diagramRefs?: { diagramId: string }[]
  }
  model.diagrams = (model.diagrams ?? []).filter((diagram) => diagram.id !== diagramId)
  model.diagramRefs = (model.diagramRefs ?? []).filter((ref) => ref.diagramId !== diagramId)
  writeFileSync(modelPath, JSON.stringify(model, null, 2))
}

function readModelJson(modelPath: string): {
  diagrams?: {
    id: string
    name: string
    kind: string
    source: string
  }[]
  diagramRefs?: {
    diagramId: string
    target: { type: string; id?: string; flowId?: string; stepId?: string }
    role: string
    elementKey?: string
  }[]
} {
  return JSON.parse(readFileSync(modelPath, 'utf8')) as {
    diagrams?: {
      id: string
      name: string
      kind: string
      source: string
    }[]
    diagramRefs?: {
      diagramId: string
      target: { type: string; id?: string; flowId?: string; stepId?: string }
      role: string
      elementKey?: string
    }[]
  }
}

async function replaceDiagramSource(page: Page, source: string): Promise<void> {
  const sourceInput = page.getByLabel('Diagram source')
  await sourceInput.click({ force: true })
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.insertText(source)
  await expect(sourceInput).toHaveValue(source)
}

async function createAndSaveDiagram(page: Page, name: string, source: string): Promise<void> {
  await page.getByTestId('architecture-diagram-library-create').click({ force: true })
  await expect(page.getByTestId('diagram-review-view')).toBeVisible()
  await page.getByLabel('Diagram name').fill(name)
  await replaceDiagramSource(page, source)
  await page
    .getByTestId('diagram-review-view')
    .getByRole('button', { name: 'Save' })
    .click({ force: true })
  await expect(page.getByLabel('Diagram source')).toHaveValue(source)
  await expect(page.getByTestId('diagram-render-svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy SVG' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled()
}

test.describe('Scryer Diagram library', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates, saves, reloads, and deletes a rendered diagram behind the internal flag', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await expect(orcaPage.getByTestId('architecture-diagram-library')).toBeVisible()

    await orcaPage.getByTestId('architecture-diagram-library-create').click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
    await expect(orcaPage.getByTestId('diagram-render-svg')).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeEnabled()
    await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeEnabled()

    const source = 'sequenceDiagram\n  A->>B: live'
    await orcaPage.getByLabel('Diagram source').fill(source)
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })

    const dialog = orcaPage.getByTestId('diagram-draft-switch-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save and switch' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Discard and switch' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).focus()
    await orcaPage.keyboard.press('Enter')
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(source)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    await dialog.getByRole('button', { name: 'Save and switch' }).dispatchEvent('click')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('A->>B: live')

    const unsavedDiscard = 'flowchart TD\n  discard[Do not persist]'
    await orcaPage.getByLabel('Diagram source').fill(unsavedDiscard)
    await orcaPage.getByTestId('architecture-flow-tree-node').first().click({ force: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Discard and switch' }).dispatchEvent('click')
    await expect(orcaPage.getByTestId('architecture-flow-tabs')).toBeVisible()
    expect(readFileSync(modelPath, 'utf8')).not.toContain('Do not persist')

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const closeDraftSource = 'flowchart TD\n  savedClose[Saved before close]'
    await orcaPage.getByLabel('Diagram source').fill(closeDraftSource)
    await orcaPage.getByTestId('architecture-mode-topology').dispatchEvent('click')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Save and switch' }).dispatchEvent('click')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Saved before close')
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await expect(orcaPage.getByTestId('diagram-review-view')).toHaveCount(0)
    await expect(orcaPage.getByText('Copy SVG')).toHaveCount(0)
    await expect(orcaPage.getByText('Export PNG')).toHaveCount(0)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Diagram 4' })
      .click({ force: true })
    await orcaPage.getByLabel('Diagram name').fill('Live Sequence')
    await orcaPage.getByRole('button', { name: 'Save' }).dispatchEvent('click')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Live Sequence')

    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Live Sequence' })
    ).toBeVisible()

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Live Sequence' })
      .click({ force: true })
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Delete' })
      .dispatchEvent('click')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).not.toContain('Live Sequence')
  })

  test('runs a comprehensive daily-use live journey through the Diagram library', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await expect(orcaPage.getByTestId('architecture-model-tree')).toBeVisible()
    await expect(
      orcaPage.locator('[data-testid="architecture-tree-node"][data-node-id="api"]')
    ).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-flow-tree-node').filter({ hasText: 'Signup' })
    ).toBeVisible()
    await expect(orcaPage.getByTestId('architecture-diagram-library')).toBeVisible()

    const flowchartGroup = orcaPage.locator(
      '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="flowchart"]'
    )
    await expect(flowchartGroup).toBeVisible()
    await flowchartGroup.focus()
    await orcaPage.keyboard.press('Enter')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'API Flow' })
    ).toHaveCount(0)
    await flowchartGroup.focus()
    await orcaPage.keyboard.press('Enter')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'API Flow' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-diagram-library-create').click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
    const createdSource =
      'sequenceDiagram\n  participant Human\n  participant Orca\n  Human->>Orca: daily review'
    await orcaPage.getByLabel('Diagram name').fill('Daily Review Sequence')
    await replaceDiagramSource(orcaPage, createdSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Daily Review Sequence')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Human->>Orca')

    const switchedSource = `${createdSource}\n  Orca-->>Human: saved before switching`
    await replaceDiagramSource(orcaPage, switchedSource)
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const switchDialog = orcaPage.getByTestId('diagram-draft-switch-dialog')
    await expect(switchDialog).toBeVisible()
    await switchDialog.getByRole('button', { name: 'Cancel' }).click({ force: true })
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(switchedSource)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    await switchDialog.getByRole('button', { name: 'Save and switch' }).click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Daily Review Sequence')
    await expect
      .poll(() => readFileSync(modelPath, 'utf8'))
      .toContain('Orca-->>Human: saved before switching')
    await expect(orcaPage.getByTestId('diagram-render-svg')).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeEnabled()
    await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeEnabled()

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Signup Sequence' })
      .click({ force: true })
    const invalidSource = readDiagramFixture('invalid-mermaid-syntax.mmd')
    await replaceDiagramSource(orcaPage, invalidSource)
    await expect(orcaPage.getByTestId('diagram-render-diagnostic').first()).toContainText(
      'renderer.invalid-source'
    )
    await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeDisabled()
    await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeDisabled()
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('start[Start')
    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(invalidSource)

    const fixedSequenceSource =
      'sequenceDiagram\n  participant User\n  participant Worker\n  User->>Worker: retry fixed'
    await orcaPage.getByLabel('Diagram name').fill('Human Signup Sequence')
    await replaceDiagramSource(orcaPage, fixedSequenceSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Human Signup Sequence')

    await orcaPage
      .locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
      .click({ force: true })
    await orcaPage.getByTestId('architecture-side-tab-inspector').click({ force: true })
    const inspectorRefPanel = orcaPage.getByTestId('architecture-diagram-ref-panel').first()
    await inspectorRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Human Signup Sequence'
    })
    await inspectorRefPanel.getByLabel('Select diagram ref role').selectOption('sequence-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramId: 'diagram-sequence',
            target: { type: 'node', id: 'worker' },
            role: 'sequence-detail'
          })
        ])
      )

    await inspectorRefPanel.getByTestId('architecture-diagram-ref-create').click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
    const workerDiagramSource = readDiagramFixture('valid-mermaid-flowchart.mmd')
    await replaceDiagramSource(orcaPage, workerDiagramSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })
    await expect(inspectorRefPanel).toContainText(
      'Choose a role to link the new diagram to Worker.'
    )
    await inspectorRefPanel
      .getByLabel('Select diagram ref role')
      .selectOption('architecture-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })

    let workerDiagramId = ''
    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        const ref = (persisted.diagramRefs ?? []).find(
          (candidate) =>
            candidate.target.type === 'node' &&
            candidate.target.id === 'worker' &&
            candidate.role === 'architecture-detail'
        )
        workerDiagramId = ref?.diagramId ?? ''
        return {
          ref,
          diagram: (persisted.diagrams ?? []).find((diagram) => diagram.id === ref?.diagramId)
        }
      })
      .toMatchObject({
        ref: {
          target: { type: 'node', id: 'worker' },
          role: 'architecture-detail'
        },
        diagram: {
          name: 'Worker diagram',
          source: workerDiagramSource
        }
      })

    await orcaPage.getByTestId('architecture-mode-flows').click({ force: true })
    const nestedStep = orcaPage.locator(
      '[data-testid="architecture-flow-step-card"][data-step-id="step-nested-review"]'
    )
    await expect(nestedStep).toBeVisible()
    const nestedStepRefPanel = nestedStep.getByTestId('architecture-diagram-ref-panel').first()
    await nestedStepRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Account State'
    })
    await nestedStepRefPanel.getByLabel('Select diagram ref role').selectOption('state-detail')
    await nestedStepRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramId: 'diagram-state',
            target: {
              type: 'flowStep',
              flowId: 'flow-signup',
              stepId: 'step-nested-review'
            },
            role: 'state-detail'
          })
        ])
      )

    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await expect(
      nestedStep.getByTestId('architecture-diagram-ref-row').filter({ hasText: 'Account State' })
    ).toBeVisible()
    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Human Signup Sequence' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-reverse-ref-list')).toBeVisible()
    await expect(
      orcaPage.getByTestId('diagram-reverse-ref-row').filter({ hasText: 'node:worker' })
    ).toBeVisible()

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const renderedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(renderedApiNode).toBeVisible()
    await orcaPage.getByTestId('diagram-bind-element').click({ force: true })
    await expect(orcaPage.getByText('Select a bindable SVG element.')).toBeVisible()
    await renderedApiNode.click({ force: true })
    await orcaPage.getByTestId('diagram-bind-target-id').fill('api')
    await orcaPage.getByTestId('diagram-bind-role').selectOption('architecture-detail')
    await orcaPage.getByTestId('diagram-bind-save').click({ force: true })
    await expect
      .poll(() => {
        const refs = readModelJson(modelPath).diagramRefs ?? []
        return refs.find(
          (ref) =>
            ref.diagramId === 'diagram-api-flow' &&
            ref.elementKey === 'flowchart:node:api' &&
            ref.target.type === 'node' &&
            ref.target.id === 'api'
        )
      })
      .toMatchObject({
        diagramId: 'diagram-api-flow',
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      })

    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const reloadedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(reloadedApiNode).toBeVisible()
    await reloadedApiNode.click({ force: true })
    await expect(orcaPage.getByTestId('diagram-element-target-picker')).toBeVisible()
    await orcaPage
      .getByTestId('diagram-element-target-option')
      .filter({ hasText: 'node:api' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await expect(
      orcaPage.locator('[data-testid="architecture-tree-node"][data-node-id="api"]')
    ).toHaveClass(/bg-accent/)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Worker diagram' })
      .click({ force: true })
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Delete' })
      .click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagrams ?? [])
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: workerDiagramId })]))
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .not.toEqual(
        expect.arrayContaining([expect.objectContaining({ diagramId: workerDiagramId })])
      )

    const persisted = readFileSync(modelPath, 'utf8')
    expect(persisted).toContain('Daily Review Sequence')
    expect(persisted).toContain('Human Signup Sequence')
    expect(persisted).toContain('flowchart:node:api')
    expect(persisted).not.toContain('<svg')
    expect(persisted).not.toContain('sourceHash')
    expect(persisted).not.toContain('rendererVersion')
    expect(persisted).not.toContain('diagnostics')
  })

  test('runs a mission-style architecture review handoff through chained diagram operations', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await expect(orcaPage.getByTestId('architecture-model-tree')).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-flow-tree-node').filter({ hasText: 'Signup' })
    ).toBeVisible()
    await expect(orcaPage.getByTestId('architecture-diagram-library')).toBeVisible()

    await orcaPage.getByTestId('architecture-diagram-library-create').click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
    const handoffSource =
      'flowchart TD\n  kickoff[Signup review kickoff] --> worker[Worker handoff]\n  worker --> decision{Ready?}\n  decision -->|yes| publish[Publish diagram notes]'
    await orcaPage.getByLabel('Diagram name').fill('Signup Review Handoff')
    await replaceDiagramSource(orcaPage, handoffSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })

    let handoffDiagramId = ''
    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        const diagram = (persisted.diagrams ?? []).find(
          (candidate) => candidate.name === 'Signup Review Handoff'
        )
        handoffDiagramId = diagram?.id ?? ''
        return diagram
      })
      .toMatchObject({
        name: 'Signup Review Handoff',
        source: handoffSource
      })

    await orcaPage
      .locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await orcaPage.getByTestId('architecture-side-tab-inspector').click({ force: true })
    const inspectorRefPanel = orcaPage.getByTestId('architecture-diagram-ref-panel').first()
    await inspectorRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Signup Review Handoff'
    })
    await inspectorRefPanel
      .getByLabel('Select diagram ref role')
      .selectOption('architecture-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramId: handoffDiagramId,
            target: { type: 'node', id: 'worker' },
            role: 'architecture-detail'
          })
        ])
      )

    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Signup Sequence' })
      .click({ force: true })
    const brokenReviewSource = readDiagramFixture('invalid-mermaid-syntax.mmd')
    await replaceDiagramSource(orcaPage, brokenReviewSource)
    await expect(orcaPage.getByTestId('diagram-render-diagnostic').first()).toContainText(
      'renderer.invalid-source'
    )
    await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeDisabled()
    await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeDisabled()

    const fixedReviewSource =
      'sequenceDiagram\n  participant Reviewer\n  participant Worker\n  Reviewer->>Worker: confirm signup handoff\n  Worker-->>Reviewer: diagram refs ready'
    await orcaPage.getByLabel('Diagram name').fill('Signup Review Sequence')
    await replaceDiagramSource(orcaPage, fixedReviewSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Signup Review Sequence')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('diagram refs ready')
    await expect(orcaPage.getByTestId('diagram-render-svg')).toBeVisible()

    await orcaPage.getByTestId('architecture-mode-flows').click({ force: true })
    const nestedStep = orcaPage.locator(
      '[data-testid="architecture-flow-step-card"][data-step-id="step-nested-review"]'
    )
    await expect(nestedStep).toBeVisible()
    const nestedStepRefPanel = nestedStep.getByTestId('architecture-diagram-ref-panel').first()
    await nestedStepRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Signup Review Sequence'
    })
    await nestedStepRefPanel.getByLabel('Select diagram ref role').selectOption('sequence-detail')
    await nestedStepRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramId: 'diagram-sequence',
            target: {
              type: 'flowStep',
              flowId: 'flow-signup',
              stepId: 'step-nested-review'
            },
            role: 'sequence-detail'
          })
        ])
      )

    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const localConflictDraft =
      'flowchart TD\n  api[API local review] --> worker[Worker local review]\n  worker --> note[Reviewer note]'
    const diskConflictSource =
      'flowchart TD\n  api[API collaborator update] --> worker[Worker accepted]\n  worker --> audit[Audit handoff]'
    await replaceDiagramSource(orcaPage, localConflictDraft)
    updateDiagramSourceOnDisk(modelPath, 'diagram-api-flow', diskConflictSource)
    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    const review = orcaPage.getByTestId('diagram-review-view')
    await expect(review.getByRole('button', { name: 'Keep draft' })).toBeVisible()
    await expect(review.getByRole('button', { name: 'Reload from disk' })).toBeVisible()
    await expect(review.getByRole('button', { name: 'Compare changes' })).toBeVisible()
    await review.getByRole('button', { name: 'Compare changes' }).click({ force: true })
    await expect(orcaPage.getByTestId('diagram-external-reload-compare')).toContainText(
      'API collaborator update'
    )
    await review.getByRole('button', { name: 'Close compare' }).click({ force: true })
    await review.getByRole('button', { name: 'Reload from disk' }).click({ force: true })
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(diskConflictSource)

    const acceptedConflictSource = `${diskConflictSource}\n  audit --> publish[Publish review packet]`
    await replaceDiagramSource(orcaPage, acceptedConflictSource)
    await review.getByRole('button', { name: 'Save' }).click({ force: true })
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('Publish review packet')

    const renderedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(renderedApiNode).toBeVisible()
    await orcaPage.getByTestId('diagram-bind-element').click({ force: true })
    await expect(orcaPage.getByText('Select a bindable SVG element.')).toBeVisible()
    await renderedApiNode.click({ force: true })
    await orcaPage.getByTestId('diagram-bind-target-id').fill('worker')
    await orcaPage.getByTestId('diagram-bind-role').selectOption('architecture-detail')
    await orcaPage.getByTestId('diagram-bind-save').click({ force: true })
    await expect
      .poll(() => {
        const refs = readModelJson(modelPath).diagramRefs ?? []
        return refs.find(
          (ref) =>
            ref.diagramId === 'diagram-api-flow' &&
            ref.elementKey === 'flowchart:node:api' &&
            ref.target.type === 'node' &&
            ref.target.id === 'worker'
        )
      })
      .toMatchObject({
        diagramId: 'diagram-api-flow',
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'worker' },
        role: 'architecture-detail'
      })

    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const reloadedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(reloadedApiNode).toBeVisible()
    await reloadedApiNode.click({ force: true })
    await expect(orcaPage.getByTestId('diagram-element-target-picker')).toBeVisible()
    await orcaPage
      .getByTestId('diagram-element-target-option')
      .filter({ hasText: 'node:worker' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await expect(
      orcaPage.locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
    ).toHaveClass(/bg-accent/)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Signup Review Handoff' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-reverse-ref-list')).toBeVisible()
    await expect(
      orcaPage.getByTestId('diagram-reverse-ref-row').filter({ hasText: 'node:worker' })
    ).toBeVisible()
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Delete' })
      .click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagrams ?? [])
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: handoffDiagramId })]))
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .not.toEqual(
        expect.arrayContaining([expect.objectContaining({ diagramId: handoffDiagramId })])
      )

    const persisted = readFileSync(modelPath, 'utf8')
    expect(persisted).toContain('Signup Review Sequence')
    expect(persisted).toContain('Publish review packet')
    expect(persisted).toContain('flowchart:node:api')
    expect(persisted).not.toContain('Signup Review Handoff')
    expect(persisted).not.toContain('<svg')
    expect(persisted).not.toContain('sourceHash')
    expect(persisted).not.toContain('rendererVersion')
    expect(persisted).not.toContain('diagnostics')
  })

  test('builds a multi-diagram Mermaid UML and flowchart review packet with sufficient persisted source', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await expect(orcaPage.getByTestId('architecture-diagram-library')).toBeVisible()

    const generatedDiagrams = [
      {
        name: 'Generated Signup Flowchart',
        kind: 'flowchart',
        source:
          'flowchart TD\n  user[User submits signup] --> api[API validates payload]\n  api --> decision{Payload valid?}\n  decision -->|yes| worker[Worker runs review job]\n  decision -->|no| reject[Return validation error]\n  worker --> audit[(Audit log)]\n  worker --> state[Update account state]',
        fragments: [
          'User submits signup',
          'Payload valid?',
          'Worker runs review job',
          'Audit log',
          'Return validation error'
        ]
      },
      {
        name: 'Generated Signup Sequence UML',
        kind: 'sequence',
        source:
          'sequenceDiagram\n  participant User\n  participant UI as Orca UI\n  participant API\n  participant Worker\n  User->>UI: submit signup\n  UI->>API: persist request\n  API->>Worker: enqueue review job\n  Worker-->>API: review complete\n  API-->>UI: show account status',
        fragments: [
          'participant Worker',
          'submit signup',
          'enqueue review job',
          'review complete',
          'show account status'
        ]
      },
      {
        name: 'Generated Worker Class UML',
        kind: 'class',
        source:
          'classDiagram\n  class SignupController {\n    +submitSignup()\n    +retryFailedSignup()\n  }\n  class SignupService {\n    +validateRequest()\n    +enqueueReview()\n  }\n  class Worker {\n    +processSignupJob()\n    +emitAuditEvent()\n  }\n  SignupController --> SignupService : delegates\n  SignupService --> Worker : enqueues job',
        fragments: [
          'class SignupController',
          '+submitSignup()',
          'class Worker',
          '+emitAuditEvent()',
          'SignupService --> Worker'
        ]
      },
      {
        name: 'Generated Account State UML',
        kind: 'state',
        source:
          'stateDiagram-v2\n  [*] --> Draft\n  Draft --> PendingReview: submit\n  PendingReview --> Approved: worker accepts\n  PendingReview --> Rejected: validation fails\n  Rejected --> Draft: edit and retry\n  Approved --> [*]',
        fragments: ['PendingReview', 'Approved', 'Rejected', 'edit and retry', 'worker accepts']
      }
    ]

    for (const diagram of generatedDiagrams) {
      await createAndSaveDiagram(orcaPage, diagram.name, diagram.source)
      await expect
        .poll(() => {
          const persisted = readModelJson(modelPath)
          const saved = (persisted.diagrams ?? []).find(
            (candidate) => candidate.name === diagram.name
          )
          return saved ? { kind: saved.kind, source: saved.source } : null
        })
        .toEqual({ kind: diagram.kind, source: diagram.source })
      const persistedSource = readModelJson(modelPath).diagrams?.find(
        (candidate) => candidate.name === diagram.name
      )?.source
      for (const fragment of diagram.fragments) {
        expect(persistedSource).toContain(fragment)
      }
    }

    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await expect(
      orcaPage.locator(
        '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="flowchart"]'
      )
    ).toContainText('2')
    await expect(
      orcaPage.locator(
        '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="sequence"]'
      )
    ).toContainText('2')
    await expect(
      orcaPage.locator(
        '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="class"]'
      )
    ).toContainText('1')
    await expect(
      orcaPage.locator(
        '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="state"]'
      )
    ).toContainText('2')

    for (const diagram of generatedDiagrams) {
      await orcaPage
        .getByTestId('architecture-diagram-library-item')
        .filter({ hasText: diagram.name })
        .click({ force: true })
      await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(diagram.source)
      await expect(orcaPage.getByTestId('diagram-render-svg')).toBeVisible()
      await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeEnabled()
      await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeEnabled()
    }

    await orcaPage
      .locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await orcaPage.getByTestId('architecture-side-tab-inspector').click({ force: true })
    const inspectorRefPanel = orcaPage.getByTestId('architecture-diagram-ref-panel').first()
    await inspectorRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Generated Worker Class UML'
    })
    await inspectorRefPanel
      .getByLabel('Select diagram ref role')
      .selectOption('architecture-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })

    await orcaPage.getByTestId('architecture-mode-flows').click({ force: true })
    const nestedStep = orcaPage.locator(
      '[data-testid="architecture-flow-step-card"][data-step-id="step-nested-review"]'
    )
    await expect(nestedStep).toBeVisible()
    const nestedStepRefPanel = nestedStep.getByTestId('architecture-diagram-ref-panel').first()
    await nestedStepRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Generated Account State UML'
    })
    await nestedStepRefPanel.getByLabel('Select diagram ref role').selectOption('state-detail')
    await nestedStepRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await nestedStepRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Generated Signup Sequence UML'
    })
    await nestedStepRefPanel.getByLabel('Select diagram ref role').selectOption('sequence-detail')
    await nestedStepRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })

    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        const diagramsByName = new Map(
          (persisted.diagrams ?? []).map((diagram) => [diagram.name, diagram.id])
        )
        const refs = persisted.diagramRefs ?? []
        return {
          classRef: refs.some(
            (ref) =>
              ref.diagramId === diagramsByName.get('Generated Worker Class UML') &&
              ref.target.type === 'node' &&
              ref.target.id === 'worker' &&
              ref.role === 'architecture-detail'
          ),
          stateRef: refs.some(
            (ref) =>
              ref.diagramId === diagramsByName.get('Generated Account State UML') &&
              ref.target.type === 'flowStep' &&
              ref.target.flowId === 'flow-signup' &&
              ref.target.stepId === 'step-nested-review' &&
              ref.role === 'state-detail'
          ),
          sequenceRef: refs.some(
            (ref) =>
              ref.diagramId === diagramsByName.get('Generated Signup Sequence UML') &&
              ref.target.type === 'flowStep' &&
              ref.target.flowId === 'flow-signup' &&
              ref.target.stepId === 'step-nested-review' &&
              ref.role === 'sequence-detail'
          )
        }
      })
      .toEqual({ classRef: true, stateRef: true, sequenceRef: true })

    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Generated Signup Flowchart' })
      .click({ force: true })
    const renderedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(renderedApiNode).toBeVisible()
    await orcaPage.getByTestId('diagram-bind-element').click({ force: true })
    await renderedApiNode.click({ force: true })
    await orcaPage.getByTestId('diagram-bind-target-id').fill('api')
    await orcaPage.getByTestId('diagram-bind-role').selectOption('architecture-detail')
    await orcaPage.getByTestId('diagram-bind-save').click({ force: true })

    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        const flowchartId = (persisted.diagrams ?? []).find(
          (diagram) => diagram.name === 'Generated Signup Flowchart'
        )?.id
        return (persisted.diagramRefs ?? []).some(
          (ref) =>
            ref.diagramId === flowchartId &&
            ref.elementKey === 'flowchart:node:api' &&
            ref.target.type === 'node' &&
            ref.target.id === 'api'
        )
      })
      .toBe(true)

    await orcaPage.getByRole('button', { name: 'Reload' }).click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Generated Worker Class UML' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-reverse-ref-list')).toBeVisible()
    await expect(
      orcaPage.getByTestId('diagram-reverse-ref-row').filter({ hasText: 'node:worker' })
    ).toBeVisible()
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Generated Account State UML' })
      .click({ force: true })
    await expect(
      orcaPage
        .getByTestId('diagram-reverse-ref-row')
        .filter({ hasText: 'flowStep:flow-signup/step-nested-review' })
    ).toBeVisible()

    const persistedModel = JSON.parse(readFileSync(modelPath, 'utf8')) as {
      nodes?: { data?: { name?: string } }[]
      flows?: unknown[]
      diagrams?: { name: string; source: string; kind: string }[]
    }
    const generatedNames = generatedDiagrams.map((diagram) => diagram.name)
    expect((persistedModel.nodes ?? []).map((node) => node.data?.name)).not.toEqual(
      expect.arrayContaining(generatedNames)
    )
    expect(JSON.stringify(persistedModel.flows ?? [])).not.toContain('Generated Signup Flowchart')
    for (const diagram of generatedDiagrams) {
      const saved = persistedModel.diagrams?.find((candidate) => candidate.name === diagram.name)
      expect(saved).toMatchObject({ kind: diagram.kind, source: diagram.source })
    }

    const persisted = readFileSync(modelPath, 'utf8')
    expect(persisted).toContain('"diagramRefs"')
    expect(persisted).toContain('Generated Signup Flowchart')
    expect(persisted).toContain('Generated Worker Class UML')
    expect(persisted).not.toContain('<svg')
    expect(persisted).not.toContain('sourceHash')
    expect(persisted).not.toContain('rendererVersion')
    expect(persisted).not.toContain('diagnostics')
  })

  test('renders valid Mermaid and preserves invalid source through real .scry reload', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })

    const review = orcaPage.getByTestId('diagram-review-view')
    await expect(review).toBeVisible()

    const validSource = readDiagramFixture('valid-mermaid-flowchart.mmd')
    await orcaPage.getByLabel('Diagram source').fill(validSource)
    await review.getByRole('button', { name: 'Save' }).dispatchEvent('click')
    await expect(orcaPage.getByTestId('diagram-render-svg')).toBeVisible()
    await expect(orcaPage.getByTestId('diagram-render-svg')).toHaveAttribute(
      'data-source-hash',
      /^sha256:[0-9a-f]{64}$/
    )

    const invalidSource = readDiagramFixture('invalid-mermaid-syntax.mmd')
    await orcaPage.getByLabel('Diagram source').fill(invalidSource)
    await expect(orcaPage.getByTestId('diagram-render-diagnostic').first()).toContainText(
      'renderer.invalid-source'
    )
    await expect(orcaPage.getByTestId('diagram-render-stale-badge')).toBeVisible()
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(invalidSource)
    await expect(orcaPage.getByRole('button', { name: 'Copy SVG' })).toBeDisabled()
    await expect(orcaPage.getByRole('button', { name: 'Export PNG' })).toBeDisabled()

    await review.getByRole('button', { name: 'Save' }).dispatchEvent('click')
    await expect.poll(() => readFileSync(modelPath, 'utf8')).toContain('start[Start')

    const persisted = readFileSync(modelPath, 'utf8')
    expect(persisted).not.toContain('<svg')
    expect(persisted).not.toContain('sourceHash')
    expect(persisted).not.toContain('rendererVersion')
    expect(persisted).not.toContain('diagnostics')

    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(invalidSource)
    await expect(orcaPage.getByTestId('diagram-render-diagnostic').first()).toContainText(
      'renderer.invalid-source'
    )
  })

  test('handles external reload conflicts and large Diagram library behavior through real .scry files', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    let modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })

    const localDraft = 'flowchart TD\n  local[Local draft]'
    const diskSource = 'flowchart TD\n  disk[Disk update]'
    await orcaPage.getByLabel('Diagram source').fill(localDraft)
    updateDiagramSourceOnDisk(modelPath, 'diagram-api-flow', diskSource)
    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')

    const sourceView = orcaPage.getByTestId('diagram-review-view')
    await expect(sourceView).toContainText('model')
    await expect(sourceView.getByRole('button', { name: 'Keep draft' })).toBeVisible()
    await expect(sourceView.getByRole('button', { name: 'Reload from disk' })).toBeVisible()
    await expect(sourceView.getByRole('button', { name: 'Compare changes' })).toBeVisible()
    await sourceView.getByRole('button', { name: 'Compare changes' }).dispatchEvent('click')
    await expect(orcaPage.getByTestId('diagram-external-reload-compare')).toBeVisible()
    await sourceView.getByRole('button', { name: 'Close compare' }).dispatchEvent('click')
    await expect(sourceView.getByRole('button', { name: 'Reload from disk' })).toBeVisible()

    await sourceView.getByRole('button', { name: 'Keep draft' }).dispatchEvent('click')
    await sourceView.getByRole('button', { name: 'Save' }).dispatchEvent('click')
    await expect(sourceView).toContainText('changed on disk')
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(localDraft)

    await sourceView.getByRole('button', { name: 'Reload from disk' }).dispatchEvent('click')
    await expect(orcaPage.getByLabel('Diagram source')).toHaveValue(diskSource)

    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Account State' })
      .click({ force: true })
    await orcaPage.getByLabel('Diagram source').fill('stateDiagram-v2\n  [*] --> Local')
    deleteDiagramOnDisk(modelPath, 'diagram-state')
    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(sourceView.getByRole('button', { name: 'Discard deleted' })).toBeVisible()
    await expect(sourceView.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(sourceView.getByRole('button', { name: 'Compare changes' })).toHaveCount(0)
    await sourceView.getByRole('button', { name: 'Discard deleted' }).dispatchEvent('click')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Account State' })
    ).toHaveCount(0)

    modelPath = seedFx9(projectPath)
    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(orcaPage.getByTestId('architecture-diagram-library-search')).toBeVisible()
    await expect(
      orcaPage
        .locator('[data-testid="architecture-diagram-library-kind"][data-diagram-kind="flowchart"]')
        .first()
    ).toContainText('4')
    await expect(
      orcaPage
        .getByTestId('architecture-diagram-library-item')
        .filter({ hasText: 'Unlinked' })
        .first()
    ).toBeVisible()
    await orcaPage.getByLabel('Search diagrams').fill('payment')
    await expect(
      orcaPage
        .getByTestId('architecture-diagram-library-item')
        .filter({ hasText: 'Payment Sequence' })
    ).toBeVisible()
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Refund Flow' })
    ).toBeVisible()
    await orcaPage.getByLabel('Search diagrams').fill('Token Service')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Auth Overview' })
    ).toHaveCount(0)
    await orcaPage.getByLabel('Search diagrams').fill('')
    const flowchartGroup = orcaPage.locator(
      '[data-testid="architecture-diagram-library-kind"][data-diagram-kind="flowchart"]'
    )
    await flowchartGroup.focus()
    await orcaPage.keyboard.press('Enter')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Auth Overview' })
    ).toHaveCount(0)
    await flowchartGroup.focus()
    await orcaPage.keyboard.press('Enter')
    await expect(
      orcaPage.getByTestId('architecture-diagram-library-item').filter({ hasText: 'Auth Overview' })
    ).toBeVisible()
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Payment Sequence' })
      .focus()
    await orcaPage.keyboard.press('Enter')
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
  })

  test('creates diagram refs from C4 node and nested flow step, then reloads target and reverse lists', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await orcaPage
      .locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
      .click({ force: true })
    await orcaPage.getByTestId('architecture-side-tab-inspector').click({ force: true })

    const inspectorRefPanel = orcaPage.getByTestId('architecture-diagram-ref-panel').first()
    await inspectorRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Signup Sequence'
    })
    await inspectorRefPanel.getByLabel('Select diagram ref role').selectOption('sequence-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toContainEqual(
        expect.objectContaining({
          diagramId: 'diagram-sequence',
          target: { type: 'node', id: 'worker' },
          role: 'sequence-detail'
        })
      )

    await orcaPage.getByTestId('architecture-mode-flows').click({ force: true })
    const nestedStep = orcaPage.locator(
      '[data-testid="architecture-flow-step-card"][data-step-id="step-nested-review"]'
    )
    await expect(nestedStep).toBeVisible()
    const nestedStepRefPanel = nestedStep.getByTestId('architecture-diagram-ref-panel').first()
    await nestedStepRefPanel.getByLabel('Select existing diagram').selectOption({
      label: 'Account State'
    })
    await nestedStepRefPanel.getByLabel('Select diagram ref role').selectOption('state-detail')
    await nestedStepRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })
    await expect
      .poll(() => readModelJson(modelPath).diagramRefs ?? [])
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramId: 'diagram-state',
            target: {
              type: 'flowStep',
              flowId: 'flow-signup',
              stepId: 'step-nested-review'
            },
            role: 'state-detail'
          })
        ])
      )

    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(
      nestedStep.getByTestId('architecture-diagram-ref-row').filter({ hasText: 'Account State' })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Account State' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-reverse-ref-list')).toBeVisible()
    await expect(
      orcaPage
        .getByTestId('diagram-reverse-ref-row')
        .filter({ hasText: 'flowStep:flow-signup/step-nested-review' })
    ).toBeVisible()

    const persisted = readModelJson(modelPath)
    expect(JSON.stringify(persisted)).toContain('"diagramRefs"')
    expect(JSON.stringify(persisted)).not.toContain('"nodes":[{"diagramRefs"')
  })

  test('creates a diagram from the target-side ref picker, saves source, links it, and reloads both lists', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await orcaPage
      .locator('[data-testid="architecture-tree-node"][data-node-id="worker"]')
      .click({ force: true })
    await orcaPage.getByTestId('architecture-side-tab-inspector').click({ force: true })

    const inspectorRefPanel = orcaPage.getByTestId('architecture-diagram-ref-panel').first()
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-create').click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()

    const fixtureSource = readDiagramFixture('valid-mermaid-flowchart.mmd')
    await orcaPage.getByLabel('Diagram source').fill(fixtureSource)
    await orcaPage
      .getByTestId('diagram-review-view')
      .getByRole('button', { name: 'Save' })
      .dispatchEvent('click')

    await expect(inspectorRefPanel).toContainText(
      'Choose a role to link the new diagram to Worker.'
    )
    await inspectorRefPanel
      .getByLabel('Select diagram ref role')
      .selectOption('architecture-detail')
    await inspectorRefPanel.getByTestId('architecture-diagram-ref-add').click({ force: true })

    let linkedDiagramId = ''
    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        const ref = (persisted.diagramRefs ?? []).find(
          (candidate) =>
            candidate.target.type === 'node' &&
            candidate.target.id === 'worker' &&
            candidate.role === 'architecture-detail'
        )
        linkedDiagramId = ref?.diagramId ?? ''
        return {
          ref,
          diagram: (persisted.diagrams ?? []).find((diagram) => diagram.id === ref?.diagramId)
        }
      })
      .toMatchObject({
        ref: {
          target: { type: 'node', id: 'worker' },
          role: 'architecture-detail'
        },
        diagram: {
          name: 'Worker diagram',
          source: fixtureSource
        }
      })

    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await expect(
      inspectorRefPanel.getByTestId('architecture-diagram-ref-row').filter({
        hasText: 'Worker diagram'
      })
    ).toBeVisible()

    await orcaPage.getByTestId('architecture-side-tab-tree').click({ force: true })
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'Worker diagram' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-reverse-ref-list')).toBeVisible()
    await expect(
      orcaPage.getByTestId('diagram-reverse-ref-row').filter({ hasText: 'node:worker' })
    ).toBeVisible()

    expect(readModelJson(modelPath).diagramRefs ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagramId: linkedDiagramId,
          target: { type: 'node', id: 'worker' },
          role: 'architecture-detail'
        })
      ])
    )
    expect(readFileSync(modelPath, 'utf8')).not.toContain('<svg')
  })

  test('binds a rendered SVG element and navigates through the element target picker after reload', async ({
    orcaPage
  }) => {
    const projectPath = await getActiveWorktreePath(orcaPage)
    const modelPath = seedFx2(projectPath)
    await orcaPage.evaluate((key) => {
      window.localStorage.setItem(key, 'true')
    }, DIAGRAM_PREVIEW_STORAGE_KEY)

    await openArchitectureTab(orcaPage, projectPath)
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('diagram-review-view')).toBeVisible()
    const renderedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(renderedApiNode).toBeVisible()

    await orcaPage.getByTestId('diagram-bind-element').click({ force: true })
    await expect(orcaPage.getByText('Select a bindable SVG element.')).toBeVisible()
    await renderedApiNode.click({ force: true })
    await expect(orcaPage.getByTestId('diagram-bind-target-id')).toBeVisible()
    await orcaPage.getByTestId('diagram-bind-target-id').fill('api')
    await orcaPage.getByTestId('diagram-bind-role').selectOption('architecture-detail')
    await orcaPage.getByTestId('diagram-bind-save').click({ force: true })

    await expect
      .poll(() => {
        const persisted = readModelJson(modelPath)
        return (persisted.diagramRefs ?? []).find(
          (ref) =>
            ref.diagramId === 'diagram-api-flow' &&
            ref.elementKey === 'flowchart:node:api' &&
            ref.target.type === 'node' &&
            ref.target.id === 'api'
        )
      })
      .toMatchObject({
        diagramId: 'diagram-api-flow',
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      })
    expect(readFileSync(modelPath, 'utf8')).not.toContain('svgSelector')
    expect(readFileSync(modelPath, 'utf8')).not.toContain('<svg')

    await orcaPage.getByRole('button', { name: 'Reload' }).dispatchEvent('click')
    await orcaPage
      .getByTestId('architecture-diagram-library-item')
      .filter({ hasText: 'API Flow' })
      .click({ force: true })
    const reloadedApiNode = orcaPage
      .getByTestId('diagram-render-svg')
      .locator('[data-diagram-element-key="flowchart:node:api"]')
    await expect(reloadedApiNode).toBeVisible()
    await reloadedApiNode.click({ force: true })
    await expect(orcaPage.getByTestId('diagram-element-target-picker')).toBeVisible()
    await expect(
      orcaPage.getByTestId('diagram-element-target-option').filter({ hasText: 'node:api' })
    ).toBeVisible()
    await orcaPage
      .getByTestId('diagram-element-target-option')
      .filter({ hasText: 'node:api' })
      .click({ force: true })
    await expect(orcaPage.getByTestId('architecture-canvas')).toBeVisible()
    await expect(
      orcaPage.locator('[data-testid="architecture-tree-node"][data-node-id="api"]')
    ).toHaveClass(/bg-accent/)
  })
})
