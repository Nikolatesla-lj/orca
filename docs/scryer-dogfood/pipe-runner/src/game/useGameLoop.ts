import { useCallback, useEffect, useRef, useState } from 'react'
import { createGameState, restartGame, updateGame } from './game-engine'
import { renderGame } from './render'
import type { GameState, InputState } from './types'

const emptyInput: InputState = { left: false, right: false, jump: false }

function inputFromKeys(keys: Set<string>): InputState {
  return {
    left: keys.has('ArrowLeft') || keys.has('a') || keys.has('A'),
    right: keys.has('ArrowRight') || keys.has('d') || keys.has('D'),
    jump: keys.has(' ') || keys.has('ArrowUp') || keys.has('w') || keys.has('W')
  }
}

export function useGameLoop(canvasRef: React.RefObject<HTMLCanvasElement | null>): {
  state: GameState
  input: InputState
  restart: () => void
} {
  const [state, setState] = useState<GameState>(() => createGameState())
  const [input, setInput] = useState<InputState>(emptyInput)
  const pressedKeysRef = useRef(new Set<string>())
  const stateRef = useRef(state)
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const restart = useCallback(() => {
    pressedKeysRef.current.clear()
    setInput(emptyInput)
    setState(restartGame())
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'r' || event.key === 'R') {
        restart()
        return
      }
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'A', 'd', 'D', 'w', 'W'].includes(
          event.key
        )
      ) {
        event.preventDefault()
        pressedKeysRef.current.add(event.key)
        setInput(inputFromKeys(pressedKeysRef.current))
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      pressedKeysRef.current.delete(event.key)
      setInput(inputFromKeys(pressedKeysRef.current))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [restart])

  useEffect(() => {
    const tick = (time: number): void => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d') ?? null
      const lastTime = lastTimeRef.current ?? time
      const deltaSeconds = Math.min((time - lastTime) / 1000, 1 / 30)
      lastTimeRef.current = time
      const nextState = updateGame(
        stateRef.current,
        inputFromKeys(pressedKeysRef.current),
        deltaSeconds
      )
      stateRef.current = nextState
      setState(nextState)
      if (ctx) {
        renderGame(ctx, nextState)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [canvasRef])

  return { state, input, restart }
}
