// file: src/components/events/EventKitchenDocumentsModal.tsx
'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  Image as ImgIcon,
  X,
} from 'lucide-react'
import AttachFileButton from '@/components/calendar/AttachFileButton'
import { Button } from '@/components/ui/button'
import useEventDocuments, { EventDoc } from '@/hooks/events/useEventDocuments'

const FIELD_PREFIX = 'cuinaFile'

function DocIcon({ d }: { d: EventDoc }) {
  switch (d.icon) {
    case 'pdf':
      return <FileText className="h-4 w-4" />
    case 'sheet':
      return <FileSpreadsheet className="h-4 w-4" />
    case 'slide':
      return <Presentation className="h-4 w-4" />
    case 'img':
      return <ImgIcon className="h-4 w-4" />
    case 'doc':
      return <File className="h-4 w-4" />
    default:
      return <ExternalLink className="h-4 w-4" />
  }
}

export default function EventKitchenDocumentsModal({
  eventId,
  eventCode,
  open,
  onOpenChange,
}: {
  eventId: string
  eventCode?: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [refresh, setRefresh] = useState(0)
  const { docs, loading, error } = useEventDocuments(
    eventId,
    eventCode || undefined,
    FIELD_PREFIX,
    refresh
  )

  const existingKeys = docs.map((d) => d.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md rounded-2xl p-4" lockDismissOnOutside>
        <DialogHeader className="space-y-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Documents cuina
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Adjunta documents de cuina per a aquest esdeveniment.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 rounded-full"
              onClick={() => onOpenChange(false)}
              aria-label="Tancar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          <AttachFileButton
            collection="stage_verd"
            docId={eventId}
            fieldBase={FIELD_PREFIX}
            existingKeys={existingKeys}
            onAdded={() => setRefresh((v) => v + 1)}
          />

          <div className="border rounded-md p-2 bg-gray-50">
            {loading && <p className="text-sm text-gray-500">Carregant…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && !error && docs.length === 0 && (
              <p className="text-sm text-gray-500 text-center">
                No hi ha documents de cuina.
              </p>
            )}
            {docs.length > 0 && (
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded-md shadow-sm hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <DocIcon d={d} />
                      <span className="truncate" title={d.title}>
                        {d.title}
                      </span>
                    </div>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 shrink-0"
                    >
                      Obrir
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
