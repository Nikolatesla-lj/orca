import { readFileSync } from 'fs'
import path from 'path'
import { expect, test, type Page } from '@playwright/test'

type DogfoodModel = {
  schemaVersion?: number
  nodes?: { id: string; data?: { name?: string; kind?: string } }[]
  flows?: { id: string; steps?: { id: string }[] }[]
  diagrams?: { id: string; name: string; kind: string; source: string }[]
  diagramRefs?: {
    diagramId: string
    role: string
    target: { type: string; id?: string; flowId?: string; stepId?: string; pattern?: string }
  }[]
}

const DOGFOOD_ROOT = path.join(process.cwd(), 'docs', 'scryer-dogfood', 'pipe-runner')
const MODEL_PATH = path.join(DOGFOOD_ROOT, '.scryer', 'model.scry')
const FORBIDDEN_MODEL_FIELDS = [
  '<svg',
  'data:image',
  'sourceHash',
  'diagnostics',
  'rendererVersion'
]

function readDogfoodModel(): DogfoodModel {
  return JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as DogfoodModel
}

async function canvasSnapshot(page: Page): Promise<string> {
  return page.getByTestId('game-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('game canvas not found')
    }
    return canvas.toDataURL()
  })
}

async function canvasHasMultipleColors(page: Page): Promise<boolean> {
  return page.getByTestId('game-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return false
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const colors = new Set<string>()
    for (let index = 0; index < pixels.length; index += 160) {
      colors.add(
        `${pixels[index] ?? 0},${pixels[index + 1] ?? 0},${pixels[index + 2] ?? 0},${pixels[index + 3] ?? 0}`
      )
      if (colors.size >= 6) {
        return true
      }
    }
    return false
  })
}

async function hudNumber(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).textContent()
  const match = text?.match(/\d+/)
  if (!match) {
    throw new Error(`HUD field ${testId} did not contain a number: ${text ?? '<empty>'}`)
  }
  return Number(match[0])
}

async function holdKey(page: Page, key: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(milliseconds)
  await page.keyboard.up(key)
}

function expectModelToDescribeRealGame(model: DogfoodModel): void {
  const raw = readFileSync(MODEL_PATH, 'utf8')
  expect(model.schemaVersion).toBe(2)
  expect(model.nodes?.map((node) => node.id)).toEqual(
    expect.arrayContaining([
      'pipe-runner-app',
      'react-shell',
      'game-canvas',
      'game-loop',
      'game-engine',
      'physics',
      'renderer',
      'level-data',
      'game-types'
    ])
  )
  expect(model.diagrams?.map((diagram) => diagram.kind)).toEqual(
    expect.arrayContaining(['flowchart', 'state', 'class', 'sequence'])
  )
  expect(model.diagrams?.map((diagram) => diagram.id)).toEqual(
    expect.arrayContaining([
      'diagram-game-loop',
      'diagram-player-state',
      'diagram-module-uml',
      'diagram-keyboard-render',
      'diagram-collision-decision'
    ])
  )
  expect(model.diagramRefs?.map((ref) => ref.target.type)).toEqual(
    expect.arrayContaining(['node', 'flowStep', 'source'])
  )
  expect(model.diagramRefs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        diagramId: 'diagram-collision-decision',
        target: expect.objectContaining({ type: 'source', pattern: 'src/game/physics.ts' })
      }),
      expect.objectContaining({
        diagramId: 'diagram-keyboard-render',
        target: expect.objectContaining({ type: 'source', pattern: 'src/game/useGameLoop.ts' })
      }),
      expect.objectContaining({
        diagramId: 'diagram-game-loop',
        target: expect.objectContaining({ type: 'flowStep', flowId: 'flow-play-tick' })
      })
    ])
  )
  expect(model.diagrams?.map((diagram) => diagram.source).join('\n')).toContain('updateGame')
  expect(model.diagrams?.map((diagram) => diagram.source).join('\n')).toContain(
    'handleEnemyCollision'
  )
  for (const forbidden of FORBIDDEN_MODEL_FIELDS) {
    expect(raw).not.toContain(forbidden)
  }
}

test('plays a complex human workflow and verifies C4, UML, and source refs', async ({ page }) => {
  const model = readDogfoodModel()
  expectModelToDescribeRealGame(model)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pipe Runner' })).toBeVisible()
  await expect(page.getByTestId('hud-status')).toHaveText('Status: ready')
  await expect.poll(() => canvasHasMultipleColors(page)).toBe(true)

  const canvas = page.getByTestId('game-canvas')
  const beforeMove = await canvasSnapshot(page)
  await canvas.click()
  await holdKey(page, 'ArrowRight', 1_050)
  await expect(page.getByTestId('hud-status')).toHaveText('Status: playing')
  await expect.poll(() => hudNumber(page, 'hud-coins')).toBeGreaterThan(0)
  expect(await canvasSnapshot(page)).not.toBe(beforeMove)

  await holdKey(page, 'ArrowRight', 2_400)
  await expect.poll(() => hudNumber(page, 'hud-lives')).toBeLessThan(3)

  await page.keyboard.press('KeyR')
  await expect(page.getByTestId('hud-status')).toHaveText('Status: ready')
  await expect(page.getByTestId('hud-lives')).toHaveText('Lives: 3')
  await expect(page.getByTestId('hud-coins')).toHaveText('Coins: 0')

  await canvas.click()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(2_450)
  await page.keyboard.down('Space')
  await page.waitForTimeout(120)
  await page.keyboard.up('Space')
  await page.waitForTimeout(4_600)
  await page.keyboard.up('ArrowRight')
  await expect(page.getByTestId('hud-status')).toHaveText('Status: won')
  await expect.poll(() => hudNumber(page, 'hud-score')).toBeGreaterThan(100)
})
