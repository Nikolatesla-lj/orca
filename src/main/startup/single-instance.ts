import type { App, BrowserWindow } from 'electron'

type MainWindowResolver = () => BrowserWindow | null

export function installSingleInstanceGuard(app: App, getMainWindow: MainWindowResolver): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return false
  }

  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) {
      return
    }
    if (window.isMinimized()) {
      window.restore()
    }
    window.focus()
  })

  return true
}
