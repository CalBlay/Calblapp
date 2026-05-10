'use client'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AutoPreviewResponse, QuadrantMode } from './quadrantModalTypes'

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
  const autoHasEnoughData = mode === 'auto' && Boolean(autoPreview?.learningStatus?.hasEnoughData)
  const autoInsufficient =
    mode === 'auto' &&
    isQuadrantCoreDept &&
    autoPreview?.learningStatus &&
    !autoPreview.learningStatus.hasEnoughData
  const showManualLikeButtons = mode === 'manual' || autoHasEnoughData
  const primaryDisabled =
    !canAutoGen || loading || autoPreviewLoading || autoInsufficient === true

  return (
    <>
      <AnimatePresence>
        {error && (
          <motion.div className="text-red-600 flex items-center gap-2 text-sm">
            <AlertTriangle size={18} /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div className="text-green-600 flex items-center gap-2">
            <CheckCircle2 size={20} /> Borrador creat!
          </motion.div>
        )}
      </AnimatePresence>

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
              disabled={primaryDisabled}
              title="Desa el borrador i el confirma alhora, sense editar-lo a la taula de borradors."
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
