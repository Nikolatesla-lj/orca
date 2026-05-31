import { Link2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import type {
  C4ModelData,
  Diagram,
  DiagramRefRole,
  DiagramRefTarget
} from '../../../../shared/scryer/model-types'
import { sortDiagramsForLibrary } from '../../../../shared/scryer/diagram-ids'
import type { CreateDiagramRefInput } from './diagram-controller'
import { Button } from '../ui/button'

export const DIAGRAM_REF_ROLES: DiagramRefRole[] = [
  'architecture-detail',
  'behavior-detail',
  'sequence-detail',
  'state-detail',
  'data-detail',
  'class-detail',
  'deployment-detail',
  'evidence',
  'other'
]

export type DiagramReferenceActions = {
  onCreateDiagramRef: (input: CreateDiagramRefInput) => Promise<void>
  onDeleteDiagramRefs: (refIds: string[]) => Promise<void>
  onCreateDiagramThenLink?: (target: DiagramRefTarget, label: string) => Promise<void>
  onLinkCreatedDiagramNow?: () => Promise<void>
  onCancelCreatedDiagramLink?: () => void
  createdDiagramLink?: CreatedDiagramLinkState | null
}

export type CreatedDiagramLinkState = {
  diagramId: string
  target: DiagramRefTarget
  targetLabel: string
  status: 'editing' | 'ready' | 'unlinked'
  targetUnavailable?: boolean
}

export function diagramRefTargetEquals(left: DiagramRefTarget, right: DiagramRefTarget): boolean {
  if (left.type !== right.type) {
    return false
  }
  switch (left.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return left.id === (right as typeof left).id
    case 'flowStep': {
      const candidate = right as typeof left
      return left.flowId === candidate.flowId && left.stepId === candidate.stepId
    }
    case 'source': {
      const candidate = right as typeof left
      return (
        left.pattern === candidate.pattern &&
        left.line === candidate.line &&
        left.endLine === candidate.endLine
      )
    }
  }
}

function formatTarget(target: DiagramRefTarget): string {
  switch (target.type) {
    case 'node':
    case 'edge':
    case 'group':
    case 'flow':
      return `${target.type}:${target.id}`
    case 'flowStep':
      return `flowStep:${target.flowId}/${target.stepId}`
    case 'source':
      return [
        target.pattern,
        target.line ? `:${target.line}` : '',
        target.endLine ? `-${target.endLine}` : ''
      ].join('')
  }
}

function diagramName(diagrams: Diagram[], diagramId: string): string {
  return diagrams.find((diagram) => diagram.id === diagramId)?.name ?? diagramId
}

export function DiagramReferenceControls({
  model,
  target,
  label,
  syncing,
  actions
}: {
  model: C4ModelData
  target: DiagramRefTarget
  label: string
  syncing: boolean
  actions?: DiagramReferenceActions
}): React.JSX.Element {
  const diagrams = useMemo(() => sortDiagramsForLibrary(model.diagrams ?? []), [model.diagrams])
  const refs = useMemo(
    () => (model.diagramRefs ?? []).filter((ref) => diagramRefTargetEquals(ref.target, target)),
    [model.diagramRefs, target]
  )
  const [diagramId, setDiagramId] = useState('')
  const [role, setRole] = useState<DiagramRefRole | ''>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pendingLink =
    actions?.createdDiagramLink && diagramRefTargetEquals(actions.createdDiagramLink.target, target)
      ? actions.createdDiagramLink
      : null

  useEffect(() => {
    if (pendingLink?.status === 'ready') {
      setDiagramId(pendingLink.diagramId)
    }
  }, [pendingLink?.diagramId, pendingLink?.status])

  const saveRef = async (): Promise<void> => {
    if (!actions || !diagramId) {
      return
    }
    setError(null)
    try {
      await actions.onCreateDiagramRef({
        diagramId,
        target,
        role: role || undefined,
        note
      })
      setRole('')
      setNote('')
    } catch (saveError) {
      const code =
        saveError && typeof saveError === 'object' && 'code' in saveError
          ? String((saveError as { code: unknown }).code)
          : null
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      setError(code ? `${code}: ${message}` : message)
    }
  }

  const createDiagramThenLink = async (): Promise<void> => {
    if (!actions?.onCreateDiagramThenLink) {
      return
    }
    setError(null)
    try {
      await actions.onCreateDiagramThenLink(target, label)
    } catch (createError) {
      const code =
        createError && typeof createError === 'object' && 'code' in createError
          ? String((createError as { code: unknown }).code)
          : null
      const message = createError instanceof Error ? createError.message : String(createError)
      setError(code ? `${code}: ${message}` : message)
    }
  }

  const cancelCreatedLink = (): void => {
    actions?.onCancelCreatedDiagramLink?.()
  }

  const linkCreatedNow = async (): Promise<void> => {
    if (!actions?.onLinkCreatedDiagramNow) {
      return
    }
    setError(null)
    try {
      await actions.onLinkCreatedDiagramNow()
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : String(linkError))
    }
  }

  const deleteRef = async (refId: string): Promise<void> => {
    if (!actions) {
      return
    }
    setError(null)
    try {
      await actions.onDeleteDiagramRefs([refId])
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  return (
    <section
      className="grid gap-2 border-t border-border pt-3"
      data-testid="architecture-diagram-ref-panel"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="size-3.5" />
        <span className="min-w-0 flex-1">Diagram refs</span>
        <span className="rounded bg-muted px-1 font-mono text-[10px]">{label}</span>
      </div>
      {refs.length === 0 ? (
        <div className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
          No diagram refs for {formatTarget(target)}
        </div>
      ) : (
        <div className="grid gap-1">
          {refs.map((ref) => (
            <div
              key={ref.id}
              className="grid gap-1 rounded border border-border px-2 py-1 text-xs"
              data-testid="architecture-diagram-ref-row"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {diagramName(diagrams, ref.diagramId)}
                </span>
                <span className="rounded bg-muted px-1 text-[10px]">{ref.role}</span>
                {actions ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={syncing}
                    onClick={() => void deleteRef(ref.id)}
                    data-testid="architecture-diagram-ref-remove"
                    title="Remove diagram ref"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                ) : null}
              </div>
              {ref.note ? <div className="text-muted-foreground">{ref.note}</div> : null}
            </div>
          ))}
        </div>
      )}
      {actions ? (
        <div className="grid gap-2 rounded border border-border p-2">
          {pendingLink?.status === 'ready' ? (
            <div
              className="rounded border border-border bg-muted/40 px-2 py-2 text-xs"
              data-testid="architecture-diagram-ref-created-ready"
            >
              Choose a role to link the new diagram to {pendingLink.targetLabel}.
            </div>
          ) : null}
          {pendingLink?.status === 'unlinked' ? (
            <div
              className="grid gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              data-testid="architecture-diagram-ref-created-unlinked"
            >
              <div>Diagram created, not linked yet.</div>
              {pendingLink.targetUnavailable ? (
                <div>Target unavailable. No diagram reference was created.</div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={syncing}
                onClick={() => void linkCreatedNow()}
                data-testid="architecture-diagram-ref-link-now"
              >
                Link now
              </Button>
            </div>
          ) : null}
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs"
            value={diagramId}
            onChange={(event) => setDiagramId(event.currentTarget.value)}
            disabled={syncing}
            data-testid="architecture-diagram-ref-diagram"
            aria-label="Select existing diagram"
          >
            <option value="">Select existing diagram</option>
            {diagrams.map((diagram) => (
              <option key={diagram.id} value={diagram.id}>
                {diagram.name || diagram.id}
              </option>
            ))}
          </select>
          {diagrams.length === 0 ? (
            <div className="rounded border border-border px-2 py-2 text-xs text-muted-foreground">
              No existing diagrams to link.
            </div>
          ) : null}
          {actions.onCreateDiagramThenLink ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={syncing}
              onClick={() => void createDiagramThenLink()}
              data-testid="architecture-diagram-ref-create"
            >
              <Plus className="size-3" />
              Create diagram then link
            </Button>
          ) : null}
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs"
            value={role}
            onChange={(event) => setRole(event.currentTarget.value as DiagramRefRole | '')}
            disabled={syncing}
            data-testid="architecture-diagram-ref-role"
            aria-label="Select diagram ref role"
          >
            <option value="">Select role</option>
            {DIAGRAM_REF_ROLES.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
          {role === 'other' ? (
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              disabled={syncing}
              data-testid="architecture-diagram-ref-note"
              placeholder="Why this role is other"
            />
          ) : null}
          {error ? (
            <div className="text-xs text-destructive" data-testid="architecture-diagram-ref-error">
              {error}
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={syncing || !diagramId}
            onClick={() => void saveRef()}
            data-testid="architecture-diagram-ref-add"
          >
            <Plus className="size-3" />
            Add reference
          </Button>
          {pendingLink?.status === 'ready' ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={syncing}
              onClick={cancelCreatedLink}
              data-testid="architecture-diagram-ref-cancel-created"
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
