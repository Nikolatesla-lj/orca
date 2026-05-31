import type { Level } from './types'

export const VIEWPORT_WIDTH = 800
export const VIEWPORT_HEIGHT = 450

export function createLevel(): Level {
  return {
    width: 1280,
    height: VIEWPORT_HEIGHT,
    spawn: { x: 48, y: 334 },
    platforms: [
      { id: 'ground-left', x: 0, y: 390, width: 1280, height: 60 },
      { id: 'bonus-step', x: 430, y: 315, width: 150, height: 18 },
      { id: 'high-step', x: 720, y: 285, width: 150, height: 18 }
    ],
    coins: [
      { id: 'coin-1', x: 170, y: 342, width: 18, height: 18, collected: false },
      { id: 'coin-2', x: 342, y: 342, width: 18, height: 18, collected: false },
      { id: 'coin-3', x: 480, y: 276, width: 18, height: 18, collected: false },
      { id: 'coin-4', x: 780, y: 246, width: 18, height: 18, collected: false }
    ],
    enemies: [
      {
        id: 'sentry-1',
        x: 610,
        y: 354,
        width: 30,
        height: 36,
        startX: 580,
        endX: 690,
        velocityX: 58,
        defeated: false
      }
    ],
    goal: { x: 1160, y: 318, width: 34, height: 72 }
  }
}
