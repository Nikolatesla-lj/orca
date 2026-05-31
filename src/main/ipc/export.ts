import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { ExportTimeoutError, htmlToPdf } from '../lib/html-to-pdf'

export type ExportHtmlToPdfArgs = {
  html: string
  title: string
}

export type ExportHtmlToPdfResult =
  | { success: true; filePath: string }
  | { success: false; cancelled?: boolean; error?: string }

export type ExportDiagramPngArgs = {
  pngDataUrl: string
  title: string
}

export type ExportDiagramPngResult =
  | { success: true; filePath: string }
  | {
      success: false
      cancelled?: boolean
      code?: 'controller.export-failed'
      error?: string
    }

export function registerExportHandlers(): void {
  ipcMain.removeHandler('export:html-to-pdf')
  ipcMain.removeHandler('export:diagram-png')
  ipcMain.handle(
    'export:html-to-pdf',
    async (event, args: ExportHtmlToPdfArgs): Promise<ExportHtmlToPdfResult> => {
      const { html, title } = args
      if (!html.trim()) {
        return { success: false, error: 'No content to export' }
      }

      try {
        const pdfBuffer = await htmlToPdf(html)

        // Why: sanitize to keep the suggested filename legal on every platform.
        // Windows forbids /\:*?"<>| in filenames; truncate to keep the OS save
        // dialog stable when titles are pathologically long.
        const sanitizedTitle = title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 100) || 'export'
        const defaultFilename = `${sanitizedTitle}.pdf`

        const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const dialogOptions = {
          defaultPath: defaultFilename,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        }
        const { canceled, filePath } = parent
          ? await dialog.showSaveDialog(parent, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions)

        if (canceled || !filePath) {
          return { success: false, cancelled: true }
        }

        await writeFile(filePath, pdfBuffer)
        return { success: true, filePath }
      } catch (error) {
        if (error instanceof ExportTimeoutError) {
          return { success: false, error: 'Export timed out' }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to export PDF'
        }
      }
    }
  )

  ipcMain.handle(
    'export:diagram-png',
    async (event, args: ExportDiagramPngArgs): Promise<ExportDiagramPngResult> => {
      try {
        const pngBuffer = decodePngDataUrl(args.pngDataUrl)
        if (!pngBuffer) {
          return {
            success: false,
            code: 'controller.export-failed',
            error: 'Invalid PNG export payload'
          }
        }

        const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const dialogOptions = {
          defaultPath: `${sanitizeExportTitle(args.title, 'diagram')}.png`,
          filters: [{ name: 'PNG', extensions: ['png'] }]
        }
        const { canceled, filePath } = parent
          ? await dialog.showSaveDialog(parent, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions)

        if (canceled || !filePath) {
          return { success: false, cancelled: true }
        }

        const pngPath = ensurePngExtension(filePath)
        await writeFile(pngPath, pngBuffer)
        return { success: true, filePath: pngPath }
      } catch (error) {
        return {
          success: false,
          code: 'controller.export-failed',
          error: error instanceof Error ? error.message : 'Failed to export PNG'
        }
      }
    }
  )
}

function sanitizeExportTitle(title: string, fallback: string): string {
  return (
    title
      .replace(/[/\\:*?"<>|]/g, '_')
      .slice(0, 100)
      .trim() || fallback
  )
}

function ensurePngExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`
}

function decodePngDataUrl(dataUrl: string): Buffer | null {
  const prefix = 'data:image/png;base64,'
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
    return null
  }
  return Buffer.from(dataUrl.slice(prefix.length), 'base64')
}
