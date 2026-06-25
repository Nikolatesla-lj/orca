import type { C4ModelData, C4Node, ContractItem } from '../../../../shared/scryer/model-types'

export type NormalizedContractItem = {
  text: string
  passed?: boolean
  url?: string
  image?: {
    filename: string
    mimeType: string
    data: string
  }
}

export function contractItemText(item: ContractItem): string {
  return typeof item === 'string' ? item : item.text
}

export function normalizeContractItem(item: ContractItem): NormalizedContractItem {
  return typeof item === 'string' ? { text: item } : { ...item }
}

export function setContractItemPassed(
  item: ContractItem,
  passed: boolean | undefined
): ContractItem {
  const normalized = normalizeContractItem(item)
  return passed === undefined
    ? {
        ...normalized,
        passed: undefined
      }
    : {
        ...normalized,
        passed
      }
}

export function collectInheritedExpectItems(
  model: C4ModelData,
  nodeId: string
): NormalizedContractItem[] {
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  const chain: C4Node[] = []
  let current = byId.get(nodeId)
  while (current) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain.flatMap((node) =>
    (node.data.contract?.expect ?? []).map((item) => normalizeContractItem(item))
  )
}

export function getVerifiedBlockers(model: C4ModelData, nodeId: string): string[] {
  return collectInheritedExpectItems(model, nodeId)
    .filter((item) => item.passed !== true)
    .map((item) => item.text)
}
