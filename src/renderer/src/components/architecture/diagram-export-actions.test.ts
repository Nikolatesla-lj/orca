// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { computeDiagramCacheKey } from '../../../../shared/scryer/diagram-cache'
import type { DiagramReviewExportPayload } from './DiagramReviewView'
import { createDiagramReviewExportActions } from './diagram-export-actions'

const payload: DiagramReviewExportPayload = {
  diagramId: 'diagram-api-flow',
  svg: '<svg><text>safe</text></svg>',
  sourceHash: `sha256:${'a'.repeat(64)}`,
  rendererVersion: 'mermaid@test|adapter@test|dompurify@test',
  detectedKind: 'flowchart',
  theme: 'light'
}

describe('diagram review export actions', () => {
  it('copies SVG and exports PNG from the current payload, then writes export cache after save', async () => {
    const writeClipboardText = vi.fn(async () => undefined)
    const diagramPng = vi.fn(async () => ({
      success: true as const,
      filePath: '/tmp/API Flow.png'
    }))
    const writeCache = vi.fn(async () => ({ ok: true as const }))
    const toPngImpl = vi.fn(async () => 'data:image/png;base64,AAAA')
    const actions = createDiagramReviewExportActions({
      diagramName: 'API Flow',
      diagramId: payload.diagramId,
      cacheContext: { projectPath: '/repo', modelName: 'model' },
      api: {
        ui: { writeClipboardText },
        export: { diagramPng }
      },
      toPngImpl,
      writeCache
    })

    await actions.onCopySvg(payload)
    await actions.onExportPng(payload)

    expect(writeClipboardText).toHaveBeenCalledWith(payload.svg)
    expect(toPngImpl).toHaveBeenCalledWith(
      expect.objectContaining({ innerHTML: payload.svg }),
      expect.objectContaining({ pixelRatio: 2 })
    )
    expect(diagramPng).toHaveBeenCalledWith({
      pngDataUrl: 'data:image/png;base64,AAAA',
      title: 'API Flow'
    })
    expect(writeCache).toHaveBeenCalledWith({
      projectPath: '/repo',
      modelName: 'model',
      diagramId: payload.diagramId,
      cacheKey: computeDiagramCacheKey({
        sourceHash: payload.sourceHash,
        notation: 'mermaid',
        detectedKind: payload.detectedKind,
        theme: payload.theme,
        rendererVersion: payload.rendererVersion,
        outputProfile: 'export'
      }),
      outputProfile: 'export',
      pngDataUrl: 'data:image/png;base64,AAAA'
    })
  })

  it('does not write export cache when the user cancels the save dialog', async () => {
    const writeCache = vi.fn(async () => ({ ok: true as const }))
    const actions = createDiagramReviewExportActions({
      diagramName: '',
      diagramId: payload.diagramId,
      cacheContext: { projectPath: '/repo', modelName: 'model' },
      api: {
        ui: { writeClipboardText: vi.fn(async () => undefined) },
        export: {
          diagramPng: vi.fn(async () => ({ success: false as const, cancelled: true }))
        }
      },
      toPngImpl: vi.fn(async () => 'data:image/png;base64,AAAA'),
      writeCache
    })

    await expect(actions.onExportPng(payload)).resolves.toBeUndefined()
    expect(writeCache).not.toHaveBeenCalled()
  })

  it('surfaces controller.export-failed without writing export cache on save failure', async () => {
    const writeCache = vi.fn(async () => ({ ok: true as const }))
    const actions = createDiagramReviewExportActions({
      diagramName: 'API Flow',
      diagramId: payload.diagramId,
      cacheContext: { projectPath: '/repo', modelName: 'model' },
      api: {
        ui: { writeClipboardText: vi.fn(async () => undefined) },
        export: {
          diagramPng: vi.fn(async () => ({
            success: false as const,
            code: 'controller.export-failed' as const,
            error: 'disk full'
          }))
        }
      },
      toPngImpl: vi.fn(async () => 'data:image/png;base64,AAAA'),
      writeCache
    })

    await expect(actions.onExportPng(payload)).rejects.toThrow('controller.export-failed')
    expect(writeCache).not.toHaveBeenCalled()
  })
})
