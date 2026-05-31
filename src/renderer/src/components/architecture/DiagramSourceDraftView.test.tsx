import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Diagram } from '../../../../shared/scryer/model-types'
import type { DiagramExternalReloadConflict } from './diagram-controller'
import { DiagramDraftSwitchDialogView, DiagramSourceDraftView } from './DiagramSourceDraftView'

type TestElement = ReactElement<{
  children?: ReactNode
  onClick?: () => void
  [key: string]: unknown
}>

function findButtonByText(node: ReactNode, text: string): TestElement | null {
  if (!isValidElement(node)) {
    return null
  }

  const element = node as TestElement
  if (element.type === 'button' && Children.toArray(element.props.children).join('') === text) {
    return element
  }

  for (const child of Children.toArray(element.props.children)) {
    const found = findButtonByText(child, text)
    if (found) {
      return found
    }
  }

  return null
}

const diagram: Diagram = {
  id: 'diagram-api',
  name: 'API Flow',
  kind: 'flowchart',
  notation: 'mermaid',
  source: 'flowchart TD\n  A[API]'
}

const modifiedConflict: DiagramExternalReloadConflict = {
  modelName: 'model',
  diagramId: 'diagram-api',
  draftSource: 'flowchart TD\n  A[Local draft]',
  diskState: 'modified',
  diskSource: 'flowchart TD\n  A[Disk update]',
  baseRevision: 'base-revision',
  diskRevision: 'disk-revision'
}

describe('DiagramSourceDraftView', () => {
  it('renders a source-only editor shell with no render/export/cache placeholders', () => {
    const html = renderToStaticMarkup(
      <DiagramSourceDraftView
        diagram={diagram}
        editingLocked={false}
        onDraftStateChange={vi.fn()}
        onResolveExternalReloadConflict={vi.fn()}
        onSaveSource={vi.fn()}
        onRenameDiagram={vi.fn()}
        onDeleteDiagram={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="diagram-source-draft-view"')
    expect(html).toContain('API Flow')
    expect(html).not.toContain('svg')
    expect(html).not.toContain('Copy SVG')
    expect(html).not.toContain('Export PNG')
    expect(html).not.toContain('thumbnail')
  })

  it('exposes exactly the S1A dirty draft switch actions', () => {
    const onResolve = vi.fn()
    const view = DiagramDraftSwitchDialogView({ onResolve })
    const html = renderToStaticMarkup(view)

    expect(html).toContain('Save and switch')
    expect(html).toContain('Discard and switch')
    expect(html).toContain('Cancel')
    findButtonByText(view, 'Save and switch')?.props.onClick?.()
    findButtonByText(view, 'Discard and switch')?.props.onClick?.()
    findButtonByText(view, 'Cancel')?.props.onClick?.()

    expect(onResolve).toHaveBeenNthCalledWith(1, 'save')
    expect(onResolve).toHaveBeenNthCalledWith(2, 'discard')
    expect(onResolve).toHaveBeenNthCalledWith(3, 'cancel')
  })

  it('shows modified external reload choices with model binding and compare action only for modified conflicts', () => {
    const onResolve = vi.fn()
    const view = (
      <DiagramSourceDraftView
        diagram={diagram}
        editingLocked={false}
        onDraftStateChange={vi.fn()}
        externalReloadConflict={modifiedConflict}
        onResolveExternalReloadConflict={onResolve}
        onSaveSource={vi.fn()}
        onRenameDiagram={vi.fn()}
        onDeleteDiagram={vi.fn()}
      />
    )
    const html = renderToStaticMarkup(view)

    expect(html).toContain('model')
    expect(html).toContain('Keep draft')
    expect(html).toContain('Reload from disk')
    expect(html).toContain('Compare changes')
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('shows deleted external reload choices without compare', () => {
    const html = renderToStaticMarkup(
      <DiagramSourceDraftView
        diagram={diagram}
        editingLocked={false}
        onDraftStateChange={vi.fn()}
        externalReloadConflict={{
          ...modifiedConflict,
          diskState: 'deleted',
          diskSource: undefined
        }}
        onResolveExternalReloadConflict={vi.fn()}
        onSaveSource={vi.fn()}
        onRenameDiagram={vi.fn()}
        onDeleteDiagram={vi.fn()}
      />
    )

    expect(html).toContain('Keep draft')
    expect(html).toContain('Discard deleted')
    expect(html).toContain('Cancel')
    expect(html).not.toContain('Compare changes')
  })
})
