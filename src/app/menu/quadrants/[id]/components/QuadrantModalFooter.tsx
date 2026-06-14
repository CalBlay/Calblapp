'use client'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { LazyAnimatePresence, MotionDiv } from '@/lib/lazyMotion'
import type { AutoPreviewResponse, QuadrantMode } from './quadrantModalTypes'
import {
  quadrantEditorDisabledReason,
  useQuadrantEditorPermissions,
} from '../hooks/useQuadrantEditorPermissions'

type Props = {
  loading: boolean
  error: string | null
  success: boolean
  canAutoGen: boolean
  mode: QuadrantMode
  isQuadrantCoreDept: boolean
  autoPreview: AutoPreviewResponse | null
  autoPreviewLoading: boolean
  onCancel: () => void
  onSave: (confirmAfterSave: boolean) => void
}

export default function QuadrantModalFooter({
  loading,
  error,
  success,
  canAutoGen,
  mode,
  isQuadrantCoreDept,
  autoPreview,
  autoPreviewLoading,
  onCancel,
  onSave,
}: Props) {
  const { ready, canSave, canConfirm } = useQuadrantEditorPermissions()

  const autoHasEnoughData = mode === 'auto' && Boolean(autoPreview?.learningStatus?.hasEnoughData)
  const autoInsufficient = Boolean(
    mode === 'auto' &&
      isQuadrantCoreDept &&
      autoPreview?.learningStatus &&
      !autoPreview.learningStatus.hasEnoughData
  )
  const showManualLikeButtons = mode === 'manual' || autoHasEnoughData
  const primaryDisabled =
    !canAutoGen || loading || autoPreviewLoading || autoInsufficient === true || !ready || !canSave
  const confirmDisabled =
    !canAutoGen ||
    loading ||
    autoPreviewLoading ||
    autoInsufficient === true ||
    !ready ||
    !canSave ||
    !canConfirm
  const confirmDisabledReason = confirmDisabled
    ? quadrantEditorDisabledReason({
        canAutoGen,
        ready,
        canSave,
        canConfirm,
        busy: loading,
        autoPreviewLoading,
        autoInsufficient,
        kind: 'confirm',
      })
    : null
  const saveDisabledReason = primaryDisabled
    ? quadrantEditorDisabledReason({
        canAutoGen,
        ready,
        canSave,
        busy: loading,
        autoPreviewLoading,
        autoInsufficient,
        kind: 'save',
      })
    : null

  return (
    <>
      <LazyAnimatePresence>
        {error && (
          <MotionDiv className="text-red-600 flex items-center gap-2 text-sm">
            <AlertTriangle size={18} /> {error}
          </MotionDiv>
        )}
        {success && (
          <MotionDiv className="text-green-600 flex items-center gap-2">
            <CheckCircle2 size={20} /> Borrador creat!
          </MotionDiv>
        )}
      </LazyAnimatePresence>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/80 px-3 py-3 backdrop-blur sm:px-4">
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={onCancel} className="sm:min-w-[140px]">
            Cancel·la
          </Button>
          {showManualLikeButtons ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50 sm:min-w-[200px]"
              onClick={() => onSave(true)}
              disabled={confirmDisabled}
              title={confirmDisabledReason || 'Desa el borrador i el confirma alhora, sense editar-lo a la taula de borradors.'}
            >
              {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {loading ? 'Processant…' : 'Confirmar quadrant'}
            </Button>
          ) : null}
          <Button
            className="bg-blue-600 text-white gap-2 hover:bg-blue-700 sm:min-w-[220px]"
            type="button"
            onClick={() => onSave(false)}
            disabled={primaryDisabled}
            title={saveDisabledReason || undefined}
          >
            {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {loading
              ? 'Processant…'
              : showManualLikeButtons
                ? 'Desar borrador'
                : 'Auto generar i desa'}
          </Button>
        </DialogFooter>
        {!canAutoGen ? (
          <p className="mt-2 text-[11px] text-slate-500">
            {mode === 'manual'
              ? 'Omple com a mínim dates i hores per poder desar el borrador.'
              : 'Omple com a mínim dates i hores per poder auto-generar.'}
          </p>
        ) : null}
        {mode === 'auto' &&
        isQuadrantCoreDept &&
        autoPreview?.learningStatus &&
        !autoPreview.learningStatus.hasEnoughData ? (
          <p className="mt-2 text-[11px] text-amber-700">
            Encara no hi ha prou historic per generar amb Auto. Canvia a Semi-auto o Manual.
          </p>
        ) : null}
      </div>
    </>
  )
}
