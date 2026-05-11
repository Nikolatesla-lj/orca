/* eslint-disable max-lines -- Why: the Scryer context panel is intentionally kept together while the remaining node/edge context pieces are still being migrated. */
import { Boxes, Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  C4Edge,
  C4ModelData,
  C4Node,
  C4Shape,
  Contract,
  ContractItem,
  Group,
  Status
} from '../../../../shared/scryer/model-types'
import { Button } from '../ui/button'
import { GroupsPalette } from './GroupsView'
import { getNodeContextForModel } from './c4-model'

const STATUS_OPTIONS: Status[] = ['proposed', 'implemented', 'verified', 'vagrant']
const SHAPE_OPTIONS: C4Shape[] = ['rectangle', 'cylinder', 'pipe', 'trapezoid', 'bucket', 'hexagon']

type ArchitectureContextPanelProps = {
  model: C4ModelData | null
  selectedNode: C4Node | null
  selectedEdge: C4Edge | null
  selectedGroup: Group | null
  multiSelectedNodeIds: string[]
  totalSelected: number
  canGroupSelection: boolean
  targetNodeId: string
  sourcePattern: string
  syncing: boolean
  onAddNode: () => void | Promise<void>
  onSave: () => void | Promise<void>
  onDeleteNode: () => void | Promise<void>
  onDeleteEdge: () => void | Promise<void>
  onUpdateNodeDraft: (nodeId: string, patch: Partial<C4Node['data']>) => void
  onUpdateNode: (patch: Partial<C4Node['data']>) => void | Promise<void>
  onUpdateEdge: (patch: { label?: string; method?: string }) => void | Promise<void>
  onSourcePatternChange: (pattern: string) => void
  onSaveSourcePattern: (pattern: string) => void | Promise<void>
  onTargetNodeChange: (nodeId: string) => void
  onAddEdge: () => void | Promise<void>
  onCreateGroupFromSelection: (name: string) => void | Promise<void>
  onAddSelectionToGroup: (groupId: string) => void | Promise<void>
  onUpdateGroup: (patch: Partial<Group>) => void | Promise<void>
  onDeleteGroup: () => void | Promise<void>
  onRemoveGroupMember: (nodeId: string) => void | Promise<void>
  groupsPaletteMode?: boolean
  nodeDiff?: C4Node['data']
  onDismissNodeDiff?: (nodeId: string) => void
}

export function ArchitectureContextPanel({
  model,
  selectedNode,
  selectedEdge,
  selectedGroup,
  multiSelectedNodeIds,
  totalSelected,
  canGroupSelection,
  targetNodeId,
  sourcePattern,
  syncing,
  onAddNode,
  onSave,
  onDeleteNode,
  onDeleteEdge,
  onUpdateNodeDraft,
  onUpdateNode,
  onUpdateEdge,
  onSourcePatternChange,
  onSaveSourcePattern,
  onTargetNodeChange,
  onAddEdge,
  onCreateGroupFromSelection,
  onAddSelectionToGroup,
  onUpdateGroup,
  onDeleteGroup,
  onRemoveGroupMember,
  groupsPaletteMode = false,
  nodeDiff,
  onDismissNodeDiff
}: ArchitectureContextPanelProps): React.JSX.Element {
  if (multiSelectedNodeIds.length >= 2 && model) {
    return (
      <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background text-sm">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <MultiSelectionPanel
            selectedIds={multiSelectedNodeIds}
            totalSelected={totalSelected}
            groups={model.groups ?? []}
            canGroup={canGroupSelection}
            syncing={syncing}
            onCreateGroup={onCreateGroupFromSelection}
            onAddToGroup={onAddSelectionToGroup}
          />
        </div>
      </aside>
    )
  }

  if (groupsPaletteMode && !selectedGroup) {
    return (
      <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background text-sm">
        <GroupsPalette />
      </aside>
    )
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background text-sm">
      <div className="flex gap-2 border-b border-border p-3">
        <Button
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
          size="sm"
          onClick={() => void onAddNode()}
          data-testid="architecture-add-node"
          disabled={syncing}
        >
          <Plus className="size-3.5" />
          Add Node
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => void onSave()} disabled={syncing}>
          <Save className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedGroup && model ? (
          <GroupEditor
            group={selectedGroup}
            model={model}
            syncing={syncing}
            onUpdateGroup={onUpdateGroup}
            onDeleteGroup={onDeleteGroup}
            onRemoveGroupMember={onRemoveGroupMember}
          />
        ) : selectedNode && model ? (
          <NodeEditor
            node={selectedNode}
            model={model}
            targetNodeId={targetNodeId}
            sourcePattern={sourcePattern}
            syncing={syncing}
            onUpdateNodeDraft={onUpdateNodeDraft}
            onUpdateNode={onUpdateNode}
            onSourcePatternChange={onSourcePatternChange}
            onSaveSourcePattern={onSaveSourcePattern}
            onTargetNodeChange={onTargetNodeChange}
            onAddEdge={onAddEdge}
            onDeleteNode={onDeleteNode}
            nodeDiff={nodeDiff}
            onDismissNodeDiff={onDismissNodeDiff}
          />
        ) : selectedEdge && model ? (
          <EdgeEditor
            edge={selectedEdge}
            model={model}
            syncing={syncing}
            onUpdateEdge={onUpdateEdge}
            onDeleteEdge={onDeleteEdge}
          />
        ) : (
          <div className="rounded border border-border p-3 text-xs text-muted-foreground">
            {model?.nodes.length
              ? 'Select a node, relationship, or group to edit it.'
              : 'Add a node to start the architecture model.'}
          </div>
        )}
      </div>
    </aside>
  )
}

