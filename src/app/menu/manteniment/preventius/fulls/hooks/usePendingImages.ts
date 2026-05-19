'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'

export type PendingImage = {
  file: File
  preview: string
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
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
    }
  }, [])

  const clearImages = useCallback(() => {
    imagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
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
            if (!file.type.startsWith('image/')) throw new Error('Nomes es permeten imatges.')
            const optimized = await compressRasterImageForUpload(file, DEFAULT_MAX_IMAGE_UPLOAD_BYTES)
            return { file: optimized, preview: URL.createObjectURL(optimized) }
          })
        )
        setImages((current) => [...current, ...compressed].slice(0, maxImages))
        setImageError(
          selected.length > remaining
            ? `Nomes s'han afegit les primeres ${maxImages} fotos.`
            : null
        )
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Error preparant les imatges')
      }
    },
    [images.length, maxImages]
  )

  const removeImage = useCallback((index: number) => {
    setImages((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
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
    previews: images.map((item) => item.preview),
    imageCount: images.length,
    imageError,
    setImageError,
    handleImageChange,
    removeImage,
    clearImages,
    uploadImages,
  }
}
