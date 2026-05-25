import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { C4ModelData } from '../../../../shared/scryer/model-types'
import { ArchitectureModelTree } from './ArchitectureModelTree'

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
    nodes: [],
    edges: [],
    startingLevel: 'system',
    sourceMap: {},
    refPositions: {},
    groups: [],
    flows: [{ id: 'flow-1', name: 'Open dashboard', steps: [] }]
  }
}

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
})
