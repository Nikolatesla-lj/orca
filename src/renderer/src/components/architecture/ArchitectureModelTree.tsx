/* eslint-disable max-lines -- Why: this component still owns the C4 tree, flow tree, and S1B Diagram library behavior until the tree/library split is scheduled. */
import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Boxes, ChevronDown, ChevronRight, FileText, GitBranch, Network, Plus } from 'lucide-react'
import type {
  C4ModelData,
  C4Node,
  Diagram,
  DiagramKind
} from '../../../../shared/scryer/model-types'
import { DIAGRAM_KIND_ORDER, sortDiagramsForLibrary } from '../../../../shared/scryer/diagram-ids'
import { isExpandableKind } from './c4-model'
import {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  readDiagramCache,
  writeDiagramCache
} from './diagram-cache-client'
import { svgToPngDataUrl, type DiagramReviewCacheContext } from './diagram-export-actions'
import type { DiagramRenderAdapter, DiagramRenderTheme } from './diagram-renderer'

type ArchitectureModelTreeProps = {
  model: C4ModelData
  selectedNodeId: string | null
  activeFlowId: string | null
  activeDiagramId?: string | null
  diagramLibraryEnabled?: boolean
  diagramThumbnailContext?: DiagramLibraryThumbnailContext
  docked?: boolean
  onSelectNode: (nodeId: string) => void
  onDrillNode: (nodeId: string) => void
  onOpenFlows?: () => void
  onSelectFlow: (flowId: string) => void
  onSelectDiagram?: (diagramId: string) => void
  onCreateDiagram?: () => void
}

export type DiagramLibraryThumbnailContext = DiagramReviewCacheContext & {
  theme: DiagramRenderTheme
  renderAdapter: DiagramRenderAdapter
}

export type DiagramLibraryItemView = {
  diagram: Diagram
  number: number
  unlinked: boolean
}

export type DiagramLibraryGroupView = {
  kind: DiagramKind
  count: number
  items: DiagramLibraryItemView[]
}

export type DiagramLibraryViewModel = {
  totalCount: number
  showSearch: boolean
  groups: DiagramLibraryGroupView[]
}

