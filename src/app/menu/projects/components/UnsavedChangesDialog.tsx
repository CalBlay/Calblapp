'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  title?: string
  description?: string
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export default function UnsavedChangesDialog({
  open,
  title = 'Canvis sense guardar',
  description = 'Tens canvis pendents en aquesta secció. Què vols fer?',
  saving = false,
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="w-[92vw] max-w-md rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">{description}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel·lar
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>
            Descartar
          </Button>
          <Button
            type="button"
            className="bg-violet-600 text-white hover:bg-violet-700"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Guardant...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
