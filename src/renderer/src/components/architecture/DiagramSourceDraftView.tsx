import { useEffect, useState } from 'react'
import type React from 'react'
import type { Diagram } from '../../../../shared/scryer/model-types'
import type {
  DiagramDraftStateSnapshot,
  DiagramExternalReloadConflict,
  DiagramExternalReloadResolution
} from './diagram-controller'

const draftButtonClass =
  'inline-flex h-6 items-center justify-center rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'
const ghostDraftButtonClass =
  'inline-flex h-6 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'

export type DiagramSourceDraftViewProps = {
  diagram: Diagram
  editingLocked: boolean
  onDraftStateChange: (snapshot: DiagramDraftStateSnapshot) => void
  externalReloadConflict?: DiagramExternalReloadConflict | null
  onResolveExternalReloadConflict: (
    resolution: DiagramExternalReloadResolution
  ) => void | Promise<void>
  onSaveSource: (diagramId: string, source: string) => Promise<void>
  onRenameDiagram: (diagramId: string, name: string) => Promise<void>
  onDeleteDiagram: (diagramId: string) => Promise<void>
}

export function DiagramDraftSwitchDialogView({
  error,
  onResolve
}: {
  error?: string | null
  onResolve: (action: 'save' | 'discard' | 'cancel') => void
}): React.JSX.Element {
  return (
    <div
      className="pointer-events-auto grid w-[360px] gap-3 rounded border border-border bg-background p-4 shadow-lg"
      data-testid="diagram-draft-switch-dialog"
    >
      <div className="grid gap-1">
        <div className="text-sm font-semibold">Unsaved diagram source</div>
        <div className="text-xs text-muted-foreground">
          Save the current diagram source before switching?
        </div>
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={draftButtonClass} onClick={() => onResolve('save')}>
          Save and switch
        </button>
        <button type="button" className={draftButtonClass} onClick={() => onResolve('discard')}>
          Discard and switch
        </button>
        <button type="button" className={ghostDraftButtonClass} onClick={() => onResolve('cancel')}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function DiagramSourceDraftView({
  diagram,
  editingLocked,
  onDraftStateChange,
  externalReloadConflict,
  onResolveExternalReloadConflict,
  onSaveSource,
  onRenameDiagram,
  onDeleteDiagram
}: DiagramSourceDraftViewProps): React.JSX.Element {
  const [draftSource, setDraftSource] = useState(diagram.source)
  const [draftName, setDraftName] = useState(diagram.name)
  const [error, setError] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const dirty = draftSource !== diagram.source
  const nameDirty = draftName.trim() !== diagram.name

  useEffect(() => {
    setDraftSource(diagram.source)
    setDraftName(diagram.name)
    setError(null)
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

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]"
      data-testid="diagram-source-draft-view"
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
          className={draftButtonClass}
          disabled={editingLocked || (!dirty && !nameDirty)}
          onClick={() => void saveSource()}
        >
          Save
        </button>
        <button
          type="button"
          className={ghostDraftButtonClass}
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
        <div className="grid gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
          <div>Diagram source changed on disk for model {externalReloadConflict.modelName}.</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={draftButtonClass}
              onClick={() => void onResolveExternalReloadConflict('keep-draft')}
            >
              Keep draft
            </button>
            {externalReloadConflict.diskState === 'modified' ? (
              <>
                <button
                  type="button"
                  className={draftButtonClass}
                  onClick={() => void onResolveExternalReloadConflict('reload-from-disk')}
                >
                  Reload from disk
                </button>
                <button
                  type="button"
                  className={draftButtonClass}
                  onClick={() => {
                    void onResolveExternalReloadConflict('compare-changes')
                    setCompareOpen(true)
                  }}
                >
                  Compare changes
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={draftButtonClass}
                  onClick={() => void onResolveExternalReloadConflict('discard-deleted')}
                >
                  Discard deleted
                </button>
                <button
                  type="button"
                  className={draftButtonClass}
                  onClick={() => void onResolveExternalReloadConflict('cancel')}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          {compareOpen &&
          externalReloadConflict.diskState === 'modified' &&
          externalReloadConflict.diskSource !== undefined ? (
            <div
              className="grid gap-2 rounded border border-border bg-background p-2"
              data-testid="diagram-external-reload-compare"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Compare changes</span>
                <button
                  type="button"
                  className={ghostDraftButtonClass}
                  onClick={() => setCompareOpen(false)}
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
                    value={externalReloadConflict.diskSource}
                    readOnly
                    aria-label="Disk source comparison"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
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
    </section>
  )
}
