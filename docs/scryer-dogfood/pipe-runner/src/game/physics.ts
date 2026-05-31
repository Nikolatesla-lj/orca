import type { Enemy, GameState, InputState, Platform, Player, Rect } from './types'

const MOVE_SPEED = 210
const JUMP_SPEED = -560
const GRAVITY = 1500
const MAX_FALL_SPEED = 760
const RESPAWN_INVULNERABLE_MS = 900

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function moveEnemy(enemy: Enemy, deltaSeconds: number): Enemy {
  if (enemy.defeated) {
    return enemy
  }
  let nextX = enemy.x + enemy.velocityX * deltaSeconds
  let nextVelocityX = enemy.velocityX
  if (nextX < enemy.startX) {
    nextX = enemy.startX
    nextVelocityX = Math.abs(enemy.velocityX)
  }
  if (nextX > enemy.endX) {
    nextX = enemy.endX
    nextVelocityX = -Math.abs(enemy.velocityX)
  }
  return { ...enemy, x: nextX, velocityX: nextVelocityX }
}

export function applyPlayerInput(player: Player, input: InputState): Player {
  const movingLeft = input.left && !input.right
  const movingRight = input.right && !input.left
  const velocityX = movingLeft ? -MOVE_SPEED : movingRight ? MOVE_SPEED : 0
  const canJump = input.jump && player.grounded
  return {
    ...player,
    velocityX,
    velocityY: canJump ? JUMP_SPEED : player.velocityY,
    facing: movingLeft ? 'left' : movingRight ? 'right' : player.facing,
    grounded: canJump ? false : player.grounded
  }
}

export function integratePlayer(player: Player, deltaSeconds: number): Player {
  const velocityY = Math.min(player.velocityY + GRAVITY * deltaSeconds, MAX_FALL_SPEED)
  return {
    ...player,
    x: player.x + player.velocityX * deltaSeconds,
    y: player.y + velocityY * deltaSeconds,
    velocityY,
    grounded: false,
    invulnerableMs: Math.max(0, player.invulnerableMs - deltaSeconds * 1000)
  }
}

export function resolvePlatformCollisions(player: Player, platforms: Platform[]): Player {
  let next = { ...player }
  for (const platform of platforms) {
    if (!intersects(next, platform)) {
      continue
    }
    const previousBottom = next.y + next.height - next.velocityY / 60
    if (previousBottom <= platform.y + 8 && next.velocityY >= 0) {
      next = {
        ...next,
        y: platform.y - next.height,
        velocityY: 0,
        grounded: true
      }
    }
  }
  return next
}

export function clampPlayerToWorld(player: Player, worldWidth: number): Player {
  return {
    ...player,
    x: Math.max(0, Math.min(player.x, worldWidth - player.width))
  }
}

export function handleEnemyCollision(state: GameState): GameState {
  let nextState = state
  const enemies = state.level.enemies.map((enemy) => {
    if (enemy.defeated || !intersects(state.player, enemy)) {
      return enemy
    }
    const isStomp =
      state.player.velocityY > 100 && state.player.y + state.player.height - enemy.y < 22
    if (isStomp) {
      nextState = {
        ...nextState,
        player: { ...nextState.player, velocityY: JUMP_SPEED * 0.45 },
        score: nextState.score + 50,
        message: 'Sentry stomped'
      }
      return { ...enemy, defeated: true }
    }
    if (state.player.invulnerableMs <= 0) {
      nextState = damagePlayer(nextState, 'Sentry hit')
    }
    return enemy
  })
  return {
    ...nextState,
    level: { ...nextState.level, enemies }
  }
}

export function collectCoins(state: GameState): GameState {
  let gained = 0
  const coins = state.level.coins.map((coin) => {
    if (coin.collected || !intersects(state.player, coin)) {
      return coin
    }
    gained += 1
    return { ...coin, collected: true }
  })
  if (gained === 0) {
    return state
  }
  return {
    ...state,
    level: { ...state.level, coins },
    coinsCollected: state.coinsCollected + gained,
    score: state.score + gained * 10,
    message: gained === 1 ? 'Coin collected' : `${gained} coins collected`
  }
}

export function damagePlayer(state: GameState, message: string): GameState {
  const nextLives = state.lives - 1
  if (nextLives <= 0) {
    return {
      ...state,
      lives: 0,
      status: 'game-over',
      message: 'Game over'
    }
  }
  return {
    ...state,
    lives: nextLives,
    player: {
      x: state.level.spawn.x,
      y: state.level.spawn.y,
      width: state.player.width,
      height: state.player.height,
      velocityX: 0,
      velocityY: 0,
      facing: 'right',
      grounded: false,
      invulnerableMs: RESPAWN_INVULNERABLE_MS
    },
    message
  }
}

export function checkGoal(state: GameState): GameState {
  if (!intersects(state.player, state.level.goal)) {
    return state
  }
  return {
    ...state,
    status: 'won',
    score: state.score + 100,
    message: 'Goal reached'
  }
}
