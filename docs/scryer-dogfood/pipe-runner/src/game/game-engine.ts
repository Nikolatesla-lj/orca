import { VIEWPORT_WIDTH, createLevel } from './level'
import {
  applyPlayerInput,
  checkGoal,
  clampPlayerToWorld,
  collectCoins,
  damagePlayer,
  handleEnemyCollision,
  integratePlayer,
  moveEnemy,
  resolvePlatformCollisions
} from './physics'
import type { GameState, InputState, Player } from './types'

const PLAYER_SIZE = { width: 28, height: 34 }

function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    ...PLAYER_SIZE,
    velocityX: 0,
    velocityY: 0,
    facing: 'right',
    grounded: false,
    invulnerableMs: 0
  }
}

export function createGameState(): GameState {
  const level = createLevel()
  return {
    status: 'ready',
    level,
    player: createPlayer(level.spawn.x, level.spawn.y),
    score: 0,
    lives: 3,
    coinsCollected: 0,
    cameraX: 0,
    message: 'Ready'
  }
}

export function restartGame(): GameState {
  return createGameState()
}

export function updateGame(state: GameState, input: InputState, deltaSeconds: number): GameState {
  if (state.status === 'won' || state.status === 'game-over') {
    return state
  }

  const activeStatus = input.left || input.right || input.jump ? 'playing' : state.status
  const levelWithMovedEnemies = {
    ...state.level,
    enemies: state.level.enemies.map((enemy) => moveEnemy(enemy, deltaSeconds))
  }
  const moved = clampPlayerToWorld(
    resolvePlatformCollisions(
      integratePlayer(applyPlayerInput(state.player, input), deltaSeconds),
      levelWithMovedEnemies.platforms
    ),
    levelWithMovedEnemies.width
  )

  let nextState: GameState = {
    ...state,
    status: activeStatus === 'ready' ? 'ready' : 'playing',
    level: levelWithMovedEnemies,
    player: moved,
    cameraX: Math.max(0, Math.min(moved.x - 180, levelWithMovedEnemies.width - VIEWPORT_WIDTH))
  }

  if (nextState.player.y > nextState.level.height + 80) {
    nextState = damagePlayer(nextState, 'Fell into the pit')
  }
  nextState = collectCoins(nextState)
  nextState = handleEnemyCollision(nextState)
  nextState = checkGoal(nextState)
  return nextState
}
