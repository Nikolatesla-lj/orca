import type { NodeTypes } from '@xyflow/react'
import { C4Node } from './C4Node'

export type { ArchitectureFlowNode, ArchitectureNodeData } from './C4Node'

export const nodeTypes: NodeTypes = {
  c4: C4Node,
  operation: C4Node,
  process: C4Node,
  model: C4Node
}
