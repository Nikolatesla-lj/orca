import mermaid from 'mermaid'

type MermaidRenderConfig = Parameters<typeof mermaid.initialize>[0]

export type MermaidRenderQueueDiagnostics = {
  active: number
  maxConcurrent: number
  started: number
  completed: number
}

let renderQueue: Promise<void> = Promise.resolve()
let activeRenders = 0
let maxConcurrentRenders = 0
let startedRenders = 0
let completedRenders = 0

export function enqueueMermaidRender<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    activeRenders += 1
    startedRenders += 1
    maxConcurrentRenders = Math.max(maxConcurrentRenders, activeRenders)
    try {
      return await fn()
    } finally {
      activeRenders -= 1
      completedRenders += 1
    }
  }

  const queued = renderQueue.then(run, run)
  renderQueue = queued.then(
    () => undefined,
    () => undefined
  )
  return queued
}

export function renderMermaidSvg(
  renderId: string,
  source: string,
  config: MermaidRenderConfig
): Promise<string> {
  return enqueueMermaidRender(async () => {
    mermaid.initialize(config)
    const { svg } = await mermaid.render(renderId, source)
    return svg
  })
}

export function getMermaidRenderQueueDiagnostics(): MermaidRenderQueueDiagnostics {
  return {
    active: activeRenders,
    maxConcurrent: maxConcurrentRenders,
    started: startedRenders,
    completed: completedRenders
  }
}

export function resetMermaidRenderQueueDiagnostics(): void {
  activeRenders = 0
  maxConcurrentRenders = 0
  startedRenders = 0
  completedRenders = 0
}