export function ArchitectureModelTree({
  model,
  selectedNodeId,
  activeFlowId,
  activeDiagramId = null,
  diagramLibraryEnabled = false,
  diagramThumbnailContext,
  docked = false,
  onSelectNode,
  onDrillNode,
  onOpenFlows,
  onSelectFlow,
  onSelectDiagram,
  onCreateDiagram
}: ArchitectureModelTreeProps): React.JSX.Element {
  const childrenByParent = new Map<string, C4Node[]>()
  for (const node of model.nodes) {
    const key = node.parentId ?? ''
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), node])
  }
  for (const [key, children] of childrenByParent) {
    childrenByParent.set(
      key,
      [...children].sort((left, right) => left.data.name.localeCompare(right.data.name))
    )
  }

  return (
    <aside
      className={
        docked
          ? 'flex w-80 shrink-0 flex-col bg-background text-xs xl:w-96'
          : 'flex w-64 shrink-0 flex-col border-r border-border bg-background text-xs'
      }
      data-testid="architecture-model-tree"
    >
      <div className="scrollbar-sleek grid gap-2 overflow-y-auto p-2">
        <section className="grid gap-1">
          <div className="flex items-center gap-1.5 px-1 py-1 font-medium text-muted-foreground">
            <Network className="size-3.5" />
            Model tree
          </div>
          {(childrenByParent.get('') ?? []).map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              childrenByParent={childrenByParent}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onDrillNode={onDrillNode}
            />
          ))}
          {(childrenByParent.get('') ?? []).length === 0 ? (
            <div className="rounded border border-dashed border-border px-2 py-3 text-center text-muted-foreground">
              No nodes
            </div>
          ) : null}
        </section>

        <section className="grid gap-1 border-t border-border pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-1 py-1 text-left font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onOpenFlows}
            data-testid="architecture-flow-tree-heading"
            title="Open flows view"
          >
            <GitBranch className="size-3.5" />
            Flow tree
          </button>
          {(model.flows ?? []).map((flow) => (
            <button
              key={flow.id}
              type="button"
              className={`flex items-center gap-1 rounded px-2 py-1 text-left hover:bg-accent ${
                flow.id === activeFlowId ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => onSelectFlow(flow.id)}
              data-testid="architecture-flow-tree-node"
            >
              <GitBranch className="size-3" />
              <span className="min-w-0 flex-1 truncate">{flow.name || flow.id}</span>
              <span>{flow.steps.length}</span>
            </button>
          ))}
          {(model.flows ?? []).length === 0 ? (
            <div className="rounded border border-dashed border-border px-2 py-3 text-center text-muted-foreground">
              No flows
            </div>
          ) : null}
        </section>

        {diagramLibraryEnabled ? (
          <DiagramLibrary
            diagrams={model.diagrams ?? []}
            diagramRefs={model.diagramRefs ?? []}
            activeDiagramId={activeDiagramId}
            thumbnailContext={diagramThumbnailContext}
            onSelectDiagram={onSelectDiagram}
            onCreateDiagram={onCreateDiagram}
          />
        ) : null}
      </div>
    </aside>
  )
}

function diagramMatchesSearch(diagram: Diagram, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  const searchable = [
    diagram.name,
    diagram.kind,
    diagram.description ?? '',
    ...(diagram.tags ?? [])
  ].join(' ')
  return searchable.toLowerCase().includes(normalizedQuery)
}

export function buildDiagramLibraryViewModel({
  diagrams,
  diagramRefs,
  searchQuery
}: {
  diagrams: Diagram[]
  diagramRefs: C4ModelData['diagramRefs']
  searchQuery: string
}): DiagramLibraryViewModel {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const refCounts = new Map<string, number>()
  for (const ref of diagramRefs ?? []) {
    refCounts.set(ref.diagramId, (refCounts.get(ref.diagramId) ?? 0) + 1)
  }

  const groups = new Map<DiagramKind, DiagramLibraryItemView[]>()
  for (const diagram of sortDiagramsForLibrary(diagrams)) {
    if (!diagramMatchesSearch(diagram, normalizedQuery)) {
      continue
    }
    const current = groups.get(diagram.kind) ?? []
    groups.set(diagram.kind, [
      ...current,
      {
        diagram,
        number: current.length + 1,
        unlinked: (refCounts.get(diagram.id) ?? 0) === 0
      }
    ])
  }

  return {
    totalCount: diagrams.length,
    showSearch: diagrams.length > 20,
    groups: DIAGRAM_KIND_ORDER.flatMap((kind) => {
      const items = groups.get(kind) ?? []
      return items.length > 0 ? [{ kind, count: items.length, items }] : []
    })
  }
}

export function getNextDiagramLibraryFocusIndex(
  currentIndex: number,
  key: string,
  total: number
): number {
  if (total <= 0) {
    return -1
  }
  if (key === 'ArrowDown') {
    return Math.min(currentIndex + 1, total - 1)
  }
  if (key === 'ArrowUp') {
    return Math.max(currentIndex - 1, 0)
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return total - 1
  }
  return currentIndex
}

function DiagramLibrary({
  diagrams,
  diagramRefs,
  activeDiagramId,
  thumbnailContext,
  onSelectDiagram,
  onCreateDiagram
}: {
  diagrams: Diagram[]
  diagramRefs: C4ModelData['diagramRefs']
  activeDiagramId: string | null
  thumbnailContext?: DiagramLibraryThumbnailContext
  onSelectDiagram?: (diagramId: string) => void
  onCreateDiagram?: () => void
}): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(() => new Set())
  const view = useMemo(
    () => buildDiagramLibraryViewModel({ diagrams, diagramRefs, searchQuery }),
    [diagrams, diagramRefs, searchQuery]
  )

  const toggleKind = (kind: DiagramKind): void => {
    setCollapsedKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }

  return (
    <DiagramLibrarySection
      view={view}
      activeDiagramId={activeDiagramId}
      collapsedKinds={collapsedKinds}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onToggleKind={toggleKind}
      thumbnailContext={thumbnailContext}
      onSelectDiagram={onSelectDiagram}
      onCreateDiagram={onCreateDiagram}
    />
  )
}

export function DiagramLibrarySection({
  view,
  activeDiagramId,
  collapsedKinds,
  searchQuery,
  onSearchQueryChange,
  onToggleKind,
  thumbnailContext,
  onSelectDiagram,
  onCreateDiagram
}: {
  view: DiagramLibraryViewModel
  activeDiagramId: string | null
  collapsedKinds: Set<string>
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onToggleKind: (kind: DiagramKind) => void
  thumbnailContext?: DiagramLibraryThumbnailContext
  onSelectDiagram?: (diagramId: string) => void
  onCreateDiagram?: () => void
}): React.JSX.Element {
  const handleKeyboardNavigation = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return
    }
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-diagram-library-focusable="true"]')
    )
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
    if (currentIndex < 0) {
      return
    }
    const nextIndex = getNextDiagramLibraryFocusIndex(currentIndex, event.key, focusable.length)
    const next = focusable[nextIndex]
    if (!next) {
      return
    }
    event.preventDefault()
    next.focus()
  }

  return (
    <section
      className="grid gap-1 border-t border-border pt-2"
      data-testid="architecture-diagram-library"
      onKeyDown={handleKeyboardNavigation}
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5 px-1 py-1 font-medium text-muted-foreground">
          <FileText className="size-3.5" />
          <span className="min-w-0 flex-1">Diagram library</span>
          {onCreateDiagram ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded p-0.5 hover:bg-accent hover:text-foreground"
              onClick={onCreateDiagram}
              data-testid="architecture-diagram-library-create"
              data-diagram-library-focusable="true"
              title="Create diagram"
              aria-label="Create diagram"
            >
              <Plus className="size-3" />
            </button>
          ) : null}
        </div>
        {view.showSearch ? (
          <input
            className="mx-1 rounded border border-border bg-background px-2 py-1 text-xs"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            placeholder="Search diagrams"
            aria-label="Search diagrams"
            data-testid="architecture-diagram-library-search"
            data-diagram-library-focusable="true"
          />
        ) : null}
        {view.totalCount === 0 ? (
          <div className="grid gap-2 rounded border border-dashed border-border px-2 py-3 text-center text-muted-foreground">
            <span>No diagrams</span>
            {onCreateDiagram ? (
              <button
                type="button"
                className="mx-auto inline-flex h-6 items-center justify-center rounded border border-border px-2 text-xs font-medium hover:bg-accent hover:text-foreground"
                onClick={onCreateDiagram}
                data-testid="architecture-diagram-library-empty-create"
                data-diagram-library-focusable="true"
              >
                Create diagram
              </button>
            ) : null}
          </div>
        ) : view.groups.length === 0 ? (
          <div className="rounded border border-dashed border-border px-2 py-3 text-center text-muted-foreground">
            No matching diagrams
          </div>
        ) : (
          view.groups.map((group) => {
            const collapsed = collapsedKinds.has(group.kind)
            return (
              <div key={group.kind} className="grid gap-0.5">
                <button
                  type="button"
                  className="flex items-center justify-between rounded px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-expanded={!collapsed}
                  onClick={() => onToggleKind(group.kind)}
                  data-testid="architecture-diagram-library-kind"
                  data-diagram-kind={group.kind}
                  data-diagram-library-focusable="true"
                >
                  <span className="inline-flex min-w-0 items-center gap-1">
                    {collapsed ? (
                      <ChevronRight className="size-3 shrink-0" />
                    ) : (
                      <ChevronDown className="size-3 shrink-0" />
                    )}
                    <span>{group.kind}</span>
                  </span>
                  <span>{group.count}</span>
                </button>
                {collapsed
                  ? null
                  : group.items.map((item) => (
                      <button
                        key={item.diagram.id}
                        type="button"
                        className={`flex items-center gap-1 rounded px-2 py-1 text-left hover:bg-accent ${
                          item.diagram.id === activeDiagramId
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground'
                        }`}
                        onClick={() => onSelectDiagram?.(item.diagram.id)}
                        data-testid="architecture-diagram-library-item"
                        data-diagram-id={item.diagram.id}
                        data-diagram-library-focusable="true"
                      >
                        {thumbnailContext ? (
                          <DiagramLibraryThumbnail
                            diagram={item.diagram}
                            context={thumbnailContext}
                          />
                        ) : (
                          <FileText className="size-3" />
                        )}
                        <span className="w-5 shrink-0 tabular-nums">{item.number}.</span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.diagram.name || item.diagram.id}
                        </span>
                        {item.unlinked ? (
                          <span className="rounded bg-muted px-1 text-[10px]">Unlinked</span>
                        ) : null}
                      </button>
                    ))}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function DiagramLibraryThumbnail({
  diagram,
  context
}: {
  diagram: Diagram
  context: DiagramLibraryThumbnailContext
}): React.JSX.Element {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'stale' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const rendererVersion = context.renderAdapter.getRendererVersion?.()
    const sourceHash = computeDiagramSourceHash(diagram.source)
    const detectedKind = context.renderAdapter.detectDiagramKind(diagram.source).kind

    if (!rendererVersion) {
      setState('stale')
      setPngDataUrl(null)
      return
    }

    const cacheKey = computeDiagramCacheKey({
      sourceHash,
      notation: diagram.notation,
      detectedKind,
      theme: context.theme,
      rendererVersion,
      outputProfile: 'thumbnail'
    })

    const loadThumbnail = async (): Promise<void> => {
      setState('loading')
      const cached = await readDiagramCache({
        projectPath: context.projectPath,
        modelName: context.modelName,
        diagramId: diagram.id,
        cacheKey,
        outputProfile: 'thumbnail'
      })
      if (cancelled) {
        return
      }
      if (cached.ok && cached.hit && cached.outputProfile === 'thumbnail') {
        setPngDataUrl(cached.pngDataUrl)
        setState('ready')
        return
      }

      const rendered = await context.renderAdapter.renderDiagram(diagram, {
        theme: context.theme,
        outputProfile: 'thumbnail'
      })
      if (cancelled) {
        return
      }
      if (!rendered.ok || rendered.sourceHash !== sourceHash) {
        setPngDataUrl(null)
        setState('error')
        return
      }
      const png = await svgToPngDataUrl(rendered.svg)
      if (cancelled) {
        return
      }
      const writeResult = await writeDiagramCache({
        projectPath: context.projectPath,
        modelName: context.modelName,
        diagramId: diagram.id,
        cacheKey,
        outputProfile: 'thumbnail',
        pngDataUrl: png
      })
      setPngDataUrl(png)
      setState(writeResult.ok ? 'ready' : 'stale')
    }

    void loadThumbnail().catch(() => {
      if (!cancelled) {
        setPngDataUrl(null)
        setState('error')
      }
    })

    return () => {
      cancelled = true
    }
  }, [context, diagram])

  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted"
      data-testid="diagram-library-thumbnail"
      data-thumbnail-state={state}
      title={state === 'ready' ? 'Thumbnail' : 'Thumbnail loading'}
    >
      {pngDataUrl ? (
        <img className="size-full object-cover" alt="" src={pngDataUrl} />
      ) : (
        <FileText className="size-3" />
      )}
    </span>
  )
}

function TreeNode({
  node,
  depth,
  childrenByParent,
  selectedNodeId,
  onSelectNode,
  onDrillNode
}: {
  node: C4Node
  depth: number
  childrenByParent: Map<string, C4Node[]>
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onDrillNode: (nodeId: string) => void
}): React.JSX.Element {
  const children = childrenByParent.get(node.id) ?? []
  return (
    <div className="grid gap-0.5">
      <div
        className={`flex items-center gap-1 rounded py-1 pr-2 text-left hover:bg-accent ${
          node.id === selectedNodeId ? 'bg-accent text-foreground' : 'text-muted-foreground'
        }`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onSelectNode(node.id)}
        data-testid="architecture-tree-node"
        data-node-id={node.id}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => onSelectNode(node.id)}
        >
          {children.length > 0 ? (
            <ChevronRight className="size-3 shrink-0" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{node.data.name}</span>
          <span className="rounded bg-muted px-1 text-[10px]">{node.data.kind}</span>
        </button>
        {(node.data.contract?.expect.length ?? 0) > 0 ? <Boxes className="size-3" /> : null}
        {isExpandableKind(node.data.kind) ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            title="Drill into node"
            onClick={(event) => {
              event.stopPropagation()
              onDrillNode(node.id)
            }}
            data-testid="architecture-tree-drill-node"
          >
            <ChevronRight className="size-3" />
          </button>
        ) : null}
      </div>
      {children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          childrenByParent={childrenByParent}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onDrillNode={onDrillNode}
        />
      ))}
    </div>
  )
}
