export type GameStatus = 'ready' | 'playing' | 'won' | 'game-over'

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type Player = Rect & {
  velocityX: number
  velocityY: number
  facing: 'left' | 'right'
  grounded: boolean
  invulnerableMs: number
}

export type Platform = Rect & {
  id: string
}

export type Coin = Rect & {
  id: string
  collected: boolean
}

export type Enemy = Rect & {
  id: string
  startX: number
  endX: number
  velocityX: number
  defeated: boolean
}

export type Level = {
  width: number
  height: number
  spawn: { x: number; y: number }
  platforms: Platform[]
  coins: Coin[]
  enemies: Enemy[]
  goal: Rect
}

export type InputState = {
  left: boolean
  right: boolean
  jump: boolean
}

export type GameState = {
  status: GameStatus
  level: Level
  player: Player
  score: number
  lives: number
  coinsCollected: number
  cameraX: number
  message: string
}