function MultiSelectionPanel({
  selectedIds,
  totalSelected,
  groups,
  canGroup,
  syncing,
  onCreateGroup,
  onAddToGroup
}: {
  selectedIds: string[]
  totalSelected: number
  groups: Group[]
  canGroup: boolean
  syncing: boolean
  onCreateGroup: (name: string) => void | Promise<void>
  onAddToGroup: (groupId: string) => void | Promise<void>
}): React.JSX.Element {
  const [name, setName] = useState('New group')
  return (
    <div className="grid gap-3" data-testid="architecture-multi-selection-panel">
      <PanelTitle title="Selection" />
      <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {selectedIds.length} groupable node{selectedIds.length === 1 ? '' : 's'} selected
        {totalSelected !== selectedIds.length ? ` from ${totalSelected} selected items` : ''}
      </div>
      {canGroup ? (
        <>
          <section className="grid gap-2">
            <PanelTitle title="Create group" />
            <input
              className="rounded border border-border bg-background px-2 py-1"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) {
                  void onCreateGroup(name.trim())
                  setName('New group')
                }
              }}
              data-testid="architecture-multi-group-name"
              disabled={syncing}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (name.trim()) {
                  void onCreateGroup(name.trim())
                  setName('New group')
                }
              }}
              disabled={syncing || !name.trim()}
              data-testid="architecture-multi-create-group"
            >
              <Plus className="size-3.5" />
              Create group
            </Button>
          </section>
          {groups.length > 0 ? (
            <section className="grid gap-2 border-t border-border pt-3">
              <PanelTitle title="Add to existing" />
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="flex items-center gap-2 rounded border border-border px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => void onAddToGroup(group.id)}
                  data-testid="architecture-multi-add-existing"
                  disabled={syncing}
                >
                  <Boxes className="size-3" />
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <span>{group.memberIds.length}</span>
                </button>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <div className="rounded border border-border p-3 text-xs text-muted-foreground">
          Drill into a system or container to group selected nodes.
        </div>
      )}
    </div>
  )
}

