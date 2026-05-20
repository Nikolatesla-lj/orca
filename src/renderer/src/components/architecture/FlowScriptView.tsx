/* eslint-disable max-lines -- Why: this editor keeps the recursive flow tree, source links, and mention navigation together while the migration is still in flight. */
import { useCallback, useMemo, useRef, useState } from 'react'
import { FileText, GitBranch, GripVertical, Plus, Trash2 } from 'lucide-react'
import type {
  C4Node,
  Flow,
  FlowBranch,
  FlowStep,
  SourceLocation,
  Status
} from '../../../../shared/scryer/model-types'
import { Button } from '../ui/button'
import { DescriptionText } from './nodes/DescriptionText'
import { MentionTextarea, type MentionItem } from './nodes/MentionTextarea'

type MentionNodeInfo = {
  kind: string
  status?: Status
}

export type FlowScriptViewProps = {
  flow: Flow
  allNodes: C4Node[]
  sourceMap: Record<string, SourceLocation[]>
  onUpdate: (updated: Flow) => void | Promise<void>
  onDelete: () => void | Promise<void>
  onNavigateToNode?: (nodeId: string) => void
  onSwitchToTopology?: () => void
  onOpenSourceLocation?: (location: SourceLocation) => void | Promise<void>
  onUpdateSourceMap?: (flowId: string, locations: SourceLocation[]) => void | Promise<void>
}

type StepEditorProps = {
  flow: Flow
  step: FlowStep
  stepLabel: string
  labels: Map<string, string>
  nodeMap: Map<string, MentionNodeInfo>
  mentionItems: MentionItem[]
  onUpdateStep: (id: string, updates: Partial<FlowStep>) => void
  onDeleteStep: (id: string) => void
  onAddBranches: (stepId: string) => void
  onUpdateBranch: (stepId: string, branchIndex: number, updates: Partial<FlowBranch>) => void
  onAddStepToBranch: (stepId: string, branchIndex: number) => void
  onDeleteBranch: (stepId: string, branchIndex: number) => void
  onAddBranchArm: (stepId: string) => void
  editingStepId: string | null
  setEditingStepId: (id: string | null) => void
  stepIdToLabel: Map<string, string>
  dragSourceRef: React.RefObject<string | null>
  dragOverId: string | null
  onDragStart: (event: React.DragEvent, stepId: string) => void
  onDragOver: (event: React.DragEvent, stepId: string) => void
  onDragEnd: () => void
  onMentionClick: (name: string) => void
}

function buildMentionMaps(
  allNodes: C4Node[],
  flow: Flow,
  labels: Map<string, string>
): {
  nodeMap: Map<string, MentionNodeInfo>
  stepIdToLabel: Map<string, string>
  mentionItems: MentionItem[]
} {
  const nodeMap = new Map<string, MentionNodeInfo>()
  const mentionItems: MentionItem[] = []
  for (const node of allNodes) {
    nodeMap.set(node.data.name, { kind: node.data.kind, status: node.data.status })
    nodeMap.set(node.id, { kind: node.data.kind, status: node.data.status })
    mentionItems.push({
      name: node.data.name,
      kind: node.data.kind,
      status: node.data.status
    })
  }

  const stepIdToLabel = new Map<string, string>()
  const visit = (steps: FlowStep[]): void => {
    for (const step of steps) {
      const label = labels.get(step.id) ?? '?'
      const display = `Step ${label}`
      stepIdToLabel.set(step.id, display)
      nodeMap.set(step.id, { kind: 'step' })
      mentionItems.push({
        name: display,
        insertValue: step.id,
        kind: 'step'
      })
      if (step.branches?.length) {
        for (const branch of step.branches) {
          visit(branch.steps)
        }
      }
    }
  }
  visit(flow.steps)

  return { nodeMap, stepIdToLabel, mentionItems }
}

export function countAllSteps(steps: FlowStep[]): number {
  let count = 0
  for (const step of steps) {
    count += 1
    for (const branch of step.branches ?? []) {
      count += countAllSteps(branch.steps)
    }
  }
  return count
}

