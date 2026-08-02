'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ProjectConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancel·lar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="w-[92vw] max-w-md rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={
              destructive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processant...' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