function GroupEditor({
  group,
  model,
  syncing,
  onUpdateGroup,
  onDeleteGroup,
  onRemoveGroupMember
}: {
  group: Group
  model: C4ModelData
  syncing: boolean
  onUpdateGroup: (patch: Partial<Group>) => void | Promise<void>
  onDeleteGroup: () => void | Promise<void>
  onRemoveGroupMember: (nodeId: string) => void | Promise<void>
}): React.JSX.Element {
  const memberNodes = group.memberIds
    .map((memberId) => model.nodes.find((node) => node.id === memberId))
    .filter((node): node is C4Node => !!node)
  return (
    <div className="grid gap-4" data-testid="architecture-selected-group-editor">
      <section className="grid gap-3">
        <PanelTitle title="Group" />
        <ReadOnlyField label="id" value={group.id} />
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            className="rounded border border-border bg-background px-2 py-1"
            value={group.name}
            onChange={(event) => void onUpdateGroup({ name: event.currentTarget.value })}
            data-testid="architecture-selected-group-name"
            disabled={syncing}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Description</span>
          <textarea
            className="min-h-20 rounded border border-border bg-background px-2 py-1"
            value={group.description ?? ''}
            onChange={(event) =>
              void onUpdateGroup({ description: event.currentTarget.value || undefined })
            }
            data-testid="architecture-selected-group-description"
            disabled={syncing}
          />
        </label>
      </section>

      <GroupContractEditor
        contract={group.contract}
        syncing={syncing}
        onChange={(contract) => void onUpdateGroup({ contract })}
      />

      <section className="grid gap-2 border-t border-border pt-3">
        <PanelTitle title="Members" />
        {memberNodes.length === 0 ? (
          <div className="rounded border border-border p-2 text-xs text-muted-foreground">
            This group has no members.
          </div>
        ) : (
          memberNodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{node.data.name}</span>
              <span className="text-muted-foreground">{node.data.kind}</span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => void onRemoveGroupMember(node.id)}
                disabled={syncing}
                data-testid="architecture-selected-group-member-remove"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))
        )}
      </section>

      <Button
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:text-destructive"
        onClick={() => void onDeleteGroup()}
        disabled={syncing}
        data-testid="architecture-selected-group-delete"
      >
        <Trash2 className="size-3.5" />
        Delete group
      </Button>
    </div>
  )
}

function EdgeEditor({
  edge,
  model,
  syncing,
  onUpdateEdge,
  onDeleteEdge
}: {
  edge: C4Edge
  model: C4ModelData
  syncing: boolean
  onUpdateEdge: (patch: { label?: string; method?: string }) => void | Promise<void>
  onDeleteEdge: () => void | Promise<void>
}): React.JSX.Element {
  const source = model.nodes.find((node) => node.id === edge.source)
  const target = model.nodes.find((node) => node.id === edge.target)
  const label = edge.data?.label ?? ''
  const method = edge.data?.method ?? ''

  return (
    <div className="grid gap-3" data-testid="architecture-edge-editor">
      <PanelTitle title="Relationship" />
      <ReadOnlyField label="id" value={edge.id} />
      <ReadOnlyField label="source" value={source?.data.name ?? edge.source} />
      <ReadOnlyField label="target" value={target?.data.name ?? edge.target} />
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Label</span>
        <input
          className="rounded border border-border bg-background px-2 py-1"
          value={label}
          onChange={(event) => void onUpdateEdge({ label: event.currentTarget.value })}
          placeholder="reads from"
          data-testid="architecture-edge-label-input"
          disabled={syncing}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Method</span>
        <input
          className="rounded border border-border bg-background px-2 py-1"
          value={method}
          onChange={(event) => void onUpdateEdge({ method: event.currentTarget.value })}
          placeholder="REST/JSON"
          data-testid="architecture-edge-method-input"
          disabled={syncing}
        />
      </label>
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:text-destructive"
        onClick={() => void onDeleteEdge()}
        disabled={syncing}
      >
        <Trash2 className="size-3.5" />
        Delete relationship
      </Button>
    </div>
  )
}

