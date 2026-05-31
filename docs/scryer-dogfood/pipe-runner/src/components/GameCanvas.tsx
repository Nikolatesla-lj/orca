import React, { forwardRef } from 'react'
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../game/level'
import type { GameState, InputState } from '../game/types'

export const GameCanvas = forwardRef<HTMLCanvasElement, { state: GameState; input: InputState }>(
  function GameCanvas({ state, input }, ref): React.JSX.Element {
    return (
      <canvas
        ref={ref}
        className="game-canvas"
        data-testid="game-canvas"
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        tabIndex={0}
        aria-label={`Pipe Runner canvas. Status ${state.status}. Score ${state.score}. Moving ${input.left ? 'left' : input.right ? 'right' : 'none'}.`}
      />
    )
  }
)
