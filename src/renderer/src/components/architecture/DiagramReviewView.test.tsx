// @vitest-environment jsdom
/* eslint-disable max-lines -- Why: review view S7B tests share render, stale-state, export, and cache helpers with existing S2/S4 coverage. */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Diagram,
  DiagramRenderResult,
  DiagramRenderedElement
} from '../../../../shared/scryer/model-types'
import {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  type DiagramCacheReadRequest,
  type DiagramCacheWriteRequest
} from '../../../../shared/scryer/diagram-cache'
import type { DiagramDraftStateSnapshot, DiagramExternalReloadConflict } from './diagram-controller'
import type { DiagramRenderAdapter, DiagramRenderOptions } from './diagram-renderer'
import { DiagramReviewView } from './DiagramReviewView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BASE_SOURCE = 'flowchart TD\n  api[API Gateway]'
const UPDATED_SOURCE = 'flowchart TD\n  updated[Updated Gateway]'
const INVALID_SOURCE = 'flowchart TD\n  broken[Missing'
const VALID_HASH = computeDiagramSourceHash(BASE_SOURCE)
const UPDATED_HASH = computeDiagramSourceHash(UPDATED_SOURCE)
const RENDERER_VERSION = 'mermaid@test|adapter@test|dompurify@test'

const baseDiagram: Diagram = {
  id: 'diagram-api-flow',
  name: 'API Flow',
  kind: 'flowchart',
  notation: 'mermaid',
  source: BASE_SOURCE
}

const renderedElements: DiagramRenderedElement[] = [
  {
    elementKey: 'flowchart:node:api',
    label: 'API Gateway',
    kind: 'node'
  }
]

function resultForSource(source: string): DiagramRenderResult {
  if (source.includes('broken')) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'renderer.invalid-source',
          message: 'Parse error on line 2',
          line: 2,
          column: 9
        }
      ],
      sourceHash: computeDiagramSourceHash(source),
      rendererVersion: RENDERER_VERSION
    }
  }

  const sourceHash = computeDiagramSourceHash(source)
  return {
    ok: true,
    svg: `<svg role="img"><g data-diagram-element-key="flowchart:node:api"><text>${sourceHash}</text></g></svg>`,
    elements: renderedElements,
    diagnostics: [],
    sourceHash,
    rendererVersion: RENDERER_VERSION
  }
}

function createAdapter(): DiagramRenderAdapter {
  const adapter: DiagramRenderAdapter = {
    detectDiagramKind: vi.fn(() => ({ kind: 'flowchart' as const, directive: 'flowchart' })),
    renderDiagram: vi.fn(async (diagram: Diagram, _options: DiagramRenderOptions) =>
      resultForSource(diagram.source)
    ),
    extractRenderedElements: vi.fn(() => renderedElements)
  }
  return Object.assign(adapter, { getRendererVersion: () => RENDERER_VERSION })
}

function cacheKeyForRequest(request: DiagramCacheReadRequest | DiagramCacheWriteRequest): string {
  return `${request.modelName ?? 'model'}:${request.diagramId}:${request.outputProfile}:${request.cacheKey}`
}

