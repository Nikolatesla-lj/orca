/* eslint-disable max-lines -- Why: S4 keeps review rendering, ref navigation, and element binding together until the diagram surface is split into narrower components. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type {
  Diagram,
  DiagramDiagnostic,
  DiagramKind,
  DiagramRef,
  DiagramRefRole,
  DiagramRefTarget,
  DiagramRenderedElement,
  DiagramRenderResult
} from '../../../../shared/scryer/model-types'
import type {
  CreateDiagramRefInput,
  DiagramDraftStateSnapshot,
  DiagramExternalReloadConflict,
  DiagramExternalReloadResolution
} from './diagram-controller'
import { DIAGRAM_REF_ROLES, type CreatedDiagramLinkState } from './DiagramReferenceControls'
import {
  computeDiagramCacheKey,
  computeDiagramSourceHash,
  readDiagramCache,
  writeDiagramCache
} from './diagram-cache-client'
import type { DiagramReviewCacheContext } from './diagram-export-actions'
import type { DiagramRenderAdapter, DiagramRenderTheme } from './diagram-renderer'

const reviewButtonClass =
  'inline-flex h-6 items-center justify-center rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'
const ghostReviewButtonClass =
  'inline-flex h-6 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'

type SuccessfulDiagramRenderResult = Extract<DiagramRenderResult, { ok: true }>

export type DiagramReviewViewBaseProps = {
  diagram: Diagram
  renderAdapter: DiagramRenderAdapter
  theme: DiagramRenderTheme
  editingLocked: boolean
  cacheContext?: DiagramReviewCacheContext
  exportActions?: DiagramReviewViewExportActions
  onDraftStateChange: (snapshot: DiagramDraftStateSnapshot) => void
  externalReloadConflict?: DiagramExternalReloadConflict | null
  onResolveExternalReloadConflict: (
    resolution: DiagramExternalReloadResolution
  ) => void | Promise<void>
  onSaveSource: (diagramId: string, source: string) => Promise<void>
  onRenameDiagram: (diagramId: string, name: string) => Promise<void>
  onDeleteDiagram: (diagramId: string) => Promise<void>
  refActions?: DiagramReviewViewRefActions
}

export type DiagramReviewViewRefActions = {
  refs: DiagramRef[]
  onCreateRef?: (input: CreateDiagramRefInput) => Promise<void>
  onUpsertRefs: (refs: DiagramRef[]) => Promise<void>
  onDeleteRefs: (refIds: string[]) => Promise<void>
  onNavigateRefTarget: (target: DiagramRefTarget) => void | Promise<void>
  isTargetNavigable?: (target: DiagramRefTarget) => boolean
  getTargetLabel?: (target: DiagramRefTarget) => string
  createdDiagramLink?: CreatedDiagramLinkState | null
  onLinkCreatedDiagramNow?: () => Promise<void>
  onCancelCreatedDiagramLink?: () => void
}

export type DiagramElementNavigationCandidate = {
  refIds: string[]
  target: DiagramRefTarget
  roles: DiagramRefRole[]
  label: string
  notes: string[]
}

export type DiagramElementNavigationResolution =
  | { action: 'none' }
  | { action: 'navigate'; candidate: DiagramElementNavigationCandidate }
  | { action: 'choose-target'; candidates: DiagramElementNavigationCandidate[] }

export type DiagramElementTargetPickerProps = {
  candidates: DiagramElementNavigationCandidate[]
  onChoose: (candidate: DiagramElementNavigationCandidate) => void | Promise<void>
  onCancel: () => void
}

export type DiagramReviewExportPayload = {
  diagramId: string
  svg: string
  sourceHash: `sha256:${string}`
  rendererVersion: string
  detectedKind: DiagramKind
  theme: DiagramRenderTheme
}

export type DiagramReviewViewExportActions = {
  onCopySvg: (payload: DiagramReviewExportPayload) => Promise<void>
  onExportPng: (payload: DiagramReviewExportPayload) => Promise<void>
}

export type DiagramReviewViewProps = DiagramReviewViewBaseProps

const targetTypeOrder: DiagramRefTarget['type'][] = [
  'node',
  'edge',
  'group',
  'flow',
  'flowStep',
  'source'
]

export function resolveDiagramElementNavigation(args: {
  diagramId: string
  elementKey: string
  refs: DiagramRef[]
  isTargetNavigable: (target: DiagramRefTarget) => boolean
  getTargetLabel: (target: DiagramRefTarget) => string
}): DiagramElementNavigationResolution {
  const candidatesByTarget = new Map<string, DiagramElementNavigationCandidate>()

  for (const ref of args.refs) {
    if (
      ref.diagramId !== args.diagramId ||
      ref.elementKey !== args.elementKey ||
      !args.isTargetNavigable(ref.target)
    ) {
      continue
    }
    const targetKey = diagramRefTargetKey(ref.target)
    const existing = candidatesByTarget.get(targetKey)
    if (existing) {
      existing.refIds.push(ref.id)
      if (!existing.roles.includes(ref.role)) {
        existing.roles.push(ref.role)
      }
      if (ref.note?.trim()) {
        existing.notes.push(ref.note.trim())
      }
      continue
    }
    candidatesByTarget.set(targetKey, {
      refIds: [ref.id],
      target: ref.target,
      roles: [ref.role],
      label: args.getTargetLabel(ref.target),
      notes: ref.note?.trim() ? [ref.note.trim()] : []
    })
  }

  const candidates = [...candidatesByTarget.values()].sort(compareElementNavigationCandidates)
  if (candidates.length === 0) {
    return { action: 'none' }
  }
  if (candidates.length === 1) {
    return { action: 'navigate', candidate: candidates[0]! }
  }
  return { action: 'choose-target', candidates }
}

export function DiagramElementTargetPicker({
  candidates,
  onChoose,
  onCancel
}: DiagramElementTargetPickerProps): React.JSX.Element {
  return (
    <section
      className="grid gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs"
      data-testid="diagram-element-target-picker"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground">Choose target</span>
        <button
          type="button"
          className={ghostReviewButtonClass}
          onClick={onCancel}
          data-testid="diagram-element-target-cancel"
        >
          Cancel
        </button>
      </div>
      <div className="grid gap-1">
        {candidates.map((candidate) => (
          <button
            key={candidate.refIds.join(':')}
            type="button"
            className="grid gap-1 rounded border border-border bg-background px-2 py-1 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => void onChoose(candidate)}
            data-testid="diagram-element-target-option"
          >
            <span className="font-medium">{candidate.label}</span>
            <span className="text-muted-foreground">
              {formatDiagramRefTarget(candidate.target)}
            </span>
            <span className="text-muted-foreground">{candidate.roles.join(', ')}</span>
            {candidate.notes.length > 0 ? (
              <span className="text-muted-foreground">{candidate.notes.join(' | ')}</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  )
}

export function DiagramReviewView({
  diagram,
  renderAdapter,
  theme,
  editingLocked,
  cacheContext,
  exportActions,
  onDraftStateChange,
  externalReloadConflict,
  onResolveExternalReloadConflict,
  onSaveSource,
  onRenameDiagram,
  onDeleteDiagram,
  refActions
}: DiagramReviewViewProps): React.JSX.Element {
  const [draftSource, setDraftSource] = useState(diagram.source)
  const [draftName, setDraftName] = useState(diagram.name)
  const [error, setError] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [renderPending, setRenderPending] = useState(false)
  const [renderResult, setRenderResult] = useState<DiagramRenderResult | null>(null)
  const [lastSuccessfulRender, setLastSuccessfulRender] =
    useState<SuccessfulDiagramRenderResult | null>(null)
  const [targetPickerCandidates, setTargetPickerCandidates] = useState<
    DiagramElementNavigationCandidate[] | null
  >(null)
  const [bindingMode, setBindingMode] = useState<'idle' | 'selecting' | 'selected'>('idle')
  const [selectedElement, setSelectedElement] = useState<DiagramRenderedElement | null>(null)
  const [bindTargetType, setBindTargetType] = useState<DiagramRefTarget['type']>('node')
  const [bindTargetId, setBindTargetId] = useState('')
  const [bindFlowStepId, setBindFlowStepId] = useState('')
  const [bindLine, setBindLine] = useState('')
  const [bindEndLine, setBindEndLine] = useState('')
  const [bindRole, setBindRole] = useState<DiagramRefRole | ''>('')
  const [bindNote, setBindNote] = useState('')
  const renderRequestIdRef = useRef(0)
  const dirty = draftSource !== diagram.source
  const nameDirty = draftName.trim() !== diagram.name
  const persistedSourceHash = useMemo(
    () => computeDiagramSourceHash(diagram.source),
    [diagram.source]
  )
  const persistedDetectedKind = useMemo(
    () => renderAdapter.detectDiagramKind(diagram.source).kind,
    [diagram.source, renderAdapter]
  )

  useEffect(() => {
    setDraftSource(diagram.source)
    setDraftName(diagram.name)
    setError(null)
    resetElementBinding()
    setTargetPickerCandidates(null)
  }, [diagram.id, diagram.name, diagram.source])

  useEffect(() => {
    setCompareOpen(false)
  }, [externalReloadConflict?.diagramId, externalReloadConflict?.diskRevision])

  useEffect(() => {
    onDraftStateChange({
      diagramId: diagram.id,
      persistedSource: diagram.source,
      draftSource,
      dirty
    })
  }, [diagram.id, diagram.source, dirty, draftSource, onDraftStateChange])

  useEffect(() => {
    const requestId = renderRequestIdRef.current + 1
    renderRequestIdRef.current = requestId
    let cancelled = false
    setRenderPending(true)

    const commitRenderResult = (result: DiagramRenderResult): void => {
      if (cancelled || renderRequestIdRef.current !== requestId) {
        return
      }
      setRenderResult(result)
      if (result.ok) {
        setLastSuccessfulRender(result)
      }
    }

    const renderCurrentDraft = async (): Promise<void> => {
      const rendererVersion = renderAdapter.getRendererVersion?.()
      const cacheKey =
        cacheContext && !dirty && rendererVersion
          ? computeDiagramCacheKey({
              sourceHash: persistedSourceHash,
              notation: diagram.notation,
              detectedKind: persistedDetectedKind,
              theme,
              rendererVersion,
              outputProfile: 'review'
            })
          : null

      if (cacheContext && cacheKey && rendererVersion) {
        const cached = await readDiagramCache({
          projectPath: cacheContext.projectPath,
          modelName: cacheContext.modelName,
          diagramId: diagram.id,
          cacheKey,
          outputProfile: 'review'
        })
        if (cancelled || renderRequestIdRef.current !== requestId) {
          return
        }
        if (cached.ok && cached.hit && cached.outputProfile === 'review') {
          commitRenderResult({
            ok: true,
            svg: cached.svg,
            elements: renderAdapter.extractRenderedElements(
              diagram.source,
              cached.svg,
              persistedDetectedKind
            ),
            diagnostics: [],
            sourceHash: persistedSourceHash,
            rendererVersion
          })
          return
        }
      }

      const result = await renderAdapter.renderDiagram(
        {
          ...diagram,
          source: draftSource
        },
        {
          theme,
          outputProfile: 'review'
        }
      )
      commitRenderResult(result)
      if (
        result.ok &&
        cacheContext &&
        cacheKey &&
        result.sourceHash === persistedSourceHash &&
        !cancelled &&
        renderRequestIdRef.current === requestId
      ) {
        const writeResult = await writeDiagramCache({
          projectPath: cacheContext.projectPath,
          modelName: cacheContext.modelName,
          diagramId: diagram.id,
          cacheKey,
          outputProfile: 'review',
          svg: result.svg
        })
        if (!writeResult.ok && !cancelled && renderRequestIdRef.current === requestId) {
          setError(`${writeResult.code}: ${writeResult.message}`)
        }
      }
    }

    void renderCurrentDraft()
      .catch((renderError: unknown) => {
        if (cancelled || renderRequestIdRef.current !== requestId) {
          return
        }
        setRenderResult({
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'renderer.queue-failed',
              message: renderError instanceof Error ? renderError.message : String(renderError)
            }
          ],
          sourceHash: `sha256:${'0'.repeat(64)}`,
          rendererVersion: 'mermaid@unknown|adapter@unknown|dompurify@unknown'
        })
      })
      .finally(() => {
        if (!cancelled && renderRequestIdRef.current === requestId) {
          setRenderPending(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    cacheContext,
    diagram,
    dirty,
    draftSource,
    persistedDetectedKind,
    persistedSourceHash,
    renderAdapter,
    theme
  ])

  const saveSource = async (): Promise<void> => {
    setError(null)
    try {
      if (nameDirty) {
        await onRenameDiagram(diagram.id, draftName)
      }
      await onSaveSource(diagram.id, draftSource)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const deleteDiagram = async (): Promise<void> => {
    setError(null)
    try {
      await onDeleteDiagram(diagram.id)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  const currentFailed = renderResult && !renderResult.ok
  const staleRender =
    currentFailed &&
    lastSuccessfulRender &&
    lastSuccessfulRender.sourceHash !== renderResult.sourceHash
      ? lastSuccessfulRender
      : null
  const visibleRender = renderResult?.ok ? renderResult : staleRender
  const canExport =
    !!exportActions &&
    !!renderResult?.ok &&
    !dirty &&
    !nameDirty &&
    !editingLocked &&
    !externalReloadConflict &&
    !renderPending &&
    renderResult.sourceHash === persistedSourceHash
  const diagnostics = renderResult?.diagnostics ?? []
  const bindableElements = useMemo(() => {
    const elements = new Map<string, DiagramRenderedElement>()
    for (const element of visibleRender?.elements ?? []) {
      elements.set(element.elementKey, element)
    }
    return elements
  }, [visibleRender])

  useEffect(() => {
    if (bindingMode === 'idle') {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        resetElementBinding()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bindingMode])

  const handleRenderedSvgClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target
    if (!(target instanceof Element) || !refActions) {
      return
    }
    const boundElement = target.closest('[data-diagram-element-key]')
    const elementKey = boundElement?.getAttribute('data-diagram-element-key') ?? null
    if (!elementKey) {
      return
    }
    if (bindingMode !== 'idle') {
      event.preventDefault()
      event.stopPropagation()
      const bindableElement = bindableElements.get(elementKey)
      if (bindableElement) {
        setSelectedElement(bindableElement)
        setBindingMode('selected')
      }
      return
    }

    const resolution = resolveDiagramElementNavigation({
      diagramId: diagram.id,
      elementKey,
      refs: refActions.refs,
      isTargetNavigable: refActions.isTargetNavigable ?? (() => true),
      getTargetLabel: refActions.getTargetLabel ?? formatDiagramRefTarget
    })
    if (resolution.action === 'none') {
      return
    }
    if (resolution.action === 'navigate') {
      void refActions.onNavigateRefTarget(resolution.candidate.target)
      return
    }
    setTargetPickerCandidates(resolution.candidates)
  }

  const chooseElementTarget = async (
    candidate: DiagramElementNavigationCandidate
  ): Promise<void> => {
    setTargetPickerCandidates(null)
    await refActions?.onNavigateRefTarget(candidate.target)
  }

  const saveElementBinding = async (): Promise<void> => {
    if (!refActions?.onCreateRef || !selectedElement || !bindRole) {
      return
    }
    const target = createBindTarget({
      type: bindTargetType,
      id: bindTargetId,
      flowStepId: bindFlowStepId,
      line: bindLine,
      endLine: bindEndLine
    })
    setError(null)
    try {
      await refActions.onCreateRef({
        diagramId: diagram.id,
        target,
        role: bindRole,
        elementKey: selectedElement.elementKey,
        sourceRange: selectedElement.sourceRange,
        note: bindNote
      })
      resetElementBinding()
    } catch (bindError) {
      const code =
        bindError && typeof bindError === 'object' && 'code' in bindError
          ? String((bindError as { code: unknown }).code)
          : null
      const message = bindError instanceof Error ? bindError.message : String(bindError)
      setError(code ? `${code}: ${message}` : message)
    }
  }

  const copySvg = async (): Promise<void> => {
    const payload = buildExportPayload()
    if (!payload || !exportActions || !canExport) {
      return
    }
    setError(null)
    try {
      await exportActions.onCopySvg(payload)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError))
    }
  }

  const exportPng = async (): Promise<void> => {
    const payload = buildExportPayload()
    if (!payload || !exportActions || !canExport) {
      return
    }
    setError(null)
    try {
      await exportActions.onExportPng(payload)
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : String(exportError)
      setError(
        message.includes('controller.export-failed')
          ? message
          : `controller.export-failed: ${message}`
      )
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]"
      data-testid="diagram-review-view"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <input
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm font-medium"
          value={draftName}
          onChange={(event) => setDraftName(event.currentTarget.value)}
          disabled={editingLocked}
          aria-label="Diagram name"
        />
        <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {diagram.kind}
        </span>
        <button
          type="button"
          className={reviewButtonClass}
          disabled={editingLocked || (!dirty && !nameDirty)}
          onClick={() => void saveSource()}
        >
          Save
        </button>
        <button
          type="button"
          className={ghostReviewButtonClass}
          disabled={editingLocked}
          onClick={() => void deleteDiagram()}
        >
          Delete
        </button>
      </div>
      {error ? (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</div>
      ) : null}
      {externalReloadConflict ? (
        <DiagramReviewExternalReloadConflictBanner
          conflict={externalReloadConflict}
          draftSource={draftSource}
          compareOpen={compareOpen}
          onCompareOpenChange={setCompareOpen}
          onResolve={onResolveExternalReloadConflict}
        />
      ) : null}
      {refActions ? (
        <DiagramReverseReferenceList
          diagram={diagram}
          editingLocked={editingLocked}
          actions={refActions}
        />
      ) : null}
      {refActions ? (
        <DiagramElementBindingControls
          bindingMode={bindingMode}
          selectedElement={selectedElement}
          bindTargetType={bindTargetType}
          bindTargetId={bindTargetId}
          bindFlowStepId={bindFlowStepId}
          bindLine={bindLine}
          bindEndLine={bindEndLine}
          bindRole={bindRole}
          bindNote={bindNote}
          canSave={
            !!refActions.onCreateRef && !!selectedElement && !!bindRole && !!bindTargetId.trim()
          }
          editingLocked={editingLocked}
          onStart={() => {
            setBindingMode('selecting')
            setSelectedElement(null)
          }}
          onCancel={resetElementBinding}
          onTargetTypeChange={setBindTargetType}
          onTargetIdChange={setBindTargetId}
          onFlowStepIdChange={setBindFlowStepId}
          onLineChange={setBindLine}
          onEndLineChange={setBindEndLine}
          onRoleChange={setBindRole}
          onNoteChange={setBindNote}
          onSave={() => void saveElementBinding()}
        />
      ) : null}
      {targetPickerCandidates ? (
        <DiagramElementTargetPicker
          candidates={targetPickerCandidates}
          onChoose={chooseElementTarget}
          onCancel={() => setTargetPickerCandidates(null)}
        />
      ) : null}
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <label className="flex min-h-0 flex-col border-r border-border">
          <span className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            Source
          </span>
          <textarea
            className="min-h-0 flex-1 resize-none border-0 bg-background p-3 font-mono text-xs leading-5 outline-none"
            value={draftSource}
            onChange={(event) => setDraftSource(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void saveSource()
              }
            }}
            disabled={editingLocked}
            spellCheck={false}
            aria-label="Diagram source"
          />
        </label>
        <div
          className="flex min-h-0 flex-col bg-background"
          data-testid="diagram-review-render-pane"
        >
          <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Render</span>
            <span
              className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              data-testid="diagram-render-status"
            >
              {renderPending ? 'Rendering' : currentFailed ? 'Invalid source' : 'Rendered'}
            </span>
            {staleRender ? (
              <span
                className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                data-testid="diagram-render-stale-badge"
              >
                Stale render
              </span>
            ) : null}
            {exportActions ? (
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className={reviewButtonClass}
                  disabled={!canExport}
                  onClick={() => void copySvg()}
                  data-testid="diagram-copy-svg"
                >
                  Copy SVG
                </button>
                <button
                  type="button"
                  className={reviewButtonClass}
                  disabled={!canExport}
                  onClick={() => void exportPng()}
                  data-testid="diagram-export-png"
                >
                  Export PNG
                </button>
              </div>
            ) : null}
          </div>
          {diagnostics.length > 0 ? (
            <div className="grid gap-1 border-b border-border bg-muted/30 px-3 py-2 text-xs">
              {diagnostics.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.code}:${index}`}
                  className={
                    diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  }
                  data-testid="diagram-render-diagnostic"
                >
                  <span className="font-medium">{diagnostic.code}</span>
                  {': '}
                  <span>{diagnostic.message}</span>
                  {formatDiagnosticLocation(diagnostic)}
                </div>
              ))}
            </div>
          ) : null}
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-3">
            {visibleRender ? (
              <div
                className={staleRender ? 'opacity-70 grayscale-[0.2]' : undefined}
                data-testid="diagram-render-svg"
                data-source-hash={visibleRender.sourceHash}
                data-renderer-version={visibleRender.rendererVersion}
                onClick={handleRenderedSvgClick}
                dangerouslySetInnerHTML={{ __html: visibleRender.svg }}
              />
            ) : (
              <div className="flex min-h-full items-center justify-center text-xs text-muted-foreground">
                No render available
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )

  function resetElementBinding(): void {
    setBindingMode('idle')
    setSelectedElement(null)
    setBindTargetType('node')
    setBindTargetId('')
    setBindFlowStepId('')
    setBindLine('')
    setBindEndLine('')
    setBindRole('')
    setBindNote('')
  }

  function buildExportPayload(): DiagramReviewExportPayload | null {
    if (!renderResult?.ok || renderResult.sourceHash !== persistedSourceHash) {
      return null
    }
    return {
      diagramId: diagram.id,
      svg: renderResult.svg,
      sourceHash: renderResult.sourceHash,
      rendererVersion: renderResult.rendererVersion,
      detectedKind: persistedDetectedKind,
      theme
    }
  }
}

function DiagramElementBindingControls({
  bindingMode,
  selectedElement,
  bindTargetType,
  bindTargetId,
  bindFlowStepId,
  bindLine,
  bindEndLine,
  bindRole,
  bindNote,
  canSave,
  editingLocked,
  onStart,
  onCancel,
  onTargetTypeChange,
  onTargetIdChange,
  onFlowStepIdChange,
  onLineChange,
  onEndLineChange,
  onRoleChange,
  onNoteChange,
  onSave
}: {
  bindingMode: 'idle' | 'selecting' | 'selected'
  selectedElement: DiagramRenderedElement | null
  bindTargetType: DiagramRefTarget['type']
  bindTargetId: string
  bindFlowStepId: string
  bindLine: string
  bindEndLine: string
  bindRole: DiagramRefRole | ''
  bindNote: string
  canSave: boolean
  editingLocked: boolean
  onStart: () => void
  onCancel: () => void
  onTargetTypeChange: (type: DiagramRefTarget['type']) => void
  onTargetIdChange: (id: string) => void
  onFlowStepIdChange: (id: string) => void
  onLineChange: (line: string) => void
  onEndLineChange: (line: string) => void
  onRoleChange: (role: DiagramRefRole | '') => void
  onNoteChange: (note: string) => void
  onSave: () => void
}): React.JSX.Element {
  return (
    <section className="grid gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={reviewButtonClass}
          disabled={editingLocked || bindingMode !== 'idle'}
          onClick={onStart}
          data-testid="diagram-bind-element"
        >
          Bind element
        </button>
        {bindingMode !== 'idle' ? (
          <button
            type="button"
            className={ghostReviewButtonClass}
            onClick={onCancel}
            data-testid="diagram-bind-cancel"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {bindingMode === 'selecting' ? (
        <div className="rounded border border-dashed border-border px-2 py-2 text-muted-foreground">
          Select a bindable SVG element.
        </div>
      ) : null}
      {bindingMode === 'selected' && selectedElement ? (
        <div className="grid gap-2 rounded border border-border bg-background p-2">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>Selected element</span>
            <span className="rounded bg-muted px-1 font-mono text-[10px]">
              {selectedElement.elementKey}
            </span>
            {selectedElement.label ? <span>{selectedElement.label}</span> : null}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={bindTargetType}
              onChange={(event) =>
                onTargetTypeChange(event.currentTarget.value as DiagramRefTarget['type'])
              }
              data-testid="diagram-bind-target-type"
              aria-label="Bind target type"
            >
              {targetTypeOrder.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={bindTargetId}
              onChange={(event) => onTargetIdChange(event.currentTarget.value)}
              data-testid="diagram-bind-target-id"
              aria-label={bindTargetType === 'source' ? 'Source pattern' : 'Target id'}
              placeholder={bindTargetType === 'source' ? 'src/file.ts' : 'target id'}
            />
            {bindTargetType === 'flowStep' ? (
              <input
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                value={bindFlowStepId}
                onChange={(event) => onFlowStepIdChange(event.currentTarget.value)}
                data-testid="diagram-bind-flow-step-id"
                aria-label="Flow step id"
                placeholder="step id"
              />
            ) : null}
            {bindTargetType === 'source' ? (
              <>
                <input
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                  value={bindLine}
                  onChange={(event) => onLineChange(event.currentTarget.value)}
                  data-testid="diagram-bind-source-line"
                  aria-label="Source line"
                  placeholder="line"
                />
                <input
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                  value={bindEndLine}
                  onChange={(event) => onEndLineChange(event.currentTarget.value)}
                  data-testid="diagram-bind-source-end-line"
                  aria-label="Source end line"
                  placeholder="end line"
                />
              </>
            ) : null}
            <select
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={bindRole}
              onChange={(event) => onRoleChange(event.currentTarget.value as DiagramRefRole | '')}
              data-testid="diagram-bind-role"
              aria-label="Bind diagram ref role"
            >
              <option value="">Select role</option>
              {DIAGRAM_REF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={bindNote}
              onChange={(event) => onNoteChange(event.currentTarget.value)}
              data-testid="diagram-bind-note"
              aria-label="Bind note"
              placeholder="note"
            />
          </div>
          {selectedElement.sourceRange ? (
            <div className="text-muted-foreground">
              Diagram source line {selectedElement.sourceRange.startLine}
            </div>
          ) : (
            <div className="text-muted-foreground">Diagram source location unavailable.</div>
          )}
          <button
            type="button"
            className={reviewButtonClass}
            disabled={!canSave}
            onClick={onSave}
            data-testid="diagram-bind-save"
          >
            Save binding
          </button>
        </div>
      ) : null}
    </section>
  )
}

function DiagramReverseReferenceList({
  diagram,
  editingLocked,
  actions
}: {
  diagram: Diagram
  editingLocked: boolean
  actions: DiagramReviewViewRefActions
}): React.JSX.Element {
  const refs = actions.refs.filter((ref) => ref.diagramId === diagram.id)
  const createdLink =
    actions.createdDiagramLink?.diagramId === diagram.id ? actions.createdDiagramLink : null
  return (
    <section
      className="grid gap-2 border-b border-border bg-muted/20 px-3 py-2 text-xs"
      data-testid="diagram-reverse-ref-list"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground">References</span>
        <span className="text-muted-foreground">{refs.length}</span>
      </div>
      {refs.length === 0 ? (
        <div className="rounded border border-dashed border-border px-2 py-2 text-muted-foreground">
          This diagram is not linked yet.
        </div>
      ) : (
        <div className="grid gap-1">
          {refs.map((ref) => (
            <div
              key={ref.id}
              className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1"
              data-testid="diagram-reverse-ref-row"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:text-foreground"
                onClick={() => void actions.onNavigateRefTarget(ref.target)}
              >
                <span className="font-mono">{formatDiagramRefTarget(ref.target)}</span>
              </button>
              <span className="rounded bg-muted px-1 text-[10px]">{ref.role}</span>
              {ref.elementKey ? (
                <span className="rounded bg-muted px-1 font-mono text-[10px]">
                  {ref.elementKey}
                </span>
              ) : null}
              <button
                type="button"
                className={ghostReviewButtonClass}
                disabled={editingLocked}
                onClick={() => void actions.onDeleteRefs([ref.id])}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {createdLink?.status === 'unlinked' ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          data-testid="diagram-created-unlinked-banner"
        >
          <span className="min-w-0 flex-1">Diagram created, not linked yet.</span>
          {createdLink.targetUnavailable ? <span>Target unavailable.</span> : null}
          {actions.onLinkCreatedDiagramNow ? (
            <button
              type="button"
              className={reviewButtonClass}
              onClick={() => void actions.onLinkCreatedDiagramNow?.()}
            >
              Link now
            </button>
          ) : null}
          {actions.onCancelCreatedDiagramLink ? (
            <button
              type="button"
              className={ghostReviewButtonClass}
              onClick={() => actions.onCancelCreatedDiagramLink?.()}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function formatDiagramRefTarget(target: DiagramRefTarget): string {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return `${target.type}:${target.id}`
    case 'flowStep':
      return `flowStep:${target.flowId}/${target.stepId}`
    case 'source':
      return `${target.pattern}${target.line ? `:${target.line}` : ''}${target.endLine ? `-${target.endLine}` : ''}`
  }
}

function diagramRefTargetKey(target: DiagramRefTarget): string {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return `${target.type}:${target.id}`
    case 'flowStep':
      return `flowStep:${target.flowId}:${target.stepId}`
    case 'source':
      return `source:${target.pattern}:${target.line ?? ''}:${target.endLine ?? ''}`
  }
}

function compareElementNavigationCandidates(
  left: DiagramElementNavigationCandidate,
  right: DiagramElementNavigationCandidate
): number {
  return (
    targetTypeOrder.indexOf(left.target.type) - targetTypeOrder.indexOf(right.target.type) ||
    left.label.localeCompare(right.label) ||
    targetSortValue(left.target).localeCompare(targetSortValue(right.target)) ||
    (left.roles[0] ?? '').localeCompare(right.roles[0] ?? '') ||
    (left.refIds[0] ?? '').localeCompare(right.refIds[0] ?? '')
  )
}

function targetSortValue(target: DiagramRefTarget): string {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return target.id
    case 'flowStep':
      return `${target.flowId}:${target.stepId}`
    case 'source':
      return target.pattern
  }
}

function createBindTarget(args: {
  type: DiagramRefTarget['type']
  id: string
  flowStepId: string
  line: string
  endLine: string
}): DiagramRefTarget {
  const id = args.id.trim()
  switch (args.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return { type: args.type, id }
    case 'flowStep':
      return { type: 'flowStep', flowId: id, stepId: args.flowStepId.trim() }
    case 'source': {
      const line = parseOptionalPositiveInteger(args.line)
      const endLine = parseOptionalPositiveInteger(args.endLine)
      return {
        type: 'source',
        pattern: id,
        ...(line === undefined ? {} : { line }),
        ...(endLine === undefined ? {} : { endLine })
      }
    }
  }
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function DiagramReviewExternalReloadConflictBanner({
  conflict,
  draftSource,
  compareOpen,
  onCompareOpenChange,
  onResolve
}: {
  conflict: DiagramExternalReloadConflict
  draftSource: string
  compareOpen: boolean
  onCompareOpenChange: (open: boolean) => void
  onResolve: (resolution: DiagramExternalReloadResolution) => void | Promise<void>
}): React.JSX.Element {
  return (
    <div className="grid gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
      <div>Diagram source changed on disk for model {conflict.modelName}.</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={reviewButtonClass}
          onClick={() => void onResolve('keep-draft')}
        >
          Keep draft
        </button>
        {conflict.diskState === 'modified' ? (
          <>
            <button
              type="button"
              className={reviewButtonClass}
              onClick={() => void onResolve('reload-from-disk')}
            >
              Reload from disk
            </button>
            <button
              type="button"
              className={reviewButtonClass}
              onClick={() => {
                void onResolve('compare-changes')
                onCompareOpenChange(true)
              }}
            >
              Compare changes
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={reviewButtonClass}
              onClick={() => void onResolve('discard-deleted')}
            >
              Discard deleted
            </button>
            <button
              type="button"
              className={reviewButtonClass}
              onClick={() => void onResolve('cancel')}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {compareOpen && conflict.diskState === 'modified' && conflict.diskSource !== undefined ? (
        <div
          className="grid gap-2 rounded border border-border bg-background p-2"
          data-testid="diagram-external-reload-compare"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Compare changes</span>
            <button
              type="button"
              className={ghostReviewButtonClass}
              onClick={() => onCompareOpenChange(false)}
            >
              Close compare
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-muted-foreground">Draft</span>
              <textarea
                className="h-32 resize-none rounded border border-border bg-muted/30 p-2 font-mono text-[11px]"
                value={draftSource}
                readOnly
                aria-label="Draft source comparison"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Disk</span>
              <textarea
                className="h-32 resize-none rounded border border-border bg-muted/30 p-2 font-mono text-[11px]"
                value={conflict.diskSource}
                readOnly
                aria-label="Disk source comparison"
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function formatDiagnosticLocation(diagnostic: DiagramDiagnostic): string {
  if (diagnostic.line === undefined && diagnostic.column === undefined) {
    return ''
  }
  const parts = [
    diagnostic.line === undefined ? null : `line ${diagnostic.line}`,
    diagnostic.column === undefined ? null : `column ${diagnostic.column}`
  ].filter((part): part is string => part !== null)
  return ` (${parts.join(', ')})`
}
