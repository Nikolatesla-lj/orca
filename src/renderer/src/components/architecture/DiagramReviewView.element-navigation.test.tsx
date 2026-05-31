// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Diagram,
  DiagramRef,
  DiagramRenderResult,
  DiagramRenderedElement
} from '../../../../shared/scryer/model-types'
import type { DiagramDraftStateSnapshot } from './diagram-controller'
import type { DiagramRenderAdapter, DiagramRenderOptions } from './diagram-renderer'
import {
  DiagramElementTargetPicker,
  type DiagramElementNavigationCandidate,
  DiagramReviewView,
  resolveDiagramElementNavigation
} from './DiagramReviewView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const VALID_HASH = `sha256:${'a'.repeat(64)}` as const

const baseDiagram: Diagram = {
  id: 'diagram-api-flow',
  name: 'API Flow',
  kind: 'flowchart',
  notation: 'mermaid',
  source: 'flowchart TD\n  api[API Gateway]'
}

const renderedElements: DiagramRenderedElement[] = [
  {
    elementKey: 'flowchart:node:api',
    label: 'API Gateway',
    kind: 'node'
  }
]

function resultForSource(): DiagramRenderResult {
  return {
    ok: true,
    svg: `<svg role="img"><g data-diagram-element-key="flowchart:node:api"><text>${VALID_HASH}</text></g></svg>`,
    elements: renderedElements,
    diagnostics: [],
    sourceHash: VALID_HASH,
    rendererVersion: 'mermaid@test|adapter@test|dompurify@test'
  }
}

