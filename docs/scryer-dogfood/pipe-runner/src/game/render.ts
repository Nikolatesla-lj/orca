import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './level'
import type { GameState, Rect } from './types'

function drawRect(ctx: CanvasRenderingContext2D, rect: Rect, cameraX: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(rect.x - cameraX), Math.round(rect.y), rect.width, rect.height)
}

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  ctx.fillStyle = '#8bd3ff'
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

  ctx.fillStyle = '#e0f2fe'
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath()
    ctx.arc(120 + i * 180 - state.cameraX * 0.25, 72 + (i % 2) * 28, 28, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const platform of state.level.platforms) {
    drawRect(ctx, platform, state.cameraX, platform.id.includes('ground') ? '#2f855a' : '#7c3aed')
  }

  for (const coin of state.level.coins) {
    if (coin.collected) {
      continue
    }
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.arc(coin.x - state.cameraX + coin.width / 2, coin.y + coin.height / 2, 10, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const enemy of state.level.enemies) {
    if (enemy.defeated) {
      continue
    }
    drawRect(ctx, enemy, state.cameraX, '#b91c1c')
    ctx.fillStyle = '#fee2e2'
    ctx.fillRect(enemy.x - state.cameraX + 7, enemy.y + 8, 5, 5)
    ctx.fillRect(enemy.x - state.cameraX + 18, enemy.y + 8, 5, 5)
  }

  drawRect(ctx, state.level.goal, state.cameraX, '#f97316')
  ctx.fillStyle = '#16a34a'
  ctx.fillRect(state.level.goal.x - state.cameraX + 20, state.level.goal.y, 36, 24)

  const playerColor = state.player.invulnerableMs > 0 ? '#f59e0b' : '#2563eb'
  drawRect(ctx, state.player, state.cameraX, playerColor)
  ctx.fillStyle = '#dbeafe'
  ctx.fillRect(state.player.x - state.cameraX + 7, state.player.y + 8, 6, 6)
  ctx.fillRect(state.player.x - state.cameraX + 18, state.player.y + 8, 6, 6)

  ctx.fillStyle = '#0f172a'
  ctx.font = '18px sans-serif'
  ctx.fillText(state.message, 16, 28)
}
