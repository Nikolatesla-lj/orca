import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  removeHandlerMock,
  handleMock,
  showSaveDialogMock,
  browserWindowFromWebContentsMock,
  writeFileMock,
  htmlToPdfMock
} = vi.hoisted(() => ({
  removeHandlerMock: vi.fn(),
  handleMock: vi.fn(),
  showSaveDialogMock: vi.fn(),
  browserWindowFromWebContentsMock: vi.fn(),
  writeFileMock: vi.fn(),
  htmlToPdfMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: browserWindowFromWebContentsMock
  },
  dialog: {
    showSaveDialog: showSaveDialogMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  }
}))

vi.mock('node:fs/promises', () => ({
  writeFile: writeFileMock
}))

vi.mock('../lib/html-to-pdf', () => ({
  ExportTimeoutError: class ExportTimeoutError extends Error {},
  htmlToPdf: htmlToPdfMock
}))

import { registerExportHandlers } from './export'

function getHandler<TArgs, TResult>(
  channel: string
): (event: { sender: Electron.WebContents }, args: TArgs) => Promise<TResult> {
  const handler = handleMock.mock.calls.find(([candidate]) => candidate === channel)?.[1]
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`)
  }
  return handler as (event: { sender: Electron.WebContents }, args: TArgs) => Promise<TResult>
}

describe('registerExportHandlers', () => {
  beforeEach(() => {
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    showSaveDialogMock.mockReset()
    browserWindowFromWebContentsMock.mockReset()
    writeFileMock.mockReset()
    htmlToPdfMock.mockReset()
    htmlToPdfMock.mockResolvedValue(Buffer.from('pdf'))
  })

  it('exports diagram PNG data through a native save dialog with a sanitized .png filename', async () => {
    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/custom-name'
    })
    writeFileMock.mockResolvedValue(undefined)

    registerExportHandlers()

    const handler = getHandler<
      { pngDataUrl: string; title: string },
      { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
    >('export:diagram-png')
    const result = await handler(
      { sender: {} as Electron.WebContents },
      {
        pngDataUrl: 'data:image/png;base64,QUJD',
        title: 'API/Flow:*?'
      }
    )

    expect(showSaveDialogMock).toHaveBeenCalledWith({
      defaultPath: 'API_Flow___.png',
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/custom-name.png',
      Buffer.from('QUJD', 'base64')
    )
    expect(result).toEqual({ success: true, filePath: '/tmp/custom-name.png' })
  })

  it('treats user cancellation as non-error and writes no PNG file', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true })

    registerExportHandlers()

    const handler = getHandler<
      { pngDataUrl: string; title: string },
      { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
    >('export:diagram-png')
    const result = await handler(
      { sender: {} as Electron.WebContents },
      {
        pngDataUrl: 'data:image/png;base64,QUJD',
        title: ''
      }
    )

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, cancelled: true })
  })

  it('returns controller.export-failed when the PNG write fails', async () => {
    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/export.png'
    })
    writeFileMock.mockRejectedValue(new Error('disk full'))

    registerExportHandlers()

    const handler = getHandler<
      { pngDataUrl: string; title: string },
      | { success: true; filePath: string }
      | { success: false; cancelled?: boolean; code?: string; error?: string }
    >('export:diagram-png')
    const result = await handler(
      { sender: {} as Electron.WebContents },
      {
        pngDataUrl: 'data:image/png;base64,QUJD',
        title: 'API Flow'
      }
    )

    expect(result).toMatchObject({
      success: false,
      code: 'controller.export-failed',
      error: expect.stringContaining('disk full')
    })
  })
})
