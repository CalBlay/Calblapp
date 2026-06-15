'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { compressVideoForUpload, DEFAULT_MAX_VIDEO_UPLOAD_BYTES } from '@/lib/media/compressVideoForUpload'
import {
  formatTicketAttachmentLimitMb,
  isTicketVideoMime,
  MAX_UPLOAD_VIDEO_BYTES,
  MAX_VIDEO_INPUT_BYTES,
} from '@/lib/media/ticketAttachments'
import { MAX_EVENT_VISIT_VIDEOS } from '@/lib/eventVisitVideo'

type Params = {
  eventId: string
  eventCode?: string | null
  onUploaded?: () => void
}

export function useEventVisitVideoUpload({ eventId, eventCode, onUploaded }: Params) {
  const [compressing, setCompressing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const clearPreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  const handleVideoSelected = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return

      setError(null)
      clearPreview()

      if (!isTicketVideoMime(file.type)) {
        setError('Només es permeten vídeos.')
        return
      }

      try {
        if (file.size > MAX_VIDEO_INPUT_BYTES) {
          throw new Error(
            `El vídeo supera el límit de ${formatTicketAttachmentLimitMb(MAX_VIDEO_INPUT_BYTES)} abans de comprimir.`
          )
        }

        setCompressing(true)
        const optimized = await compressVideoForUpload(file, DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
        if (optimized.size > MAX_UPLOAD_VIDEO_BYTES) {
          throw new Error(
            `El vídeo comprimit encara supera ${formatTicketAttachmentLimitMb(MAX_UPLOAD_VIDEO_BYTES)}.`
          )
        }

        const localPreview = URL.createObjectURL(optimized)
        previewRef.current = localPreview
        setPreviewUrl(localPreview)

        setCompressing(false)
        setUploading(true)

        const form = new FormData()
        form.append('file', optimized)
        if (eventCode) form.append('eventCode', eventCode)

        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/visit-video`, {
          method: 'POST',
          body: form,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(json?.error || "No s'ha pogut pujar el vídeo"))
        }

        clearPreview()
        onUploaded?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error pujant el vídeo')
      } finally {
        setCompressing(false)
        setUploading(false)
      }
    },
    [clearPreview, eventCode, eventId, onUploaded]
  )

  return {
    compressing,
    uploading,
    error,
    previewUrl,
    clearPreview,
    handleVideoSelected,
    maxVideos: MAX_EVENT_VISIT_VIDEOS,
  }
}
