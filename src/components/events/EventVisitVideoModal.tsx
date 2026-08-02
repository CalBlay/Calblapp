'use client'

import React, { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2, Video, X } from 'lucide-react'
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
import { normalizeVisitVideoUserId, VISIT_VIDEO_FIELD_PREFIX } from '@/lib/eventVisitVideo'
import {
  extractGoogleDriveFileId,
  GOOGLE_DRIVE_VIDEO_MIME,
} from '@/lib/googleDriveVideoLink'
import {
  GOOGLE_PHOTOS_VIDEO_MIME,
  isGooglePhotosVideoRef,
} from '@/lib/googlePhotosVideoLink'

function isPhotosVideoDoc(doc: EventDoc): boolean {
  if (doc.mimeType === GOOGLE_PHOTOS_VIDEO_MIME) return true
  return isGooglePhotosVideoRef(doc.url)
}

function isDriveVideoDoc(doc: EventDoc): boolean {
  if (doc.mimeType === GOOGLE_DRIVE_VIDEO_MIME) return true
  return extractGoogleDriveFileId(doc.url) !== null
}

function VisitVideoItem({
  doc,
  canDelete,
  deleting,
  onDelete,
}: {
  doc: EventDoc
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <li className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={doc.title}>
            {doc.title}
          </p>
          <p className="text-xs text-slate-500">
            {isPhotosVideoDoc(doc) ? 'Google Fotos' : isDriveVideoDoc(doc) ? 'Google Drive' : 'Vídeo'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Obrir
          </a>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Eliminar vídeo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {isPhotosVideoDoc(doc) || isDriveVideoDoc(doc) ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-4 text-center">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {isPhotosVideoDoc(doc) ? 'Obrir a Fotos' : 'Obrir a Drive'}
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-black">
          <TicketAttachmentTile
            url={doc.url}
            alt={doc.title || 'Vídeo de visita'}
            mimeType={doc.mimeType}
            className="max-h-48 w-full object-contain"
          />
        </div>
      )}
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
  const { data: session } = useSession()
  const currentUserId = normalizeVisitVideoUserId(session?.user?.id || '')
  const [refresh, setRefresh] = useState(0)
  const [deletingField, setDeletingField] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { docs, loading, error: loadError } = useEventDocuments(
    eventId,
    eventCode || undefined,
    VISIT_VIDEO_FIELD_PREFIX,
    refresh,
    open
  )

  const bumpRefresh = () => setRefresh((value) => value + 1)

  const {
    compressing,
    uploading,
    linking,
    error: uploadError,
    previewUrl,
    clearPreview,
    handleVideoSelected,
    attachPhotosLink,
    maxVideos,
  } = useEventVisitVideoUpload({
    eventId,
    eventCode,
    onUploaded: bumpRefresh,
  })

  const handleDelete = useCallback(
    async (doc: EventDoc) => {
      const confirmed = window.confirm(
        `Vols eliminar aquest vídeo de visita?\n\n${doc.title || doc.id}`
      )
      if (!confirmed) return

      setDeleteError(null)
      setDeletingField(doc.id)
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/visit-video`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: doc.id,
            eventCode: eventCode || undefined,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(json?.error || "No s'ha pogut eliminar el vídeo"))
        }
        bumpRefresh()
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Error eliminant el vídeo')
      } finally {
        setDeletingField(null)
      }
    },
    [eventCode, eventId]
  )

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
                Vídeo visita
              </DialogTitle>
              {eventSummary ? (
                <DialogDescription className="truncate text-sm text-muted-foreground">
                  {eventSummary}
                </DialogDescription>
              ) : null}
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
              linking={linking}
              disabled={!canUpload}
              onFilesSelected={handleVideoSelected}
              onPhotosLinkSubmit={attachPhotosLink}
              onClearPreview={clearPreview}
            />
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Guardats
            </p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {loading && <p className="px-2 py-3 text-sm text-slate-500">Carregant…</p>}
              {loadError ? (
                <p className="px-2 py-3 text-sm text-red-600">{loadError}</p>
              ) : null}
              {deleteError ? (
                <p className="px-2 py-3 text-sm text-red-600">{deleteError}</p>
              ) : null}
              {!loading && !loadError && docs.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-slate-500">
                  Cap vídeo.
                </p>
              ) : null}
              {docs.length > 0 ? (
                <ul className="space-y-2">
                  {docs.map((doc) => {
                    const createdBy = normalizeVisitVideoUserId(doc.createdBy || '')
                    const canDelete = Boolean(currentUserId && createdBy && createdBy === currentUserId)
                    return (
                      <VisitVideoItem
                        key={doc.id}
                        doc={doc}
                        canDelete={canDelete}
                        deleting={deletingField === doc.id}
                        onDelete={() => void handleDelete(doc)}
                      />
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
