'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import {
  isTicketDocumentMime,
  isTicketDocumentName,
  isTicketImageMime,
  isTicketVideoMime,
  MAX_UPLOAD_DOCUMENT_BYTES,
  MAX_UPLOAD_VIDEO_BYTES,
} from '@/lib/media/ticketAttachments'

export type PendingImage = {
  file: File
  preview: string | null
  kind: 'image' | 'video' | 'file'
}

export function usePendingImages(maxImages: number) {
  const [images, setImages] = useState<PendingImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const imagesRef = useRef<PendingImage[]>([])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview)
      })
    }
  }, [])

  const clearImages = useCallback(() => {
    imagesRef.current.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview)
    })
    setImages([])
    setImageError(null)
  }, [])

  const handleImageChange = useCallback(
    async (fileList: FileList | null) => {
      const selected = fileList ? Array.from(fileList) : []
      if (!selected.length) return

      const remaining = maxImages - images.length
      if (remaining <= 0) {
        setImageError(`Nomes pots adjuntar fins a ${maxImages} fotos.`)
        return
      }

      try {
        const compressed = await Promise.all(
          selected.slice(0, remaining).map(async (file) => {
            const isImage = isTicketImageMime(file.type)
            const isVideo = isTicketVideoMime(file.type)
            const isDocument = isTicketDocumentMime(file.type) || isTicketDocumentName(file.name)

            if (isImage) {
              const optimized = await compressRasterImageForUpload(file, DEFAULT_MAX_IMAGE_UPLOAD_BYTES)
              return { file: optimized, preview: URL.createObjectURL(optimized), kind: 'image' as const }
            }

            if (isVideo) {
              if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
                throw new Error('El video supera el limit permes.')
              }
              return { file, preview: null, kind: 'video' as const }
            }

            if (isDocument) {
              if (file.size > MAX_UPLOAD_DOCUMENT_BYTES) {
                throw new Error('El fitxer supera el limit permes.')
              }
              return { file, preview: null, kind: 'file' as const }
            }

            throw new Error('Nomes es permeten fotos, videos o fitxers comuns.')
          })
        )
        setImages((current) => [...current, ...compressed].slice(0, maxImages))
        setImageError(
          selected.length > remaining
            ? `Nomes s'han afegit els primers ${maxImages} adjunts.`
            : null
        )
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Error preparant els adjunts')
      }
    },
    [images.length, maxImages]
  )

  const removeImage = useCallback((index: number) => {
    setImages((current) => {
      const target = current[index]
      if (target?.preview) URL.revokeObjectURL(target.preview)
      return current.filter((_, i) => i !== index)
    })
  }, [])

  const uploadImages = useCallback(async () => {
    const uploaded = await Promise.all(
      images.map(async (image) => {
        const form = new FormData()
        form.append('file', image.file)
        const res = await fetch('/api/maintenance/upload-image', { method: 'POST', body: form })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(String(json?.error || "No s'ha pogut pujar una imatge"))
        }
        const json = await res.json()
        return { url: json.url || null, path: json.path || null, meta: json.meta || null }
      })
    )
    return uploaded.filter((item) => item.url || item.path)
  }, [images])

  return {
    images,
    previews: images.map((item) => item.preview).filter((value): value is string => Boolean(value)),
    imageCount: images.length,
    imageError,
    setImageError,
    handleImageChange,
    removeImage,
    clearImages,
    uploadImages,
  }
}
