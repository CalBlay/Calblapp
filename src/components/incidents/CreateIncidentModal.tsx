'use client'

import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import categories from '../../data/incident-categories.json'

interface CreateIncidentModalProps {
  open: boolean
  event: {
    id: string
    summary: string
    start: string
    location?: string
  }
  onClose: () => void
  onCreated: () => void
}

const DEPARTAMENTS = ['Logistica', 'Sala', 'Cuina', 'Comercial']
const IMPORTANCIES = ['Urgent', 'Alta', 'Normal', 'Baixa']
const MAX_IMAGES = 3
const MAX_SIZE = 1024 * 1024

type PendingImage = {
  file: File
  preview: string
}

export default function CreateIncidentModal({
  open,
  event,
  onClose,
  onCreated,
}: CreateIncidentModalProps) {
  const { data: session } = useSession()
  const userName = session?.user?.name ?? session?.user?.email ?? 'Desconegut'
  const userDepartmentRaw = session?.user?.department ?? ''
  const normalizedUserDepartment = userDepartmentRaw.trim() || DEPARTAMENTS[0]
  const normalizedUserRole = (session?.user?.role ?? '').toLowerCase().trim()
  const canPickDepartment = ['admin', 'direccio'].includes(normalizedUserRole)

  const [department, setDepartment] = useState(normalizedUserDepartment)
  const [importance, setImportance] = useState('Normal')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [imageError, setImageError] = useState('')
  const imagesRef = React.useRef<PendingImage[]>([])

  useEffect(() => {
    setDepartment(normalizedUserDepartment)
  }, [normalizedUserDepartment])

  useEffect(() => {
    if (!open) {
      setImportance('Normal')
      setDescription('')
      setCategory(categories[0])
      setImages((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.preview))
        return []
      })
      setImageError('')
      setError('')
    }
  }, [open])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
    }
  }, [])

  const departmentOptions = React.useMemo(() => {
    const list = [...DEPARTAMENTS]
    if (!list.includes(normalizedUserDepartment)) {
      list.unshift(normalizedUserDepartment)
    }
    return list
  }, [normalizedUserDepartment])

  const compressImage = async (file: File, maxSizeBytes = MAX_SIZE) => {
    const img = new Image()
    const tempUrl = URL.createObjectURL(file)
    img.src = tempUrl
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    let maxDim = 1600
    let { width, height } = img

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No s ha pogut preparar la imatge')

    let quality = 0.86
    let blob: Blob | null = null

    while (true) {
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= maxSizeBytes) break
      if (quality > 0.38) {
        quality -= 0.08
        continue
      }
      if (maxDim <= 900) break
      maxDim = Math.max(900, Math.round(maxDim * 0.82))
      quality = 0.74
    }

    URL.revokeObjectURL(tempUrl)
    if (!blob) throw new Error('No s ha pogut comprimir la imatge')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'incident-image'}.jpg`, {
      type: 'image/jpeg',
    })
  }

  const handleImageChange = async (fileList: FileList | null) => {
    const selected = fileList ? Array.from(fileList) : []
    if (!selected.length) return

    const remainingSlots = MAX_IMAGES - images.length
    if (remainingSlots <= 0) {
      setImageError('Nomes pots adjuntar fins a 3 fotos.')
      return
    }

    const nextFiles = selected.slice(0, remainingSlots)

    try {
      const compressed = await Promise.all(
        nextFiles.map(async (file) => {
          if (!file.type.startsWith('image/')) {
            throw new Error('Nomes es permeten imatges.')
          }
          const optimized = await compressImage(file)
          if (optimized.size > MAX_SIZE) {
            throw new Error('Una imatge encara supera 1MB despres de comprimir-se.')
          }
          return {
            file: optimized,
            preview: URL.createObjectURL(optimized),
          }
        })
      )

      setImageError(
        selected.length > remainingSlots ? 'Nomes s han afegit les primeres 3 fotos.' : ''
      )
      setImages((current) => [...current, ...compressed].slice(0, MAX_IMAGES))
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Error preparant les imatges')
    }
  }

  const removeImage = (index: number) => {
    setImages((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
  }

  const uploadImagesIfNeeded = async () => {
    if (!images.length) return []

    const uploaded = await Promise.all(
      images.map(async (image) => {
        const form = new FormData()
        form.append('file', image.file)
        form.append('eventId', event.id)
        const res = await fetch('/api/incidents/upload-image', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json?.error || 'No s ha pogut pujar una de les imatges')
        }
        const json = await res.json()
        return {
          url: json.url || null,
          path: json.path || null,
          meta: json.meta || null,
        }
      })
    )

    return uploaded.filter((item) => item.url || item.path)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const uploadedImages = await uploadImagesIfNeeded()

      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          department,
          importance,
          description,
          respSala: userName,
          category,
          images: uploadedImages,
        }),
      })

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: '' }))
        throw new Error(msg || 'Error creant la incidencia')
      }

      onCreated()
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No s ha pogut crear la incidencia'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[92vw] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nova incidencia</DialogTitle>
          <DialogDescription>
            {event.summary.replace(/#.*$/, '').trim()} · {event.start.substring(0, 10)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block font-medium">Departament *</label>
            <select
              className="w-full rounded border p-2"
              value={department}
              onChange={(e) => {
                if (canPickDepartment) setDepartment(e.target.value)
              }}
              disabled={!canPickDepartment}
              required
            >
              {departmentOptions.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Categoria *</label>
            <select
              className="w-full rounded border p-2"
              value={category.id}
              onChange={(e) => {
                const selected = categories.find((c) => c.id === e.target.value)
                if (selected) setCategory(selected)
              }}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Importancia *</label>
            <select
              className="w-full rounded border p-2"
              value={importance}
              onChange={(e) => setImportance(e.target.value)}
              required
            >
              {IMPORTANCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Descripcio *</label>
            <textarea
              className="w-full rounded border p-2"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-500">Adjuntar fins a 3 fotos</label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Fitxer
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleImageChange(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    void handleImageChange(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <span className="text-xs text-gray-500">{images.length}/{MAX_IMAGES}</span>
              {imageError && <span className="text-sm text-red-600">{imageError}</span>}
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <div key={`${image.preview}-${index}`} className="relative overflow-hidden rounded-2xl border">
                    <img
                      src={image.preview}
                      alt={`Previsualitzacio ${index + 1}`}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" variant="primary" disabled={loading}>
            {loading ? 'Creant...' : 'Crear incidencia'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
