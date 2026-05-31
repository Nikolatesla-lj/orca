// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { C4ModelDataV2, DiagramRefTarget } from '../../../../shared/scryer/model-types'
import { DiagramControllerError } from './diagram-controller'
import {
  DiagramReferenceControls,
  type CreatedDiagramLinkState,
  type DiagramReferenceActions
} from './DiagramReferenceControls'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const model: C4ModelDataV2 = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'api',
      data: {
        name: 'API',
        description: 'Backend API',
        kind: 'container'
      }
    }
  ],
  edges: [],
  startingLevel: 'system',
  sourceMap: {},
  refPositions: {},
  groups: [],
  flows: [],
  diagrams: [
    {
      id: 'diagram-api-flow',
      name: 'API Flow',
      kind: 'flowchart',
      notation: 'mermaid',
      source: 'flowchart TD\n  api[API]'
    }
  ],
  diagramRefs: [
    {
      id: 'ref-existing',
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'architecture-detail'
    }
  ]
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    valueSetter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function changeInput(input: HTMLInputElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderControls(props: {
  onCreateDiagramRef?: DiagramReferenceActions['onCreateDiagramRef']
  onDeleteDiagramRefs?: DiagramReferenceActions['onDeleteDiagramRefs']
  onCreateDiagramThenLink?: DiagramReferenceActions['onCreateDiagramThenLink']
  onLinkCreatedDiagramNow?: DiagramReferenceActions['onLinkCreatedDiagramNow']
  onCancelCreatedDiagramLink?: DiagramReferenceActions['onCancelCreatedDiagramLink']
  createdDiagramLink?: CreatedDiagramLinkState | null
  target?: DiagramRefTarget
}): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <DiagramReferenceControls
        model={model}
        target={props.target ?? { type: 'node', id: 'api' }}
        label="API"
        syncing={false}
        actions={{
          onCreateDiagramRef: props.onCreateDiagramRef ?? vi.fn(async () => undefined),
          onDeleteDiagramRefs: props.onDeleteDiagramRefs ?? vi.fn(async () => undefined),
          onCreateDiagramThenLink: props.onCreateDiagramThenLink,
          onLinkCreatedDiagramNow: props.onLinkCreatedDiagramNow,
          onCancelCreatedDiagramLink: props.onCancelCreatedDiagramLink,
          createdDiagramLink: props.createdDiagramLink
        }}
      />
    )
  })

  return { container, root }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('DiagramReferenceControls', () => {
  it('lists existing diagrams, offers inline creation, and saves an explicit role', async () => {
    const onCreateDiagramRef = vi.fn(async () => undefined)
    const onCreateDiagramThenLink = vi.fn(async () => undefined)
    const { container, root } = await renderControls({
      onCreateDiagramRef,
      onCreateDiagramThenLink
    })

    expect(container.querySelector('[data-testid="architecture-diagram-ref-row"]')).not.toBeNull()
    expect(container.textContent).toContain('API Flow')
    expect(container.textContent).toContain('Create diagram then link')

    await click(container.querySelector('[data-testid="architecture-diagram-ref-create"]')!)
    expect(onCreateDiagramThenLink).toHaveBeenCalledWith({ type: 'node', id: 'api' }, 'API')

    changeSelect(
      container.querySelector('[data-testid="architecture-diagram-ref-diagram"]')!,
      'diagram-api-flow'
    )
    changeSelect(
      container.querySelector('[data-testid="architecture-diagram-ref-role"]')!,
      'sequence-detail'
    )
    await click(container.querySelector('[data-testid="architecture-diagram-ref-add"]')!)

    expect(onCreateDiagramRef).toHaveBeenCalledWith({
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: 'sequence-detail',
      note: ''
    })

    root.unmount()
  })

  it('resumes role selection for the original pending target and keeps other targets unchanged', async () => {
    const onCreateDiagramRef = vi.fn(async () => undefined)
    const originalTarget: DiagramRefTarget = { type: 'node', id: 'api' }
    const createdDiagramLink: CreatedDiagramLinkState = {
      diagramId: 'diagram-api-flow',
      target: originalTarget,
      targetLabel: 'API',
      status: 'ready'
    }
    const { container, root } = await renderControls({
      onCreateDiagramRef,
      createdDiagramLink
    })

    expect(container.textContent).toContain('Choose a role to link the new diagram to API.')
    expect(
      container.querySelector('[data-testid="architecture-diagram-ref-diagram"]')
    ).toHaveProperty('value', 'diagram-api-flow')

    changeSelect(
      container.querySelector('[data-testid="architecture-diagram-ref-role"]')!,
      'architecture-detail'
    )
    await click(container.querySelector('[data-testid="architecture-diagram-ref-add"]')!)

    expect(onCreateDiagramRef).toHaveBeenCalledWith({
      diagramId: 'diagram-api-flow',
      target: originalTarget,
      role: 'architecture-detail',
      note: ''
    })

    root.unmount()

    const other = await renderControls({
      createdDiagramLink,
      target: { type: 'node', id: 'worker' }
    })
    expect(other.container.textContent).not.toContain('Choose a role to link the new diagram')
    other.root.unmount()
  })

  it('shows the created-but-unlinked recovery message with Link now and target unavailable states', async () => {
    const onLinkCreatedDiagramNow = vi.fn(async () => undefined)
    const onCancelCreatedDiagramLink = vi.fn()
    const { container, root } = await renderControls({
      onLinkCreatedDiagramNow,
      onCancelCreatedDiagramLink,
      createdDiagramLink: {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        targetLabel: 'API',
        status: 'ready'
      }
    })

    await click(container.querySelector('[data-testid="architecture-diagram-ref-cancel-created"]')!)
    expect(onCancelCreatedDiagramLink).toHaveBeenCalled()

    root.unmount()

    const unlinked = await renderControls({
      onLinkCreatedDiagramNow,
      createdDiagramLink: {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        targetLabel: 'API',
        status: 'unlinked'
      }
    })
    expect(unlinked.container.textContent).toContain('Diagram created, not linked yet.')
    await click(
      unlinked.container.querySelector('[data-testid="architecture-diagram-ref-link-now"]')!
    )
    expect(onLinkCreatedDiagramNow).toHaveBeenCalled()
    unlinked.root.unmount()

    const unavailable = await renderControls({
      createdDiagramLink: {
        diagramId: 'diagram-api-flow',
        target: { type: 'node', id: 'api' },
        targetLabel: 'API',
        status: 'unlinked',
        targetUnavailable: true
      }
    })
    expect(unavailable.container.textContent).toContain('Target unavailable')
    unavailable.root.unmount()
  })

  it('surfaces controller role validation errors from the target-side form', async () => {
    const onCreateDiagramRef = vi.fn(async () => {
      throw new DiagramControllerError('controller.missing-role', 'Diagram ref role is required')
    })
    const { container, root } = await renderControls({ onCreateDiagramRef })

    changeSelect(
      container.querySelector('[data-testid="architecture-diagram-ref-diagram"]')!,
      'diagram-api-flow'
    )
    await click(container.querySelector('[data-testid="architecture-diagram-ref-add"]')!)

    expect(onCreateDiagramRef).toHaveBeenCalledWith({
      diagramId: 'diagram-api-flow',
      target: { type: 'node', id: 'api' },
      role: undefined,
      note: ''
    })
    expect(
      container.querySelector('[data-testid="architecture-diagram-ref-error"]')
    ).toHaveProperty('textContent', expect.stringContaining('controller.missing-role'))

    root.unmount()
  })

  it('requires a note for other role through controller validation and removes existing refs', async () => {
    const onCreateDiagramRef = vi.fn(async () => {
      throw new DiagramControllerError(
        'controller.other-note-required',
        'A note is required when role is other'
      )
    })
    const onDeleteDiagramRefs = vi.fn(async () => undefined)
    const { container, root } = await renderControls({ onCreateDiagramRef, onDeleteDiagramRefs })

    changeSelect(
      container.querySelector('[data-testid="architecture-diagram-ref-diagram"]')!,
      'diagram-api-flow'
    )
    changeSelect(container.querySelector('[data-testid="architecture-diagram-ref-role"]')!, 'other')
    const noteInput = container.querySelector('[data-testid="architecture-diagram-ref-note"]')
    expect(noteInput).toBeInstanceOf(HTMLInputElement)
    changeInput(noteInput as HTMLInputElement, '   ')
    await click(container.querySelector('[data-testid="architecture-diagram-ref-add"]')!)

    expect(
      container.querySelector('[data-testid="architecture-diagram-ref-error"]')
    ).toHaveProperty('textContent', expect.stringContaining('controller.other-note-required'))

    await click(container.querySelector('[data-testid="architecture-diagram-ref-remove"]')!)
    expect(onDeleteDiagramRefs).toHaveBeenCalledWith(['ref-existing'])

    root.unmount()
  })
})
