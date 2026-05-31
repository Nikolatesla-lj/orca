import React, { useRef } from 'react'
import { GameCanvas } from './components/GameCanvas'
import { useGameLoop } from './game/useGameLoop'

export function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { state, input, restart } = useGameLoop(canvasRef)

  return (
    <main className="app-shell">
      <section className="game-panel" aria-label="Pipe Runner game">
        <header className="game-header">
          <div>
            <h1>Pipe Runner</h1>
            <p>Move, jump, collect coins, stomp the sentry, and reach the flag.</p>
          </div>
          <button type="button" onClick={restart}>
            Restart
          </button>
        </header>

        <div className="hud" aria-label="Game status">
          <span data-testid="hud-status">Status: {state.status}</span>
          <span data-testid="hud-score">Score: {state.score}</span>
          <span data-testid="hud-lives">Lives: {state.lives}</span>
          <span data-testid="hud-coins">Coins: {state.coinsCollected}</span>
        </div>

        <GameCanvas ref={canvasRef} state={state} input={input} />

        <footer className="instructions">
          <span>Left/Right or A/D: move</span>
          <span>Space/W/Up: jump</span>
          <span>R: restart</span>
        </footer>
      </section>
    </main>
  )
}
