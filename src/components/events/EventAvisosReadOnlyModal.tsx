//file: src/components/events/EventAvisosReadOnlyModal.tsx
'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Info } from 'lucide-react'
import { useAvisos } from '@/hooks/useAvisos'

interface Props {
  open: boolean
  onClose: () => void
  eventCode: string | null
  onAvisosStateChange?: (state: { eventCode: string | null; hasAvisos: boolean; lastAvisoDate?: string }) => void
}

export default function EventAvisosReadOnlyModal({
  open,
  onClose,
  eventCode,
  onAvisosStateChange,
}: Props) {
  const { avisos, loading, error } = useAvisos(eventCode, open)

  React.useEffect(() => {
    const lastAvisoDate = avisos[0]?.editedAt || avisos[0]?.createdAt
    onAvisosStateChange?.({
      eventCode,
      hasAvisos: avisos.length > 0,
      lastAvisoDate,
    })
  }, [avisos, eventCode, onAvisosStateChange])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[94vw] max-w-md rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            Avisos de producció
          </DialogTitle>

          {eventCode && (
            <p className="text-xs text-gray-400">
              Codi esdeveniment: {eventCode}
            </p>
          )}
        </DialogHeader>

        {/* ESTATS */}
        {loading && (
          <p className="text-sm text-gray-500 mt-3">
            Carregant avisos…
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 mt-3">
            {error}
          </p>
        )}

        {!loading && !error && avisos.length === 0 && (
          <p className="text-sm text-gray-500 mt-3">
            No hi ha avisos per aquest esdeveniment.
          </p>
        )}

        {/* LLISTA AVISOS */}
        {!loading && !error && avisos.length > 0 && (
          <div className="mt-3 space-y-3">
            {avisos.map((a) => {
              const dateToShow = a.editedAt ?? a.createdAt
              const isEdited = Boolean(a.editedAt)

              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3"
                >
                  <p className="text-sm text-blue-900">
                    {a.content}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-blue-700">
                    <span>{a.createdBy.department}</span>
                    <span>·</span>
                    <span>{a.createdBy.name}</span>
                    <span>·</span>
                    <span>
                      {new Date(dateToShow).toLocaleString('ca-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {isEdited ? ' · editat' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* BOTÓ TANCAR */}
        <div className="sticky bottom-0 bg-white pt-4 mt-4 border-t">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl border border-gray-300 text-sm font-semibold"
          >
            Tancar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