function createAdapter(): DiagramRenderAdapter {
  return {
    detectDiagramKind: vi.fn(() => ({ kind: 'flowchart' as const, directive: 'flowchart' })),
    renderDiagram: vi.fn(async (_diagram: Diagram, _options: DiagramRenderOptions) =>
      resultForSource()
    ),
    extractRenderedElements: vi.fn(() => renderedElements)
  }
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

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function renderReviewView(
  props: Partial<ComponentProps<typeof DiagramReviewView>> = {}
): Promise<{
  container: HTMLDivElement
  root: Root
  draftSnapshots: DiagramDraftStateSnapshot[]
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const draftSnapshots: DiagramDraftStateSnapshot[] = []

  await act(async () => {
    root.render(
      <DiagramReviewView
        diagram={baseDiagram}
        renderAdapter={createAdapter()}
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

  return { container, root, draftSnapshots }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('DiagramReviewView element navigation', () => {
  it('resolves element navigation by exact elementKey and collapses duplicate refs by target', () => {
    const refs: DiagramRef[] = [
      {
        id: 'ref-node-a',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail',
        note: 'Primary ownership'
      },
      {
        id: 'ref-node-b',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'api' },
        role: 'sequence-detail',
        note: 'Call path'
      },
      {
        id: 'ref-flow',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'flow', id: 'flow-signup' },
        role: 'behavior-detail'
      },
      {
        id: 'ref-missing',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'missing' },
        role: 'architecture-detail'
      },
      {
        id: 'ref-other-element',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:worker',
        target: { type: 'node', id: 'worker' },
        role: 'architecture-detail'
      }
    ]

    expect(
      resolveDiagramElementNavigation({
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:unknown',
        refs,
        isTargetNavigable: () => true,
        getTargetLabel: () => 'label'
      })
    ).toEqual({ action: 'none' })

    const resolution = resolveDiagramElementNavigation({
      diagramId: baseDiagram.id,
      elementKey: 'flowchart:node:api',
      refs,
      isTargetNavigable: (target) => target.type !== 'node' || target.id !== 'missing',
      getTargetLabel: (target) => {
        if (target.type === 'node') {
          return `Node ${target.id}`
        }
        if (target.type === 'flow') {
          return `Flow ${target.id}`
        }
        return 'Other target'
      }
    })

    expect(resolution).toMatchObject({ action: 'choose-target' })
    if (resolution.action !== 'choose-target') {
      throw new Error('Expected target picker resolution')
    }
    expect(resolution.candidates).toEqual([
      {
        refIds: ['ref-node-a', 'ref-node-b'],
        target: { type: 'node', id: 'api' },
        roles: ['architecture-detail', 'sequence-detail'],
        label: 'Node api',
        notes: ['Primary ownership', 'Call path']
      },
      {
        refIds: ['ref-flow'],
        target: { type: 'flow', id: 'flow-signup' },
        roles: ['behavior-detail'],
        label: 'Flow flow-signup',
        notes: []
      }
    ])
  })

  it('renders element target picker candidates and only navigates through onChoose', async () => {
    const candidates: DiagramElementNavigationCandidate[] = [
      {
        refIds: ['ref-node-a', 'ref-node-b'],
        target: { type: 'node' as const, id: 'api' },
        roles: ['architecture-detail', 'sequence-detail'],
        label: 'Node api',
        notes: ['Primary ownership', 'Call path']
      },
      {
        refIds: ['ref-flow'],
        target: { type: 'flow' as const, id: 'flow-signup' },
        roles: ['behavior-detail'],
        label: 'Flow signup',
        notes: []
      }
    ]
    const onChoose = vi.fn()
    const onCancel = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <DiagramElementTargetPicker
          candidates={candidates}
          onChoose={onChoose}
          onCancel={onCancel}
        />
      )
    })

    expect(container.textContent).toContain('Node api')
    expect(container.textContent).toContain('architecture-detail')
    expect(container.textContent).toContain('Primary ownership')
    click(container.querySelectorAll('[data-testid="diagram-element-target-option"]')[1]!)
    expect(onChoose).toHaveBeenCalledWith(candidates[1])
    expect(onCancel).not.toHaveBeenCalled()

    click(container.querySelector('[data-testid="diagram-element-target-cancel"]')!)
    expect(onCancel).toHaveBeenCalled()
    root.unmount()
  })

  it('uses SVG clicks for navigation by default and shows a picker for multiple targets', async () => {
    const onNavigateRefTarget = vi.fn()
    const refs: DiagramRef[] = [
      {
        id: 'ref-api-node',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'node', id: 'api' },
        role: 'architecture-detail'
      },
      {
        id: 'ref-api-flow',
        diagramId: baseDiagram.id,
        elementKey: 'flowchart:node:api',
        target: { type: 'flow', id: 'flow-signup' },
        role: 'behavior-detail'
      }
    ]
    const { container, root } = await renderReviewView({
      refActions: {
        refs,
        onUpsertRefs: vi.fn(async () => undefined),
        onDeleteRefs: vi.fn(async () => undefined),
        onNavigateRefTarget,
        isTargetNavigable: () => true,
        getTargetLabel: (target) =>
          target.type === 'node' ? `Node ${target.id}` : `Flow ${'id' in target ? target.id : ''}`
      }
    })

    await waitFor(() => {
      expect(
        container.querySelector('[data-diagram-element-key="flowchart:node:api"]')
      ).not.toBeNull()
    })

    click(container.querySelector('[data-diagram-element-key="flowchart:node:api"]')!)
    expect(onNavigateRefTarget).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="diagram-element-target-picker"]')).not.toBeNull()

    click(container.querySelectorAll('[data-testid="diagram-element-target-option"]')[1]!)
    expect(onNavigateRefTarget).toHaveBeenCalledWith({ type: 'flow', id: 'flow-signup' })

    click(container.querySelector('[data-testid="diagram-render-svg"] svg')!)
    expect(onNavigateRefTarget).toHaveBeenCalledTimes(1)

    root.unmount()
  })

  it('enters explicit Bind element mode and creates an elementKey ref without svgSelector', async () => {
    const onCreateRef = vi.fn(async () => undefined)
    const { container, root } = await renderReviewView({
      refActions: {
        refs: [],
        onUpsertRefs: vi.fn(async () => undefined),
        onDeleteRefs: vi.fn(async () => undefined),
        onNavigateRefTarget: vi.fn(),
        onCreateRef
      }
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-bind-element"]')).not.toBeNull()
      expect(
        container.querySelector('[data-diagram-element-key="flowchart:node:api"]')
      ).not.toBeNull()
    })

    click(container.querySelector('[data-testid="diagram-bind-element"]')!)
    expect(container.textContent).toContain('Select a bindable SVG element')
    click(container.querySelector('[data-diagram-element-key="flowchart:node:api"]')!)
    expect(container.textContent).toContain('API Gateway')

    const targetInput = container.querySelector('[data-testid="diagram-bind-target-id"]')
    expect(targetInput).toBeInstanceOf(HTMLInputElement)
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(targetInput, 'api')
      targetInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const roleSelect = container.querySelector('[data-testid="diagram-bind-role"]')
    expect(roleSelect).toBeInstanceOf(HTMLSelectElement)
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      valueSetter?.call(roleSelect, 'architecture-detail')
      roleSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    click(container.querySelector('[data-testid="diagram-bind-save"]')!)

    expect(onCreateRef).toHaveBeenCalledWith({
      diagramId: baseDiagram.id,
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail',
      elementKey: 'flowchart:node:api',
      sourceRange: undefined,
      note: ''
    })
    const firstCall = onCreateRef.mock.calls[0] as unknown[] | undefined
    expect(JSON.stringify(firstCall?.[0])).not.toContain('svgSelector')
    expect(container.textContent).not.toContain('Select a bindable SVG element')

    root.unmount()
  })

  it('exits Bind element mode through Cancel and Escape without creating refs', async () => {
    const onCreateRef = vi.fn(async () => undefined)
    const { container, root } = await renderReviewView({
      refActions: {
        refs: [],
        onUpsertRefs: vi.fn(async () => undefined),
        onDeleteRefs: vi.fn(async () => undefined),
        onNavigateRefTarget: vi.fn(),
        onCreateRef
      }
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram-bind-element"]')).not.toBeNull()
    })

    click(container.querySelector('[data-testid="diagram-bind-element"]')!)
    expect(container.textContent).toContain('Select a bindable SVG element')
    click(container.querySelector('[data-testid="diagram-bind-cancel"]')!)
    expect(container.textContent).not.toContain('Select a bindable SVG element')

    click(container.querySelector('[data-testid="diagram-bind-element"]')!)
    expect(container.textContent).toContain('Select a bindable SVG element')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.textContent).not.toContain('Select a bindable SVG element')
    expect(onCreateRef).not.toHaveBeenCalled()

    root.unmount()
  })
})
