import { useCallback, useEffect, useRef, useState } from 'react'

export type ArchitectureAiRunKind = 'build' | 'fill' | 'review' | 'sync'
export type ArchitectureAiRunPhase = 'idle' | 'launching' | 'running' | 'failed' | 'cancelled' | 'done'

export type ArchitectureAiRunState = {
  phase: ArchitectureAiRunPhase
  message: string | null
}

const IDLE_RUN: ArchitectureAiRunState = { phase: 'idle', message: null }
const RELEASE_DELAY_MS = 750

export function useArchitectureAiRunSession() {
  const activeRunsRef = useRef<Set<ArchitectureAiRunKind>>(new Set())
  const releaseTimersRef = useRef<Map<ArchitectureAiRunKind, number>>(new Map())
  const [runStates, setRunStates] = useState<Record<ArchitectureAiRunKind, ArchitectureAiRunState>>(
    {
      build: IDLE_RUN,
      fill: IDLE_RUN,
      review: IDLE_RUN,
      sync: IDLE_RUN
    }
  )

  const setRunState = useCallback(
    (kind: ArchitectureAiRunKind, phase: ArchitectureAiRunPhase, message: string | null = null) => {
      setRunStates((current) => ({
        ...current,
        [kind]: { phase, message }
      }))
    },
    []
  )

  const releaseRun = useCallback((kind: ArchitectureAiRunKind, delay = RELEASE_DELAY_MS) => {
    const existingTimer = releaseTimersRef.current.get(kind)
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer)
    }
    const timer = window.setTimeout(() => {
      activeRunsRef.current.delete(kind)
      releaseTimersRef.current.delete(kind)
    }, delay)
    releaseTimersRef.current.set(kind, timer)
  }, [])

  const beginRun = useCallback(
    (kind: ArchitectureAiRunKind, message: string | null = null): boolean => {
      if (activeRunsRef.current.has(kind)) {
        return false
      }
      const existingTimer = releaseTimersRef.current.get(kind)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        releaseTimersRef.current.delete(kind)
      }
      activeRunsRef.current.add(kind)
      setRunState(kind, 'launching', message)
      return true
    },
    [setRunState]
  )

  const markRun = useCallback(
    (kind: ArchitectureAiRunKind, phase: ArchitectureAiRunPhase, message: string | null = null) => {
      setRunState(kind, phase, message)
      if (phase !== 'launching' && phase !== 'running') {
        releaseRun(kind)
      }
    },
    [releaseRun, setRunState]
  )

  const forceReleaseRun = useCallback(
    (kind: ArchitectureAiRunKind, phase: ArchitectureAiRunPhase, message: string | null = null) => {
      const existingTimer = releaseTimersRef.current.get(kind)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        releaseTimersRef.current.delete(kind)
      }
      activeRunsRef.current.delete(kind)
      setRunState(kind, phase, message)
    },
    [setRunState]
  )

  useEffect(
    () => () => {
      for (const timer of releaseTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      releaseTimersRef.current.clear()
      activeRunsRef.current.clear()
    },
    []
  )

  return {
    runStates,
    beginRun,
    markRun,
    forceReleaseRun
  }
}
