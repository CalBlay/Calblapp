'use client'

import { useCallback, useState } from 'react'
import { compressRasterImageForUpload } from '@/lib/file-optimization'
import {
  compressVideoForUpload,
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
} from '@/lib/media/compressVideoForUpload'
import {
  formatTicketAttachmentLimitMb,
  isTicketImageMime,
  isTicketVideoMime,
  MAX_UPLOAD_VIDEO_BYTES,
  MAX_VIDEO_INPUT_BYTES,
} from '@/lib/media/ticketAttachments'
import {
  parsePastedSpaceMediaUrl,
  type SpaceMediaItem,
} from '@/lib/spaces/spaceMedia'
import { normalizeGooglePhotosVideoRef } from '@/lib/googlePhotosVideoLink'

type Params = {
  fincaId?: string
  onUploaded: (item: SpaceMediaItem) => void
}

export function useSpaceMediaUpload({ fincaId, onUploaded }: Params) {
  const [uploading, setUploading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requireFincaId = useCallback(() => {
    if (!fincaId) {
      setError("Desa l'espai abans de pujar fitxers.")
      return false
    }
    return true
  }, [fincaId])

  const uploadBinary = useCallback(
    async (file: File, kind: 'image' | 'video') => {
      if (!requireFincaId()) return

      setError(null)
      setCompressing(true)
      try {
        let uploadFile = file
        if (kind === 'image' && isTicketImageMime(file.type)) {
          uploadFile = await compressRasterImageForUpload(file)
        } else if (kind === 'video' && isTicketVideoMime(file.type)) {
          if (file.size > MAX_VIDEO_INPUT_BYTES) {
            throw new Error(
              `El vídeo supera el límit de ${formatTicketAttachmentLimitMb(MAX_VIDEO_INPUT_BYTES)} abans de comprimir.`
            )
          }
          uploadFile = await compressVideoForUpload(file, DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
          if (uploadFile.size > MAX_UPLOAD_VIDEO_BYTES) {
            throw new Error(
              `El vídeo comprimit encara supera ${formatTicketAttachmentLimitMb(MAX_UPLOAD_VIDEO_BYTES)}.`
            )
          }
        }

        setCompressing(false)
        setUploading(true)

        const form = new FormData()
        form.append('file', uploadFile)
        form.append('fincaId', fincaId!)
        form.append('kind', kind)

        const res = await fetch('/api/spaces/upload', { method: 'POST', body: form })
        const json = (await res.json().catch(() => ({}))) as {
          url?: string
          kind?: string
          mimeType?: string
          error?: string
        }
        if (!res.ok || !json.url) {
          throw new Error(json.error || 'No s ha pogut pujar el fitxer.')
        }

        onUploaded({
          kind: json.kind === 'video' ? 'video' : 'image',
          url: json.url,
          mimeType: json.mimeType ?? uploadFile.type,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error pujant el fitxer.')
      } finally {
        setCompressing(false)
        setUploading(false)
      }
    },
    [fincaId, onUploaded, requireFincaId]
  )

  const handleImageSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!isTicketImageMime(file.type)) {
        setError('Només es permeten imatges.')
        return
      }
      await uploadBinary(file, 'image')
    },
    [uploadBinary]
  )

  const handleVideoSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!isTicketVideoMime(file.type)) {
        setError('Només es permeten vídeos.')
        return
      }
      await uploadBinary(file, 'video')
    },
    [uploadBinary]
  )

  const attachLink = useCallback(
    (rawUrl: string) => {
      setError(null)
      const trimmed = String(rawUrl || '').trim()
      if (!trimmed) return

      const photos = normalizeGooglePhotosVideoRef(trimmed)
      if (photos) {
        onUploaded({
          kind: 'google-photos',
          url: photos.viewUrl,
          mimeType: 'video/google-photos-link',
        })
        return
      }

      const parsed = parsePastedSpaceMediaUrl(trimmed)
      if (!parsed) {
        setError('Enganxa un enllaç vàlid (imatge, vídeo o Google Fotos).')
        return
      }
      onUploaded(parsed)
    },
    [onUploaded]
  )

  const handlePastedFile = useCallback(
    async (file: File) => {
      if (isTicketImageMime(file.type)) {
        await uploadBinary(file, 'image')
        return
      }
      if (isTicketVideoMime(file.type)) {
        await uploadBinary(file, 'video')
      }
    },
    [uploadBinary]
  )

  const busy = uploading || compressing

  return {
    busy,
    uploading,
    compressing,
    error,
    setError,
    handleImageSelected,
    handleVideoSelected,
    handlePastedFile,
    attachLink,
  }
}
