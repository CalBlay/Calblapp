'use client'

import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { AutoPreviewResponse, QuadrantMode } from './quadrantModalTypes'
import {
  quadrantEditorDisabledReason,
  useQuadrantEditorPermissions,
} from '../hooks/useQuadrantEditorPermissions'

export type QuadrantEditorIconActionsProps = {
  loading: boolean
  canAutoGen: boolean
  mode: QuadrantMode
  isQuadrantCoreDept: boolean
  autoPreview: AutoPreviewResponse | null
  autoPreviewLoading: boolean
  onDelete: () => void | Promise<void>
  onReopen: () => void | Promise<void>
  onSave: (confirmAfterSave: boolean) => void
  deleting?: boolean
  reopening?: boolean
  hasPersistedDraft?: boolean
  confirmed?: boolean
}

export default function QuadrantEditorIconActions({
  loading,
  canAutoGen,
  mode,
  isQuadrantCoreDept,
  autoPreview,
  autoPreviewLoading,
  onDelete,
  onReopen,
  onSave,
  deleting = false,
  reopening = false,
  hasPersistedDraft = false,
  confirmed = false,
}: QuadrantEditorIconActionsProps) {
  const { ready, canSave, canConfirm, canUnconfirm, canDeleteDraft } = useQuadrantEditorPermissions()

  const autoHasEnoughData = mode === 'auto' && Boolean(autoPreview?.learningStatus?.hasEnoughData)
  const autoInsufficient = Boolean(
    mode === 'auto' &&
      isQuadrantCoreDept &&
      autoPreview?.learningStatus &&
      !autoPreview.learningStatus.hasEnoughData
  )
  const showManualLikeButtons = mode === 'manual' || autoHasEnoughData
  const busy = loading || deleting || reopening
  const saveDisabled =
    confirmed || !canAutoGen || busy || autoPreviewLoading || autoInsufficient === true || !ready || !canSave
  const confirmDisabled =
    confirmed ||
    !canAutoGen ||
    busy ||
    autoPreviewLoading ||
    autoInsufficient === true ||
    !ready ||
    !canSave ||
    !canConfirm
  const deleteDisabled = busy || !ready || (hasPersistedDraft && !canDeleteDraft)
  const saveDisabledReason = confirmed
    ? 'Reobre el quadrant abans de desar canvis.'
    : saveDisabled
      ? quadrantEditorDisabledReason({
        canAutoGen,
        ready,
        canSave,
        busy,
        autoPreviewLoading,
        autoInsufficient,
        kind: 'save',
      })
      : null
  const confirmDisabledReason = confirmed
    ? 'El quadrant ja està confirmat.'
    : confirmDisabled
      ? quadrantEditorDisabledReason({
        canAutoGen,
        ready,
        canSave,
        canConfirm,
        busy,
        autoPreviewLoading,
        autoInsufficient,
        kind: 'confirm',
      })
      : null

  return (
    <div className="flex items-center gap-2" data-quadrant-editor-command>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-9 w-9 rounded-full bg-red-600 p-0 text-white shadow hover:bg-red-700"
          onClick={() => void onDelete()}
          disabled={deleteDisabled}
          title={hasPersistedDraft ? 'Eliminar borrador' : 'Tancar sense desar'}
          aria-label={hasPersistedDraft ? 'Eliminar borrador' : 'Tancar sense desar'}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>

        {showManualLikeButtons ? (
          <Button
            type="button"
            size="sm"
            className="h-9 w-9 rounded-full bg-emerald-500 p-0 text-white shadow hover:bg-emerald-600"
            onClick={() => onSave(true)}
            disabled={confirmDisabled}
            title={confirmDisabledReason || 'Confirmar quadrant'}
            aria-label="Confirmar quadrant"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          className="h-9 w-9 rounded-full bg-blue-600 p-0 text-white shadow hover:bg-blue-700"
          onClick={() => onSave(false)}
          disabled={saveDisabled}
          title={saveDisabledReason || (showManualLikeButtons ? 'Desar borrador' : 'Auto generar i desa')}
          aria-label={showManualLikeButtons ? 'Desar borrador' : 'Auto generar i desa'}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          size="sm"
          className="h-9 w-9 rounded-full bg-amber-500 p-0 text-white shadow hover:bg-amber-600"
          onClick={() => void onReopen()}
          disabled={!hasPersistedDraft || busy || !ready || !canUnconfirm}
          title={ready && !canUnconfirm ? 'Sense permís per reobrir quadrants' : 'Reobrir quadrant'}
          aria-label="Reobrir quadrant"
        >
          {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        </Button>
      </div>

      {ready && !canSave ? (
        <span className="text-[11px] font-semibold text-amber-700">
          Sense permís per desar
        </span>
      ) : null}
    </div>
  )
}
