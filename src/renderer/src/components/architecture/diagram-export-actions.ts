import { toPng } from 'html-to-image'
import type {
  DiagramCacheFailure,
  DiagramCacheWriteRequest,
  DiagramCacheWriteResult
} from '../../../../shared/scryer/diagram-cache'
import { computeDiagramCacheKey } from '../../../../shared/scryer/diagram-cache'
import type {
  DiagramReviewExportPayload,
  DiagramReviewViewExportActions
} from './DiagramReviewView'
import { writeDiagramCache } from './diagram-cache-client'

export type DiagramReviewCacheContext = {
  projectPath: string
  modelName?: string | null
}

export type DiagramPngExportResult =
  | { success: true; filePath: string }
  | {
      success: false
      cancelled?: boolean
      code?: 'controller.export-failed'
      error?: string
    }

export type DiagramExportApi = {
  ui: {
    writeClipboardText: (text: string) => Promise<void>
  }
  export: {
    diagramPng: (args: { pngDataUrl: string; title: string }) => Promise<DiagramPngExportResult>
  }
}

export type CreateDiagramReviewExportActionsArgs = {
  diagramName: string
  diagramId: string
  cacheContext?: DiagramReviewCacheContext
  api?: DiagramExportApi
  toPngImpl?: typeof toPng
  writeCache?: (
    request: DiagramCacheWriteRequest
  ) => Promise<DiagramCacheWriteResult | DiagramCacheFailure>
}

export function createDiagramReviewExportActions({
  diagramName,
  diagramId,
  cacheContext,
  api = window.api,
  toPngImpl = toPng,
  writeCache = writeDiagramCache
}: CreateDiagramReviewExportActionsArgs): DiagramReviewViewExportActions {
  return {
    onCopySvg: async (payload) => {
      await api.ui.writeClipboardText(payload.svg)
    },
    onExportPng: async (payload) => {
      const pngDataUrl = await svgToPngDataUrl(payload.svg, toPngImpl)
      const result = await api.export.diagramPng({
        pngDataUrl,
        title: diagramName.trim() || diagramId
      })

      if (result.success) {
        await writeExportCache({ payload, pngDataUrl, cacheContext, writeCache })
        return
      }
      if (result.cancelled) {
        return
      }
      const message = result.error ?? 'Failed to export PNG'
      const code = result.code ?? 'controller.export-failed'
      throw new Error(`${code}: ${message}`)
    }
  }
}

export async function svgToPngDataUrl(
  svg: string,
  toPngImpl: typeof toPng = toPng
): Promise<string> {
  const host = document.createElement('div')
  host.setAttribute('data-testid', 'diagram-export-svg-host')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = '1024px'
  host.style.minHeight = '768px'
  host.style.pointerEvents = 'none'
  host.style.background = 'transparent'
  host.innerHTML = svg
  document.body.append(host)

  try {
    return await toPngImpl(host, {
      pixelRatio: 2,
      backgroundColor: 'transparent'
    })
  } finally {
    host.remove()
  }
}

async function writeExportCache({
  payload,
  pngDataUrl,
  cacheContext,
  writeCache
}: {
  payload: DiagramReviewExportPayload
  pngDataUrl: string
  cacheContext?: DiagramReviewCacheContext
  writeCache: (
    request: DiagramCacheWriteRequest
  ) => Promise<DiagramCacheWriteResult | DiagramCacheFailure>
}): Promise<void> {
  if (!cacheContext) {
    return
  }

  const cacheKey = computeDiagramCacheKey({
    sourceHash: payload.sourceHash,
    notation: 'mermaid',
    detectedKind: payload.detectedKind,
    theme: payload.theme,
    rendererVersion: payload.rendererVersion,
    outputProfile: 'export'
  })
  const result = await writeCache({
    projectPath: cacheContext.projectPath,
    modelName: cacheContext.modelName,
    diagramId: payload.diagramId,
    cacheKey,
    outputProfile: 'export',
    pngDataUrl
  })
  if (!result.ok) {
    console.warn(`Diagram export cache write failed: ${result.code}`)
  }
}