function NodeEditor({
  node,
  model,
  targetNodeId,
  sourcePattern,
  syncing,
  onUpdateNodeDraft,
  onUpdateNode,
  onSourcePatternChange,
  onSaveSourcePattern,
  onTargetNodeChange,
  onAddEdge,
  onDeleteNode,
  nodeDiff,
  onDismissNodeDiff
}: {
  node: C4Node
  model: C4ModelData
  targetNodeId: string
  sourcePattern: string
  syncing: boolean
  onUpdateNodeDraft: (nodeId: string, patch: Partial<C4Node['data']>) => void
  onUpdateNode: (patch: Partial<C4Node['data']>) => void | Promise<void>
  onSourcePatternChange: (pattern: string) => void
  onSaveSourcePattern: (pattern: string) => void | Promise<void>
  onTargetNodeChange: (nodeId: string) => void
  onAddEdge: () => void | Promise<void>
  onDeleteNode: () => void | Promise<void>
  nodeDiff?: C4Node['data']
  onDismissNodeDiff?: (nodeId: string) => void
}): React.JSX.Element {
  const context = useMemo(() => getNodeContextForModel(model, node.id), [model, node.id])
  const showTechnology = node.data.kind === 'container' || node.data.kind === 'component'
  const showExternal = node.data.kind === 'system'
  const showShape =
    node.data.kind !== 'person' &&
    node.data.kind !== 'operation' &&
    node.data.kind !== 'process' &&
    node.data.kind !== 'model'
  const showContract =
    node.data.kind !== 'person' && !node.data.external && node.data.kind !== 'model'

  return (
    <div className="grid gap-4">
      {nodeDiff ? (
        <NodeDiffPanel
          previous={nodeDiff}
          current={node.data}
          onDismiss={() => onDismissNodeDiff?.(node.id)}
        />
      ) : null}
      <section className="grid gap-3">
        <PanelTitle title="Node" />
        <ReadOnlyField label="id" value={node.id} />
        <ReadOnlyField label="kind" value={node.data.kind} />
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            className="rounded border border-border bg-background px-2 py-1"
            value={node.data.name}
            onChange={(event) => onUpdateNodeDraft(node.id, { name: event.currentTarget.value })}
            onBlur={(event) => void onUpdateNode({ name: event.currentTarget.value })}
            data-testid="architecture-node-name"
            disabled={syncing}
          />
        </label>

        {showTechnology ? (
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {node.data.kind === 'component' ? 'Implements' : 'Technology'}
            </span>
            <input
              className="rounded border border-border bg-background px-2 py-1"
              value={node.data.technology ?? ''}
              onChange={(event) =>
                onUpdateNodeDraft(node.id, { technology: event.currentTarget.value || undefined })
              }
              onBlur={(event) =>
                void onUpdateNode({ technology: event.currentTarget.value || undefined })
              }
              placeholder={node.data.kind === 'component' ? 'AuthService' : 'Node.js'}
              disabled={syncing}
            />
          </label>
        ) : null}

        {showExternal ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!node.data.external}
              onChange={(event) =>
                void onUpdateNode({
                  external: event.currentTarget.checked || undefined,
                  status: event.currentTarget.checked ? undefined : node.data.status
                })
              }
              disabled={syncing}
            />
            External system
          </label>
        ) : null}

        {showShape ? (
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Shape</span>
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={node.data.shape ?? ''}
              onChange={(event) =>
                void onUpdateNode({
                  shape: event.currentTarget.value
                    ? (event.currentTarget.value as C4Shape)
                    : undefined
                })
              }
              disabled={syncing}
            >
              <option value="">default</option>
              {SHAPE_OPTIONS.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Description</span>
          <textarea
            className="min-h-20 rounded border border-border bg-background px-2 py-1"
            value={node.data.description}
            onChange={(event) =>
              onUpdateNodeDraft(node.id, { description: event.currentTarget.value })
            }
            onBlur={(event) => void onUpdateNode({ description: event.currentTarget.value })}
            disabled={syncing}
          />
        </label>

        {node.data.kind !== 'person' && !node.data.external ? (
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={node.data.status ?? ''}
              onChange={(event) =>
                void onUpdateNode({
                  status: event.currentTarget.value
                    ? (event.currentTarget.value as Status)
                    : undefined,
                  statusReason: undefined
                })
              }
              disabled={syncing}
            >
              <option value="">none</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section className="grid gap-3 border-t border-border pt-3">
        <PanelTitle title="Source Map" />
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Source pattern</span>
          <input
            className="rounded border border-border bg-background px-2 py-1"
            value={sourcePattern}
            onChange={(event) => onSourcePatternChange(event.currentTarget.value)}
            onBlur={(event) => void onSaveSourcePattern(event.currentTarget.value)}
            placeholder="src/**/*.ts"
            data-testid="architecture-source-pattern"
            disabled={syncing}
          />
        </label>
      </section>

      <section className="grid gap-3 border-t border-border pt-3">
        <PanelTitle title="Relationships" />
        <div className="flex gap-2">
          <select
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
            value={targetNodeId}
            onChange={(event) => onTargetNodeChange(event.currentTarget.value)}
            data-testid="architecture-edge-target"
            disabled={syncing}
          >
            <option value="">Select target</option>
            {model.nodes
              .filter((candidate) => candidate.id !== node.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.data.name}
                </option>
              ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onAddEdge()}
            disabled={syncing}
            data-testid="architecture-add-edge"
          >
            Add
          </Button>
        </div>
      </section>

      <NotesEditor
        notes={node.data.notes ?? []}
        syncing={syncing}
        onChange={(notes) => void onUpdateNode({ notes: notes.length ? notes : undefined })}
      />

      {showContract ? (
        <ContractEditor
          contract={node.data.contract}
          syncing={syncing}
          onChange={(contract) => void onUpdateNode({ contract })}
        />
      ) : null}

      <NodeContextSummary context={context} />

      <Button
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:text-destructive"
        onClick={() => void onDeleteNode()}
        disabled={syncing}
      >
        <Trash2 className="size-3.5" />
        Delete node
      </Button>
    </div>
  )
}

function NotesEditor({
  notes,
  syncing,
  onChange
}: {
  notes: string[]
  syncing: boolean
  onChange: (notes: string[]) => void
}): React.JSX.Element {
  return (
    <section className="grid gap-2 border-t border-border pt-3">
      <PanelTitle title="Notes" />
      {notes.map((note, index) => (
        <div key={index} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
            value={note}
            onChange={(event) =>
              onChange(
                notes.map((item, itemIndex) =>
                  itemIndex === index ? event.currentTarget.value : item
                )
              )
            }
            disabled={syncing}
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(notes.filter((_, itemIndex) => itemIndex !== index))}
            disabled={syncing}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...notes, ''])}
        disabled={syncing}
      >
        <Plus className="size-3.5" />
        Add note
      </Button>
    </section>
  )
}

function NodeDiffPanel({
  previous,
  current,
  onDismiss
}: {
  previous: C4Node['data']
  current: C4Node['data']
  onDismiss: () => void
}): React.JSX.Element {
  const rows = [
    ['name', previous.name, current.name],
    ['status', previous.status ?? '', current.status ?? ''],
    ['technology', previous.technology ?? '', current.technology ?? ''],
    ['description', previous.description ?? '', current.description ?? '']
  ].filter(([, before, after]) => before !== after)

  if (rows.length === 0) {
    return (
      <section
        className="grid gap-2 rounded border border-violet-400/30 bg-violet-400/10 p-3 text-xs"
        data-testid="architecture-node-diff"
      >
        <div className="flex items-center justify-between gap-2">
          <PanelTitle title="External Change" />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            dismiss
          </button>
        </div>
        <div className="text-muted-foreground">This node changed outside the panel.</div>
      </section>
    )
  }

  return (
    <section
      className="grid gap-2 rounded border border-violet-400/30 bg-violet-400/10 p-3 text-xs"
      data-testid="architecture-node-diff"
    >
      <div className="flex items-center justify-between gap-2">
        <PanelTitle title="External Change" />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
          data-testid="architecture-node-diff-dismiss"
        >
          dismiss
        </button>
      </div>
      {rows.map(([label, before, after]) => (
        <div key={label} className="grid gap-1 rounded border border-border bg-background/70 p-2">
          <div className="font-medium text-foreground/80">{label}</div>
          <div className="line-through opacity-70">{before || '(empty)'}</div>
          <div>{after || '(empty)'}</div>
        </div>
      ))}
    </section>
  )
}

function ContractEditor({
  contract,
  syncing,
  onChange
}: {
  contract: Contract | undefined
  syncing: boolean
  onChange: (contract: Contract) => void
}): React.JSX.Element {
  const normalized = normalizeContract(contract)
  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <PanelTitle title="Contract" />
      {(['expect', 'ask', 'never'] as const).map((key) => (
        <ContractList
          key={key}
          label={key}
          items={normalized[key]}
          syncing={syncing}
          onChange={(items) => onChange({ ...normalized, [key]: items })}
        />
      ))}
    </section>
  )
}

function GroupContractEditor({
  contract,
  syncing,
  onChange
}: {
  contract: Contract | undefined
  syncing: boolean
  onChange: (contract: Contract) => void
}): React.JSX.Element {
  const normalized = normalizeContract(contract)
  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <PanelTitle title="Contract" />
      {(['expect', 'ask', 'never'] as const).map((key) => (
        <label key={key} className="grid gap-1">
          <span className="text-xs text-muted-foreground">{key}</span>
          <textarea
            className="min-h-16 resize-y rounded border border-border bg-background px-2 py-1 text-xs"
            value={contractItemsToText(normalized[key])}
            onChange={(event) =>
              onChange({ ...normalized, [key]: textToContractItems(event.currentTarget.value) })
            }
            data-testid={`architecture-selected-group-contract-${key}`}
            disabled={syncing}
          />
        </label>
      ))}
    </section>
  )
}