function createCacheApi(projectPath = '/repo') {
  const cacheEntries = new Map<string, DiagramCacheWriteRequest>()
  const readDiagramCache = vi.fn(async (request: DiagramCacheReadRequest) => {
    const cached = cacheEntries.get(cacheKeyForRequest(request))
    if (!cached) {
      return {
        ok: true as const,
        hit: false as const,
        outputProfile: request.outputProfile,
        code: 'cache.read-miss' as const
      }
    }
    if (request.outputProfile === 'review') {
      return {
        ok: true as const,
        hit: true as const,
        outputProfile: 'review' as const,
        svg: cached.svg ?? ''
      }
    }
    return {
      ok: true as const,
      hit: true as const,
      outputProfile: request.outputProfile,
      pngDataUrl: cached.pngDataUrl ?? ''
    }
  })
  const writeDiagramCache = vi.fn(async (request: DiagramCacheWriteRequest) => {
    cacheEntries.set(cacheKeyForRequest(request), request)
    return { ok: true as const }
  })
  return { projectPath, cacheEntries, readDiagramCache, writeDiagramCache }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
  }
  throw lastError
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button '${label}' not found`)
  }
  return button
}

function withCacheContext(
  projectPath: string
): Partial<React.ComponentProps<typeof DiagramReviewView>> {
  return {
    cacheContext: { projectPath, modelName: 'model' }
  } as unknown as Partial<React.ComponentProps<typeof DiagramReviewView>>
}

async function renderReviewView(
  props: Partial<React.ComponentProps<typeof DiagramReviewView>> = {}
): Promise<{
  container: HTMLDivElement
  root: Root
  adapter: DiagramRenderAdapter
  draftSnapshots: DiagramDraftStateSnapshot[]
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const adapter = props.renderAdapter ?? createAdapter()
  const draftSnapshots: DiagramDraftStateSnapshot[] = []

  await act(async () => {
    root.render(
      <DiagramReviewView
        diagram={baseDiagram}
        renderAdapter={adapter}
        theme="light"
        editingLocked={false}
        onDraftStateChange={(snapshot) => {
          draftSnapshots.push(snapshot)
        }}
        onResolveExternalReloadConflict={vi.fn()}
        onSaveSource={vi.fn()}
        onRenameDiagram={vi.fn()}
        onDeleteDiagram={vi.fn()}
        {...props}
      />
    )
  })

  return { container, root, adapter, draftSnapshots }
}

afterEach(() => {
  document.body.replaceChildren()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: undefined
  })
})

describe('DiagramReviewView', () => {
  it('renders the current draft source with sanitized SVG and records the draft sourceHash', async () => {
    const { container, root, adapter, draftSnapshots } = await renderReviewView()

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-review-view"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="diagram-render-svg"]')?.innerHTML).toContain(
        '<svg'
      )
      expect(container.querySelector('[data-testid="diagram-render-svg"]')).toHaveProperty(
        'dataset.sourceHash',
        VALID_HASH
      )
    })

    expect(adapter.renderDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ id: baseDiagram.id, source: baseDiagram.source }),
      { theme: 'light', outputProfile: 'review' }
    )
    expect(draftSnapshots.at(-1)).toMatchObject({
      diagramId: baseDiagram.id,
      persistedSource: baseDiagram.source,
      draftSource: baseDiagram.source,
      dirty: false
    })
    expect(container.textContent).not.toContain('Copy SVG')
    expect(container.textContent).not.toContain('Export PNG')
    expect(container.textContent).not.toContain('Reference')

    root.unmount()
  })

  it('copies and exports the current sanitized render payload without refetching by diagram id', async () => {
    const onCopySvg = vi.fn(async (_payload: unknown) => undefined)
    const onExportPng = vi.fn(async (_payload: unknown) => undefined)
    const { container, root } = await renderReviewView({
      exportActions: { onCopySvg, onExportPng }
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-render-svg"]')).not.toBeNull()
      expect(findButton(container, 'Copy SVG').disabled).toBe(false)
      expect(findButton(container, 'Export PNG').disabled).toBe(false)
    })

    click(findButton(container, 'Copy SVG'))
    click(findButton(container, 'Export PNG'))

    await waitFor(() => {
      expect(onCopySvg).toHaveBeenCalledWith(
        expect.objectContaining({
          diagramId: baseDiagram.id,
          svg: expect.stringContaining('<svg'),
          sourceHash: VALID_HASH,
          rendererVersion: RENDERER_VERSION,
          detectedKind: 'flowchart',
          theme: 'light'
        })
      )
      expect(onExportPng).toHaveBeenCalledWith(
        expect.objectContaining({
          diagramId: baseDiagram.id,
          svg: expect.stringContaining(VALID_HASH),
          sourceHash: VALID_HASH
        })
      )
    })
    expect(onCopySvg.mock.calls[0]?.[0]).not.toEqual({ diagramId: baseDiagram.id })

    root.unmount()
  })

  it('keeps copy and export disabled for dirty, stale, invalid, or locked renders', async () => {
    const onCopySvg = vi.fn(async (_payload: unknown) => undefined)
    const onExportPng = vi.fn(async (_payload: unknown) => undefined)
    const { container, root } = await renderReviewView({
      exportActions: { onCopySvg, onExportPng }
    })

    await waitFor(() => {
      expect(findButton(container, 'Copy SVG').disabled).toBe(false)
    })

    const textarea = container.querySelector('textarea[aria-label="Diagram source"]')
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
    changeTextarea(textarea as HTMLTextAreaElement, INVALID_SOURCE)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-render-stale-badge"]')).not.toBeNull()
      expect(findButton(container, 'Copy SVG').disabled).toBe(true)
      expect(findButton(container, 'Export PNG').disabled).toBe(true)
    })
    click(findButton(container, 'Copy SVG'))
    click(findButton(container, 'Export PNG'))
    expect(onCopySvg).not.toHaveBeenCalled()
    expect(onExportPng).not.toHaveBeenCalled()
    root.unmount()

    const locked = await renderReviewView({
      editingLocked: true,
      exportActions: { onCopySvg, onExportPng }
    })
    await waitFor(() => {
      expect(findButton(locked.container, 'Copy SVG').disabled).toBe(true)
      expect(findButton(locked.container, 'Export PNG').disabled).toBe(true)
    })
    locked.root.unmount()

    const invalid = await renderReviewView({
      diagram: { ...baseDiagram, source: INVALID_SOURCE },
      exportActions: { onCopySvg, onExportPng }
    })
    await waitFor(() => {
      expect(invalid.container.textContent).toContain('renderer.invalid-source')
      expect(findButton(invalid.container, 'Copy SVG').disabled).toBe(true)
      expect(findButton(invalid.container, 'Export PNG').disabled).toBe(true)
    })
    invalid.root.unmount()
  })

  it('uses review SVG cache only for clean persisted source renders', async () => {
    const { projectPath, readDiagramCache, writeDiagramCache } = createCacheApi()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        architecture: {
          readDiagramCache,
          writeDiagramCache
        }
      }
    })

    const first = await renderReviewView(withCacheContext(projectPath))

    await waitFor(() => {
      expect(writeDiagramCache).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath,
          modelName: 'model',
          diagramId: baseDiagram.id,
          outputProfile: 'review',
          svg: expect.stringContaining('<svg')
        })
      )
    })
    const cacheKey = computeDiagramCacheKey({
      sourceHash: VALID_HASH,
      notation: 'mermaid',
      detectedKind: 'flowchart',
      theme: 'light',
      rendererVersion: RENDERER_VERSION,
      outputProfile: 'review'
    })
    await expect(
      readDiagramCache({
        projectPath,
        modelName: 'model',
        diagramId: baseDiagram.id,
        cacheKey,
        outputProfile: 'review'
      })
    ).resolves.toMatchObject({
      ok: true,
      hit: true,
      outputProfile: 'review',
      svg: expect.stringContaining('<svg')
    })

    const textarea = first.container.querySelector('textarea[aria-label="Diagram source"]')
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
    changeTextarea(textarea as HTMLTextAreaElement, UPDATED_SOURCE)
    await waitFor(() => {
      expect(first.container.querySelector('[data-testid="diagram-render-svg"]')).toHaveProperty(
        'dataset.sourceHash',
        UPDATED_HASH
      )
    })
    expect(writeDiagramCache).toHaveBeenCalledTimes(1)
    first.root.unmount()

    const cachedAdapter = createAdapter()
    const second = await renderReviewView({
      renderAdapter: cachedAdapter,
      ...withCacheContext(projectPath)
    })
    await waitFor(() => {
      expect(second.container.querySelector('[data-testid="diagram-render-svg"]')).toHaveProperty(
        'dataset.sourceHash',
        VALID_HASH
      )
    })
    expect(cachedAdapter.renderDiagram).not.toHaveBeenCalled()
    expect(cachedAdapter.extractRenderedElements).toHaveBeenCalledWith(
      baseDiagram.source,
      expect.stringContaining('<svg'),
      'flowchart'
    )
    second.root.unmount()
  })

  it('shows reverse diagram refs and navigates or removes the selected ref row', async () => {
    const onNavigateRefTarget = vi.fn()
    const onDeleteRefs = vi.fn(async () => undefined)
    const { container, root } = await renderReviewView({
      refActions: {
        refs: [
          {
            id: 'ref-api-flow',
            diagramId: baseDiagram.id,
            target: { type: 'node', id: 'api' },
            role: 'architecture-detail'
          }
        ],
        onUpsertRefs: vi.fn(async () => undefined),
        onDeleteRefs,
        onNavigateRefTarget
      }
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-reverse-ref-list"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="diagram-reverse-ref-row"]')).toHaveProperty(
        'textContent',
        expect.stringContaining('node:api')
      )
    })

    const rowButtons = container.querySelectorAll('[data-testid="diagram-reverse-ref-row"] button')
    click(rowButtons[0]!)
    expect(onNavigateRefTarget).toHaveBeenCalledWith({ type: 'node', id: 'api' })
    click(rowButtons[1]!)
    expect(onDeleteRefs).toHaveBeenCalledWith(['ref-api-flow'])

    root.unmount()
  })

  it('renders local draft changes, keeps stale SVG visible for invalid source, and saves invalid source explicitly', async () => {
    const onSaveSource = vi.fn(async () => undefined)
    const { container, root, adapter, draftSnapshots } = await renderReviewView({ onSaveSource })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-render-svg"]')).not.toBeNull()
    })

    const textarea = container.querySelector('textarea[aria-label="Diagram source"]')
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
    changeTextarea(textarea as HTMLTextAreaElement, 'flowchart TD\n  broken[Missing')

    await waitFor(() => {
      expect(container.textContent).toContain('renderer.invalid-source')
      expect(container.textContent).toContain('line 2')
      expect(container.querySelector('[data-testid="diagram-render-stale-badge"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="diagram-render-svg"]')).toHaveProperty(
        'dataset.sourceHash',
        VALID_HASH
      )
      expect(container.querySelector('[data-testid="diagram-render-diagnostic"]')).toHaveProperty(
        'textContent',
        expect.stringContaining('Parse error')
      )
    })

    expect(adapter.renderDiagram).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'flowchart TD\n  broken[Missing' }),
      { theme: 'light', outputProfile: 'review' }
    )
    expect(draftSnapshots.at(-1)).toMatchObject({
      draftSource: 'flowchart TD\n  broken[Missing',
      dirty: true
    })

    const saveButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save'
    )
    expect(saveButton).not.toBeUndefined()
    click(saveButton!)

    await waitFor(() => {
      expect(onSaveSource).toHaveBeenCalledWith(baseDiagram.id, 'flowchart TD\n  broken[Missing')
    })
    expect(container.querySelector('textarea[aria-label="Diagram source"]')).toHaveProperty(
      'value',
      'flowchart TD\n  broken[Missing'
    )
    expect(container.textContent).not.toContain('Copy SVG')
    expect(container.textContent).not.toContain('Export PNG')

    root.unmount()
  })

  it('shows model-bound external reload choices and returns to conflict state after closing compare', async () => {
    const conflict: DiagramExternalReloadConflict = {
      modelName: 'model',
      diagramId: baseDiagram.id,
      draftSource: 'flowchart TD\n  local[Local]',
      diskState: 'modified',
      diskSource: 'flowchart TD\n  disk[Disk]',
      baseRevision: 'base-revision',
      diskRevision: 'disk-revision'
    }
    const onResolveExternalReloadConflict = vi.fn()
    const { container, root } = await renderReviewView({
      externalReloadConflict: conflict,
      onResolveExternalReloadConflict
    })

    await waitFor(() => {
      expect(container.textContent).toContain('model')
      expect(container.textContent).toContain('Keep draft')
      expect(container.textContent).toContain('Reload from disk')
      expect(container.textContent).toContain('Compare changes')
    })

    const compare = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Compare changes'
    )
    expect(compare).not.toBeUndefined()
    click(compare!)
    expect(onResolveExternalReloadConflict).toHaveBeenCalledWith('compare-changes')
    expect(
      container.querySelector('[data-testid="diagram-external-reload-compare"]')
    ).not.toBeNull()

    const close = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close compare'
    )
    expect(close).not.toBeUndefined()
    click(close!)
    expect(container.querySelector('[data-testid="diagram-external-reload-compare"]')).toBeNull()
    expect(container.textContent).toContain('Reload from disk')

    root.unmount()
  })

  it('shows deleted external reload choices without compare', async () => {
    const { container, root } = await renderReviewView({
      externalReloadConflict: {
        modelName: 'model',
        diagramId: baseDiagram.id,
        draftSource: baseDiagram.source,
        diskState: 'deleted',
        baseRevision: 'base-revision',
        diskRevision: 'disk-revision'
      }
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Keep draft')
      expect(container.textContent).toContain('Discard deleted')
      expect(container.textContent).toContain('Cancel')
      expect(container.textContent).not.toContain('Compare changes')
    })

    root.unmount()
  })
})