function computeNumbering(
  steps: FlowStep[],
  prefix: string,
  startNum: number
): Map<string, string> {
  const labels = new Map<string, string>()
  let num = startNum
  for (const step of steps) {
    labels.set(step.id, `${prefix}${num}`)
    if (step.branches?.length) {
      const branchLetter = (index: number) => String.fromCharCode(97 + index)
      for (let branchIndex = 0; branchIndex < step.branches.length; branchIndex += 1) {
        const branchLabels = computeNumbering(
          step.branches[branchIndex].steps,
          `${prefix}${num}${branchLetter(branchIndex)}.`,
          1
        )
        for (const [id, label] of branchLabels) {
          labels.set(id, label)
        }
      }
    }
    num += 1
  }
  return labels
}

function collectAllStepIds(steps: FlowStep[]): string[] {
  const ids: string[] = []
  for (const step of steps) {
    ids.push(step.id)
    for (const branch of step.branches ?? []) {
      ids.push(...collectAllStepIds(branch.steps))
    }
  }
  return ids
}

function nextStepId(flow: Flow): string {
  const max = collectAllStepIds(flow.steps)
    .map((id) => id.replace('step-', ''))
    .map(Number)
    .filter((value) => !Number.isNaN(value))
    .reduce((currentMax, value) => Math.max(currentMax, value), 0)
  return `step-${max + 1}`
}

function findStepDeep(steps: FlowStep[], id: string): FlowStep | undefined {
  for (const step of steps) {
    if (step.id === id) {
      return step
    }
    for (const branch of step.branches ?? []) {
      const found = findStepDeep(branch.steps, id)
      if (found) {
        return found
      }
    }
  }
  return undefined
}

function areSiblings(steps: FlowStep[], idA: string, idB: string): boolean {
  const hasA = steps.some((step) => step.id === idA)
  const hasB = steps.some((step) => step.id === idB)
  if (hasA && hasB) {
    return true
  }
  for (const step of steps) {
    for (const branch of step.branches ?? []) {
      if (areSiblings(branch.steps, idA, idB)) {
        return true
      }
    }
  }
  return false
}

function reorderStepDeep(steps: FlowStep[], sourceId: string, targetId: string): FlowStep[] {
  const sourceIndex = steps.findIndex((step) => step.id === sourceId)
  const targetIndex = steps.findIndex((step) => step.id === targetId)
  if (sourceIndex >= 0 && targetIndex >= 0) {
    const reordered = [...steps]
    const [moved] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    return reordered
  }
  return steps.map((step) => {
    if (!step.branches?.length) {
      return step
    }
    return {
      ...step,
      branches: step.branches.map((branch) => ({
        ...branch,
        steps: reorderStepDeep(branch.steps, sourceId, targetId)
      }))
    }
  })
}

function flattenBranchInto(steps: FlowStep[], stepId: string, insertSteps: FlowStep[]): FlowStep[] {
  const result: FlowStep[] = []
  for (const step of steps) {
    if (step.id === stepId) {
      result.push({ ...step, branches: undefined })
      result.push(...insertSteps)
      continue
    }
    if (step.branches?.length) {
      result.push({
        ...step,
        branches: step.branches.map((branch) => ({
          ...branch,
          steps: flattenBranchInto(branch.steps, stepId, insertSteps)
        }))
      })
      continue
    }
    result.push(step)
  }
  return result
}

