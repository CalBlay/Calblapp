'use client'

import React, { useState } from 'react'
import { Video, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import MobileVideoPicker from '@/components/media/MobileVideoPicker'
import TicketAttachmentTile from '@/components/maintenance/TicketAttachmentTile'
import useEventDocuments, { type EventDoc } from '@/hooks/events/useEventDocuments'
import { useEventVisitVideoUpload } from '@/hooks/events/useEventVisitVideoUpload'
import { VISIT_VIDEO_FIELD_PREFIX } from '@/lib/eventVisitVideo'

function VisitVideoItem({ doc }: { doc: EventDoc }) {
  return (
    <li className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={doc.title}>
            {doc.title}
          </p>
          <p className="text-xs text-slate-500">Vídeo de visita comercial</p>
        </div>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
        >
          Obrir
        </a>
      </div>
      <div className="overflow-hidden rounded-xl bg-black">
        <TicketAttachmentTile
          url={doc.url}
          alt={doc.title || 'Vídeo de visita'}
          className="max-h-48 w-full object-contain"
        />
      </div>
    </li>
  )
}

export default function EventVisitVideoModal({
  eventId,
  eventCode,
  eventSummary,
  open,
  onOpenChange,
  canUpload,
}: {
  eventId: string
  eventCode?: string | null
  eventSummary?: string
  open: boolean
  onOpenChange: (value: boolean) => void
  canUpload: boolean
}) {
  const [refresh, setRefresh] = useState(0)
  const { docs, loading, error: loadError } = useEventDocuments(
    eventId,
    eventCode || undefined,
    VISIT_VIDEO_FIELD_PREFIX,
    refresh
  )

  const bumpRefresh = () => setRefresh((value) => value + 1)

  const {
    compressing,
    uploading,
    error: uploadError,
    previewUrl,
    clearPreview,
    handleVideoSelected,
    maxVideos,
  } = useEventVisitVideoUpload({
    eventId,
    eventCode,
    onUploaded: bumpRefresh,
  })

  const count = docs.length
  const showUploader = canUpload && count < maxVideos

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100vw-1rem,28rem)] max-w-[calc(100vw-1rem)] rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader className="space-y-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2 text-left">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Video className="h-5 w-5 text-blue-600" />
                Vídeo visita comercial
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {eventSummary
                  ? `Visita a l'espai · ${eventSummary}`
                  : 'Grava o adjunta el vídeo de la visita comercial a l\'espai.'}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => onOpenChange(false)}
              aria-label="Tancar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-3 max-h-[min(70dvh,32rem)] space-y-4 overflow-y-auto overscroll-contain touch-pan-y">
          {showUploader ? (
            <MobileVideoPicker
              count={count}
              maxVideos={maxVideos}
              previewUrl={previewUrl}
              error={uploadError}
              compressing={compressing}
              uploading={uploading}
              disabled={!canUpload}
              onFilesSelected={handleVideoSelected}
              onClearPreview={clearPreview}
            />
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vídeos guardats
            </p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {loading && <p className="px-2 py-3 text-sm text-slate-500">Carregant…</p>}
              {loadError ? (
                <p className="px-2 py-3 text-sm text-red-600">{loadError}</p>
              ) : null}
              {!loading && !loadError && docs.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-slate-500">
                  Encara no hi ha vídeos de visita.
                </p>
              ) : null}
              {docs.length > 0 ? (
                <ul className="space-y-2">
                  {docs.map((doc) => (
                    <VisitVideoItem key={doc.id} doc={doc} />
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
