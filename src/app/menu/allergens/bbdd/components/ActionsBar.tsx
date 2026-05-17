'use client'

import { Button } from '@/components/ui/button'

type Props = {
  loading: boolean
  canDelete: boolean
  status: string
  onSave: () => void | Promise<void>
  onDelete: () => void | Promise<void>
  onReset: () => void
}

export function ActionsBar({ loading, canDelete, status, onSave, onDelete, onReset }: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Button
        variant="primary"
        className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-300"
        onClick={() => void onSave()}
        disabled={loading}
      >
        Guardar plat
      </Button>
      <Button
        variant="destructive"
        onClick={() => void onDelete()}
        disabled={loading || !canDelete}
      >
        Eliminar plat
      </Button>
      <Button variant="outline" onClick={onReset} disabled={loading}>
        Neteja formulari
      </Button>
      {status && <p className="text-sm text-slate-600">{status}</p>}
    </div>
  )
}