function StepEditor({
  flow,
  step,
  stepLabel,
  labels,
  nodeMap,
  mentionItems,
  onUpdateStep,
  onDeleteStep,
  onAddBranches,
  onUpdateBranch,
  onAddStepToBranch,
  onDeleteBranch,
  onAddBranchArm,
  editingStepId,
  setEditingStepId,
  stepIdToLabel,
  dragSourceRef,
  dragOverId,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMentionClick
}: StepEditorProps): React.JSX.Element {
  const editing = editingStepId === step.id

  return (
    <div
      className={
        dragOverId === step.id ? 'border-t-2 border-[var(--text-muted)] -mt-0.5 pt-0.5' : ''
      }
      draggable
      data-testid="architecture-flow-step-card"
      data-step-id={step.id}
      onDragStart={(event) => {
        if (dragSourceRef.current !== step.id) {
          event.preventDefault()
          return
        }
        event.stopPropagation()
        onDragStart(event, step.id)
      }}
      onDragOver={(event) => {
        event.stopPropagation()
        onDragOver(event, step.id)
      }}
      onDragEnd={(event) => {
        event.stopPropagation()
        onDragEnd()
      }}
    >
      <div className="group w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 transition-colors hover:border-[var(--border-strong)]">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex h-6 shrink-0 cursor-grab items-center text-[var(--text-ghost)] hover:text-[var(--text-muted)] active:cursor-grabbing"
            onMouseDown={() => {
              dragSourceRef.current = step.id
            }}
          >
            <GripVertical size={14} />
          </span>

          <span className="flex min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-active)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            {stepLabel}
          </span>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div>
                <MentionTextarea
                  className="min-h-20 w-full resize-none rounded border border-[var(--border)] bg-background px-2 py-1 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                  testId="architecture-flow-step-textarea"
                  value={step.description ?? ''}
                  mentionNames={mentionItems}
                  placeholder="Describe the step"
                  autoSize
                  autoFocus
                  rows={1}
                  maxLength={400}
                  onChange={(value) => {
                    onUpdateStep(step.id, { description: value || undefined })
                  }}
                />
                <div className="mt-0.5 text-right text-[10px] text-[var(--text-muted)]">
                  {(step.description ?? '').length}/400
                </div>
              </div>
            ) : (
              <div
                className={`cursor-text break-words text-sm leading-6 ${
                  step.description ? 'text-[var(--text)]' : 'italic text-[var(--text-muted)]'
                }`}
                onClick={() => setEditingStepId(step.id)}
              >
                {step.description ? (
                  <DescriptionText
                    text={step.description}
                    nodeMap={nodeMap}
                    resolveMap={stepIdToLabel}
                    onMentionClick={onMentionClick}
                  />
                ) : (
                  'Empty step'
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {!step.branches?.length ? (
              <button
                type="button"
                className="cursor-pointer rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text-secondary)]"
                title="Add branches"
                data-testid="architecture-flow-step-add-branches"
                onClick={() => onAddBranches(step.id)}
              >
                <GitBranch size={12} />
              </button>
            ) : null}
            <button
              type="button"
              className="cursor-pointer rounded p-0.5 text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400"
              title="Delete step"
              onClick={() => onDeleteStep(step.id)}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {step.branches?.length ? (
        <div className="mb-1 ml-10 mt-1.5 space-y-1">
          {step.branches.map((branch, branchIndex) => (
            <div
              key={`${step.id}-${branchIndex}`}
              className="border-l-2 border-[var(--border-subtle)] py-1.5 pl-4"
              data-testid="architecture-flow-branch-card"
            >
              <div className="group/branch mb-2 flex items-center gap-1.5">
                <span className="inline-flex min-w-0 flex-1 items-center rounded bg-[var(--surface-tint)] px-2 py-0.5">
                  <input
                    className="w-full bg-transparent text-[11px] font-mono font-medium text-[var(--text-tertiary)] outline-none placeholder:text-[var(--text-ghost)]"
                    data-testid="architecture-flow-branch-condition"
                    value={branch.condition}
                    placeholder={
                      branchIndex === 0
                        ? 'if:'
                        : branchIndex === (step.branches?.length ?? 0) - 1
                          ? 'else:'
                          : 'elif:'
                    }
                    onChange={(event) =>
                      onUpdateBranch(step.id, branchIndex, { condition: event.currentTarget.value })
                    }
                  />
                </span>
                <button
                  type="button"
                  className="cursor-pointer rounded p-0.5 text-[var(--text-ghost)] opacity-0 transition-opacity hover:text-red-500 group-hover/branch:opacity-100"
                  title="Delete branch"
                  onClick={() => onDeleteBranch(step.id, branchIndex)}
                >
                  <Trash2 size={10} />
                </button>
              </div>

              <div className="space-y-1.5">
                {branch.steps.map((subStep) => (
                  <StepEditor
                    key={subStep.id}
                    flow={flow}
                    step={subStep}
                    stepLabel={labels.get(subStep.id) ?? '?'}
                    labels={labels}
                    nodeMap={nodeMap}
                    mentionItems={mentionItems}
                    onUpdateStep={onUpdateStep}
                    onDeleteStep={onDeleteStep}
                    onAddBranches={onAddBranches}
                    onUpdateBranch={onUpdateBranch}
                    onAddStepToBranch={onAddStepToBranch}
                    onDeleteBranch={onDeleteBranch}
                    onAddBranchArm={onAddBranchArm}
                    editingStepId={editingStepId}
                    setEditingStepId={setEditingStepId}
                    stepIdToLabel={stepIdToLabel}
                    dragSourceRef={dragSourceRef}
                    dragOverId={dragOverId}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragEnd={onDragEnd}
                    onMentionClick={onMentionClick}
                  />
                ))}
              </div>

              <button
                type="button"
                className="mt-1 flex items-center gap-1 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                data-testid="architecture-flow-branch-add-step"
                onClick={() => onAddStepToBranch(step.id, branchIndex)}
              >
                <Plus size={10} />
                step
              </button>
            </div>
          ))}

          <button
            type="button"
            className="ml-1 flex items-center gap-1 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            onClick={() => onAddBranchArm(step.id)}
          >
            <GitBranch size={10} />
            branch
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FlowScriptView({
  flow,
  allNodes,
  sourceMap,
  onUpdate,
  onDelete,
  onNavigateToNode,
  onSwitchToTopology,
  onOpenSourceLocation,
  onUpdateSourceMap
}: FlowScriptViewProps): React.JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const labels = useMemo(() => computeNumbering(flow.steps, '', 1), [flow.steps])
  const { nodeMap, stepIdToLabel, mentionItems } = useMemo(
    () => buildMentionMaps(allNodes, flow, labels),
    [allNodes, flow, labels]
  )

  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragSourceRef = useRef<string | null>(null)

  const flowSources = sourceMap[flow.id] ?? []
  const [sourceDraft, setSourceDraft] = useState('')
  const nodeNameToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of allNodes) {
      if (!map.has(node.data.name)) {
        map.set(node.data.name, node.id)
      }
    }
    return map
  }, [allNodes])

  const onMentionClick = useCallback(
    (name: string) => {
      if (stepIdToLabel.has(name)) {
        setEditingStepId(name)
        return
      }
      const nodeId = nodeNameToId.get(name)
      if (nodeId) {
        onSwitchToTopology?.()
        onNavigateToNode?.(nodeId)
      }
    },
    [nodeNameToId, onNavigateToNode, onSwitchToTopology, stepIdToLabel]
  )

  const updateStepDeep = useCallback(
    (steps: FlowStep[], id: string, updates: Partial<FlowStep>): FlowStep[] =>
      steps.map((step) => {
        if (step.id === id) {
          return { ...step, ...updates }
        }
        if (step.branches?.length) {
          return {
            ...step,
            branches: step.branches.map((branch) => ({
              ...branch,
              steps: updateStepDeep(branch.steps, id, updates)
            }))
          }
        }
        return step
      }),
    []
  )

  const deleteStepDeep = useCallback(
    (steps: FlowStep[], id: string): FlowStep[] =>
      steps
        .filter((step) => step.id !== id)
        .map((step) => {
          if (!step.branches?.length) {
            return step
          }
          return {
            ...step,
            branches: step.branches.map((branch) => ({
              ...branch,
              steps: deleteStepDeep(branch.steps, id)
            }))
          }
        }),
    []
  )

  const onUpdateStep = useCallback(
    (id: string, updates: Partial<FlowStep>) => {
      onUpdate({ ...flow, steps: updateStepDeep(flow.steps, id, updates) })
    },
    [flow, onUpdate, updateStepDeep]
  )

  const onDeleteStep = useCallback(
    (id: string) => {
      onUpdate({ ...flow, steps: deleteStepDeep(flow.steps, id) })
      setEditingStepId((current) => (current === id ? null : current))
    },
    [flow, onUpdate, deleteStepDeep]
  )

  const onAddStepBottom = useCallback(() => {
    const newStep: FlowStep = { id: nextStepId(flow), description: '' }
    onUpdate({ ...flow, steps: [...flow.steps, newStep] })
    setEditingStepId(newStep.id)
  }, [flow, onUpdate])

  const onAddBranches = useCallback(
    (stepId: string) => {
      onUpdateStep(stepId, {
        branches: [
          { condition: 'if:', steps: [] },
          { condition: 'else:', steps: [] }
        ]
      })
    },
    [onUpdateStep]
  )

  const onUpdateBranch = useCallback(
    (stepId: string, branchIndex: number, updates: Partial<FlowBranch>) => {
      const step = findStepDeep(flow.steps, stepId)
      if (!step?.branches) {
        return
      }
      onUpdateStep(stepId, {
        branches: step.branches.map((branch, index) =>
          index === branchIndex ? { ...branch, ...updates } : branch
        )
      })
    },
    [flow.steps, onUpdateStep]
  )

  const onAddStepToBranch = useCallback(
    (stepId: string, branchIndex: number) => {
      const step = findStepDeep(flow.steps, stepId)
      if (!step?.branches) {
        return
      }
      const newStep: FlowStep = { id: nextStepId(flow), description: '' }
      onUpdateStep(stepId, {
        branches: step.branches.map((branch, index) =>
          index === branchIndex ? { ...branch, steps: [...branch.steps, newStep] } : branch
        )
      })
      setEditingStepId(newStep.id)
    },
    [flow, onUpdateStep]
  )

  const onDeleteBranch = useCallback(
    (stepId: string, branchIndex: number) => {
      const step = findStepDeep(flow.steps, stepId)
      if (!step?.branches) {
        return
      }
      const remaining = step.branches.filter((_, index) => index !== branchIndex)
      if (remaining.length <= 1) {
        const flattened = remaining.length === 1 ? remaining[0].steps : []
        onUpdate({
          ...flow,
          steps: flattenBranchInto(flow.steps, stepId, flattened)
        })
      } else {
        onUpdateStep(stepId, { branches: remaining })
      }
    },
    [flow, onUpdate, onUpdateStep]
  )

  const onAddBranchArm = useCallback(
    (stepId: string) => {
      const step = findStepDeep(flow.steps, stepId)
      if (!step?.branches) {
        return
      }
      onUpdateStep(stepId, {
        branches: [...step.branches, { condition: '', steps: [] }]
      })
    },
    [flow.steps, onUpdateStep]
  )

  const onDragStart = useCallback((event: React.DragEvent, stepId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', stepId)
    dragSourceRef.current = stepId
  }, [])

  const onDragOver = useCallback(
    (event: React.DragEvent, stepId: string) => {
      const sourceId = dragSourceRef.current
      if (!sourceId || !areSiblings(flow.steps, sourceId, stepId)) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDragOverId(stepId)
    },
    [flow.steps]
  )

  const onDragEnd = useCallback(() => {
    const sourceId = dragSourceRef.current
    const targetId = dragOverId
    dragSourceRef.current = null
    setDragOverId(null)
    if (!sourceId || !targetId || sourceId === targetId) {
      return
    }
    onUpdate({
      ...flow,
      steps: reorderStepDeep(flow.steps, sourceId, targetId)
    })
  }, [dragOverId, flow, onUpdate])

  const activeStepCount = countAllSteps(flow.steps)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
      <div
        className="scrollbar-sleek flex-1 overflow-y-auto"
        data-testid="architecture-flow-editor"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setEditingStepId(null)
          }
        }}
      >
        <div className="mx-auto max-w-2xl space-y-2 px-6 py-8">
          <div className="group/header mb-6">
            <div className="flex items-start gap-2">
              <input
                className="w-full bg-transparent text-lg font-semibold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                value={flow.name}
                placeholder="Flow name..."
                data-testid="architecture-flow-name"
                onChange={(event) => onUpdate({ ...flow, name: event.currentTarget.value })}
              />
              {confirmingDelete ? (
                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-[var(--text-tertiary)]">Delete?</span>
                  <button
                    type="button"
                    className="cursor-pointer rounded bg-red-500 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                    onClick={onDelete}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded bg-[var(--surface-active)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--border-strong)]"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-1 shrink-0 cursor-pointer text-xs text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-500 group-hover/header:opacity-100"
                  onClick={() => setConfirmingDelete(true)}
                  title="Delete flow"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <textarea
              className="mt-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--text-tertiary)] outline-none placeholder:text-[var(--text-ghost)]"
              rows={1}
              value={flow.description ?? ''}
              placeholder="What does this flow describe?"
              onChange={(event) =>
                onUpdate({ ...flow, description: event.currentTarget.value || undefined })
              }
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {flowSources.length > 0 ? (
                flowSources.map((source, index) => (
                  <Button
                    key={`${source.pattern}-${index}`}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="justify-start text-[var(--text-tertiary)] hover:text-[var(--text)]"
                    data-testid="architecture-flow-source-link"
                    title={source.pattern}
                    onClick={() => void onOpenSourceLocation?.(source)}
                  >
                    <FileText className="size-3" />
                    <span className="font-mono">{source.pattern}</span>
                  </Button>
                ))
              ) : (
                <span className="italic text-[var(--text-muted)]">No source link</span>
              )}
              {onUpdateSourceMap ? (
                <div className="flex items-center gap-1">
                  <input
                    className="h-6 w-32 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
                    value={sourceDraft}
                    placeholder="src/**/*.test.ts"
                    onChange={(event) => setSourceDraft(event.currentTarget.value)}
                    data-testid="architecture-flow-source-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    data-testid="architecture-flow-source-add"
                    onClick={() => {
                      const pattern = sourceDraft.trim()
                      if (!pattern) {
                        return
                      }
                      void onUpdateSourceMap(flow.id, [...flowSources, { pattern }])
                      setSourceDraft('')
                    }}
                  >
                    <Plus className="size-3" />
                    Source
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {flow.steps.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-sm text-[var(--text-muted)]">
              <div className="space-y-1.5 text-center">
                <p className="text-base font-medium text-[var(--text-tertiary)]">
                  Describe a sequence
                </p>
                <p className="max-w-xs leading-relaxed">
                  Flows model user journeys, data pipelines, or any multi-step process.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text)]"
                data-testid="architecture-flow-add-step"
                onClick={onAddStepBottom}
              >
                <Plus size={12} />
                Add first step
              </button>
            </div>
          ) : (
            <>
              {flow.steps.map((step) => (
                <StepEditor
                  key={step.id}
                  flow={flow}
                  step={step}
                  stepLabel={labels.get(step.id) ?? '?'}
                  labels={labels}
                  nodeMap={nodeMap}
                  mentionItems={mentionItems}
                  onUpdateStep={onUpdateStep}
                  onDeleteStep={onDeleteStep}
                  onAddBranches={onAddBranches}
                  onUpdateBranch={onUpdateBranch}
                  onAddStepToBranch={onAddStepToBranch}
                  onDeleteBranch={onDeleteBranch}
                  onAddBranchArm={onAddBranchArm}
                  editingStepId={editingStepId}
                  setEditingStepId={setEditingStepId}
                  stepIdToLabel={stepIdToLabel}
                  dragSourceRef={dragSourceRef}
                  dragOverId={dragOverId}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragEnd={onDragEnd}
                  onMentionClick={onMentionClick}
                />
              ))}

              <button
                type="button"
                className="flex items-center gap-1.5 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                data-testid="architecture-flow-add-step"
                onClick={onAddStepBottom}
              >
                <Plus size={12} />
                Add step
              </button>
            </>
          )}

          <div className="pt-2 text-[11px] text-[var(--text-muted)]">
            {activeStepCount} step{activeStepCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>
    </div>
  )
}
