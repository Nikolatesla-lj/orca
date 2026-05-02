import { describe, expect, it, vi } from 'vitest'
import { installSingleInstanceGuard } from './single-instance'

type SecondInstanceHandler = () => void

function createApp(lockGranted: boolean): {
  app: {
    requestSingleInstanceLock: ReturnType<typeof vi.fn>
    exit: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
  }
  getSecondInstanceHandler: () => SecondInstanceHandler
} {
  let secondInstanceHandler: SecondInstanceHandler | null = null
  const app = {
    requestSingleInstanceLock: vi.fn(() => lockGranted),
    exit: vi.fn(),
    on: vi.fn((event: string, handler: SecondInstanceHandler) => {
      if (event === 'second-instance') {
        secondInstanceHandler = handler
      }
      return app
    })
  }

  return {
    app,
    getSecondInstanceHandler: () => {
      if (!secondInstanceHandler) {
        throw new Error('second-instance handler was not registered')
      }
      return secondInstanceHandler
    }
  }
}

describe('installSingleInstanceGuard', () => {
  it('exits before startup when another Orca instance already owns the userData lock', () => {
    const { app } = createApp(false)

    const canStart = installSingleInstanceGuard(app as never, () => null)

    expect(canStart).toBe(false)
    expect(app.requestSingleInstanceLock).toHaveBeenCalledOnce()
    expect(app.exit).toHaveBeenCalledWith(0)
    expect(app.on).not.toHaveBeenCalled()
  })

  it('focuses the existing main window when a second instance starts', () => {
    const { app, getSecondInstanceHandler } = createApp(true)
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      focus: vi.fn()
    }

    const canStart = installSingleInstanceGuard(app as never, () => mainWindow as never)
    getSecondInstanceHandler()()

    expect(canStart).toBe(true)
    expect(app.exit).not.toHaveBeenCalled()
    expect(mainWindow.restore).toHaveBeenCalledOnce()
    expect(mainWindow.focus).toHaveBeenCalledOnce()
  })
})