function ContractList({
  label,
  items,
  syncing,
  onChange
}: {
  label: keyof Contract
  items: ContractItem[]
  syncing: boolean
  onChange: (items: ContractItem[]) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
            value={contractItemText(item)}
            onChange={(event) =>
              onChange(
                items.map((current, itemIndex) =>
                  itemIndex === index
                    ? updateContractItemText(current, event.currentTarget.value)
                    : current
                )
              )
            }
            disabled={syncing}
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            disabled={syncing}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, ''])}
        disabled={syncing}
      >
        <Plus className="size-3.5" />
        Add {label}
      </Button>
    </div>
  )
}

function NodeContextSummary({
  context
}: {
  context: ReturnType<typeof getNodeContextForModel>
}): React.JSX.Element {
  return (
    <section className="grid gap-2 border-t border-border pt-3 text-xs">
      <PanelTitle title="get_node Context" />
      <ContextLine label="descendants" value={context.descendants.length.toString()} />
      <ContextLine label="internal edges" value={context.internalEdges.length.toString()} />
      <ContextLine label="external edges" value={context.externalEdges.length.toString()} />
      <ContextLine label="source maps" value={Object.keys(context.sourceMap).length.toString()} />
      {context.groups.length ? (
        <div className="flex flex-wrap gap-1">
          {context.groups.map((group) => (
            <span
              key={group.id}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground"
            >
              <Boxes className="size-3" />
              {group.name}
            </span>
          ))}
        </div>
      ) : null}
      {context.externalEdges.map((edge) => (
        <div key={edge.id} className="rounded border border-border px-2 py-1 text-muted-foreground">
          {edge.direction === 'out' ? 'out' : 'in'}: {edge.externalNodeName}
          {edge.data?.label ? ` - ${edge.data.label}` : ''}
        </div>
      ))}
    </section>
  )
}

function PanelTitle({ title }: { title: string }): React.JSX.Element {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="truncate rounded border border-border bg-muted px-2 py-1 text-xs">
        {value}
      </code>
    </div>
  )
}

function ContextLine({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function normalizeContract(contract: Contract | undefined): Contract {
  return {
    expect: contract?.expect ?? [],
    ask: contract?.ask ?? [],
    never: contract?.never ?? []
  }
}

function contractItemText(item: ContractItem): string {
  return typeof item === 'string' ? item : item.text
}

function updateContractItemText(item: ContractItem, text: string): ContractItem {
  return typeof item === 'string' ? text : { ...item, text }
}

function contractItemsToText(items: ContractItem[]): string {
  return items.map(contractItemText).join('\n')
}

function textToContractItems(text: string): ContractItem[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
