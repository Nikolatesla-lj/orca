// @vitest-environment jsdom
/* eslint-disable max-lines -- Why: tree tests keep S1 library grouping and S7B thumbnail cache coverage together. */

import { readFileSync } from 'fs'
import { join } from 'path'
import { act, createElement } from 'react'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { C4ModelData, Diagram } from '../../../../shared/scryer/model-types'
import {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  type DiagramCacheReadRequest,
  type DiagramCacheWriteRequest
} from '../../../../shared/scryer/diagram-cache'
import { parseModelData } from '../../../../shared/scryer/parse-model'
import {
  ArchitectureModelTree,
  buildDiagramLibraryViewModel,
  DiagramLibrarySection,
  getNextDiagramLibraryFocusIndex
} from './ArchitectureModelTree'
import type { DiagramRenderAdapter } from './diagram-renderer'

const { toPngMock } = vi.hoisted(() => ({
  toPngMock: vi.fn(async () => 'data:image/png;base64,AAAA')
}))

vi.mock('html-to-image', () => ({
  toPng: toPngMock
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type TestElement = ReactElement<{
  children?: ReactNode
  onClick?: () => void
  [key: string]: unknown
}>

function findByTestId(node: ReactNode, testId: string): TestElement | null {
  if (!isValidElement(node)) {
    return null
  }

  const element = node as TestElement
  if (element.props['data-testid'] === testId) {
    return element
  }

  for (const child of Children.toArray(element.props.children)) {
    const found = findByTestId(child, testId)
    if (found) {
      return found
    }
  }

  return null
}

function modelWithFlow(): C4ModelData {
  return {
    schemaVersion: 2,
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    refPositions: {},
    groups: [],
    flows: [{ id: 'flow-1', name: 'Open dashboard', steps: [] }],
    diagrams: [
      {
        id: 'diagram-api',
        name: 'API Flow',
        kind: 'flowchart',
        notation: 'mermaid',
        source: 'flowchart TD\n  A[API]'
      }
    ],
    diagramRefs: []
  }
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
  return { projectPath, readDiagramCache, writeDiagramCache }
}

function createThumbnailAdapter(): DiagramRenderAdapter {
  const adapter: DiagramRenderAdapter = {
    detectDiagramKind: vi.fn(() => ({ kind: 'flowchart' as const, directive: 'flowchart' })),
    renderDiagram: vi.fn(async (diagram: Diagram) => ({
      ok: true as const,
      svg: '<svg><text>thumbnail</text></svg>',
      elements: [],
      diagnostics: [],
      sourceHash: computeDiagramSourceHash(diagram.source),
      rendererVersion: 'mermaid@test|adapter@test|dompurify@test'
    })),
    extractRenderedElements: vi.fn(() => [])
  }
  return Object.assign(adapter, {
    getRendererVersion: () => 'mermaid@test|adapter@test|dompurify@test'
  })
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

afterEach(() => {
  document.body.replaceChildren()
  toPngMock.mockClear()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: undefined
  })
})

describe('ArchitectureModelTree', () => {
  it('opens the shared Flows view when the Flow tree heading is clicked', () => {
    const onOpenFlows = vi.fn()
    const props: React.ComponentProps<typeof ArchitectureModelTree> & {
      onOpenFlows: () => void
    } = {
      model: modelWithFlow(),
      selectedNodeId: null,
      activeFlowId: null,
      onSelectNode: vi.fn(),
      onDrillNode: vi.fn(),
      onSelectFlow: vi.fn(),
      onOpenFlows
    }

    const heading = findByTestId(ArchitectureModelTree(props), 'architecture-flow-tree-heading')

    expect(heading).not.toBeNull()
    expect(heading?.type).toBe('button')
    heading?.props.onClick?.()

    expect(onOpenFlows).toHaveBeenCalledOnce()
  })

  it('hides the Diagram library unless the internal preview flag is enabled', () => {
    const props: React.ComponentProps<typeof ArchitectureModelTree> = {
      model: modelWithFlow(),
      selectedNodeId: null,
      activeFlowId: null,
      activeDiagramId: null,
      diagramLibraryEnabled: false,
      onSelectNode: vi.fn(),
      onDrillNode: vi.fn(),
      onSelectFlow: vi.fn(),
      onSelectDiagram: vi.fn(),
      onCreateDiagram: vi.fn()
    }

    expect(renderToStaticMarkup(ArchitectureModelTree(props))).not.toContain(
      'architecture-diagram-library'
    )

    const visible = renderToStaticMarkup(
      ArchitectureModelTree({ ...props, diagramLibraryEnabled: true })
    )

    expect(visible).toContain('architecture-diagram-library')
  })

  it('routes Diagram library item and create actions through the supplied handlers', () => {
    const props = {
      view: buildDiagramLibraryViewModel({
        diagrams: modelWithFlow().diagrams ?? [],
        diagramRefs: [],
        searchQuery: ''
      }),
      activeDiagramId: null,
      collapsedKinds: new Set<string>(),
      searchQuery: '',
      onSearchQueryChange: vi.fn(),
      onToggleKind: vi.fn(),
      onSelectDiagram: vi.fn(),
      onCreateDiagram: vi.fn()
    }

    const visible = DiagramLibrarySection(props)
    const item = findByTestId(visible, 'architecture-diagram-library-item')
    const create = findByTestId(visible, 'architecture-diagram-library-create')

    expect(item).not.toBeNull()
    item?.props.onClick?.()
    expect(props.onSelectDiagram).toHaveBeenCalledWith('diagram-api')
    expect(create).not.toBeNull()
    create?.props.onClick?.()
    expect(props.onCreateDiagram).toHaveBeenCalledOnce()
  })

  it('builds the FX9 large-list view with search, collapsible groups, counts, and unlinked badges', () => {
    const model = parseModelData(
      readFileSync(
        join(
          process.cwd(),
          'src',
          'shared',
          'scryer',
          '__fixtures__',
          'diagram-library',
          'many-diagrams-for-prompt.scry'
        ),
        'utf8'
      )
    )

    const fullView = buildDiagramLibraryViewModel({
      diagrams: model.diagrams ?? [],
      diagramRefs: model.diagramRefs ?? [],
      searchQuery: ''
    })
    expect(fullView.showSearch).toBe(true)
    expect(fullView.totalCount).toBe(21)
    expect(fullView.groups.find((group) => group.kind === 'flowchart')?.count).toBe(4)
    expect(
      fullView.groups
        .flatMap((group) => group.items)
        .find((item) => item.diagram.id === 'diagram-03-inventory-state')?.unlinked
    ).toBe(true)

    const paymentView = buildDiagramLibraryViewModel({
      diagrams: model.diagrams ?? [],
      diagramRefs: model.diagramRefs ?? [],
      searchQuery: 'payment'
    })
    expect(
      paymentView.groups.flatMap((group) => group.items).map((item) => item.diagram.id)
    ).toEqual(['diagram-19-refund-flow', 'diagram-02-payment-sequence'])

    const sourceOnlyView = buildDiagramLibraryViewModel({
      diagrams: model.diagrams ?? [],
      diagramRefs: model.diagramRefs ?? [],
      searchQuery: 'Token Service'
    })
    expect(sourceOnlyView.groups.flatMap((group) => group.items)).toHaveLength(0)

    const collapsedMarkup = renderToStaticMarkup(
      DiagramLibrarySection({
        view: fullView,
        activeDiagramId: null,
        collapsedKinds: new Set(['flowchart']),
        searchQuery: '',
        onSearchQueryChange: vi.fn(),
        onToggleKind: vi.fn(),
        onSelectDiagram: vi.fn(),
        onCreateDiagram: vi.fn()
      })
    )
    expect(collapsedMarkup).toContain('flowchart')
    expect(collapsedMarkup).toContain('4')
    expect(collapsedMarkup).not.toContain('Auth Overview')
  })

  it('computes keyboard arrow movement for Diagram library groups and items', () => {
    expect(getNextDiagramLibraryFocusIndex(0, 'ArrowDown', 4)).toBe(1)
    expect(getNextDiagramLibraryFocusIndex(3, 'ArrowDown', 4)).toBe(3)
    expect(getNextDiagramLibraryFocusIndex(2, 'ArrowUp', 4)).toBe(1)
    expect(getNextDiagramLibraryFocusIndex(0, 'ArrowUp', 4)).toBe(0)
    expect(getNextDiagramLibraryFocusIndex(1, 'Home', 4)).toBe(0)
    expect(getNextDiagramLibraryFocusIndex(1, 'End', 4)).toBe(3)
  })

  it('writes thumbnail PNGs through cache IPC using the persisted source cache key', async () => {
    const diagram = modelWithFlow().diagrams![0]!
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

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const renderAdapter = createThumbnailAdapter()

    await act(async () => {
      root.render(
        createElement(ArchitectureModelTree, {
          model: modelWithFlow(),
          selectedNodeId: null,
          activeFlowId: null,
          activeDiagramId: null,
          diagramLibraryEnabled: true,
          diagramThumbnailContext: {
            projectPath,
            modelName: 'model' as const,
            theme: 'light',
            renderAdapter
          },
          onSelectNode: vi.fn(),
          onDrillNode: vi.fn(),
          onSelectFlow: vi.fn(),
          onSelectDiagram: vi.fn(),
          onCreateDiagram: vi.fn()
        })
      )
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-library-thumbnail"]')).toHaveProperty(
        'dataset.thumbnailState',
        'ready'
      )
    })

    const sourceHash = computeDiagramSourceHash(diagram.source)
    const cacheKey = computeDiagramCacheKey({
      sourceHash,
      notation: 'mermaid',
      detectedKind: 'flowchart',
      theme: 'light',
      rendererVersion: 'mermaid@test|adapter@test|dompurify@test',
      outputProfile: 'thumbnail'
    })
    expect(writeDiagramCache).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath,
        modelName: 'model',
        diagramId: diagram.id,
        cacheKey,
        outputProfile: 'thumbnail',
        pngDataUrl: 'data:image/png;base64,AAAA'
      })
    )
    await expect(
      readDiagramCache({
        projectPath,
        modelName: 'model',
        diagramId: diagram.id,
        cacheKey,
        outputProfile: 'thumbnail'
      })
    ).resolves.toMatchObject({
      ok: true,
      hit: true,
      pngDataUrl: 'data:image/png;base64,AAAA'
    })

    root.unmount()
  })
})
