'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { compressRasterImageForUpload } from '@/lib/file-optimization'
import {
  compressVideoForUpload,
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_INPUT_BYTES,
} from '@/lib/media/compressVideoForUpload'
import { MAX_UPLOAD_VIDEO_BYTES } from '@/lib/media/ticketAttachments'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { INCIDENT_ORIGIN_DEPARTMENTS } from '@/lib/incidentOriginDepartments'
import { incidentCategoryRequiresMedia } from '@/lib/incidentTypology'

interface CreateIncidentModalProps {
  open: boolean
  event: {
    id: string
    summary: string
    start: string
    location?: string
  }
  onClose: () => void
  onCreated: (incidentId?: string) => void
}

const IMPORTANCIES = ['Urgent', 'Alta', 'Normal', 'Baixa']
const MAX_IMAGES = 3
const MAX_SIZE = 1024 * 1024

type PendingImage = {
  file: File
  preview: string
}

const mobileFieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100'

const mobileSelectClass = `${mobileFieldClass} appearance-none bg-[linear-gradient(45deg,transparent_50%,#64748b_50%),linear-gradient(135deg,#64748b_50%,transparent_50%)] bg-[position:calc(100%-18px)_calc(50%-2px),calc(100%-12px)_calc(50%-2px)] bg-[size:6px_6px,6px_6px] bg-no-repeat pr-10`

const sortCategoriesByLabel = (items: Array<{ id: string; label: string }>) =>
  [...items].sort((a, b) => a.label.localeCompare(b.label, 'ca', { sensitivity: 'base' }))

export default function CreateIncidentModal({
  open,
  event,
  onClose,
  onCreated,
}: CreateIncidentModalProps) {
  const { data: session } = useSession()
  const userName = session?.user?.name ?? session?.user?.email ?? 'Desconegut'
  const userDepartmentRaw = session?.user?.department ?? ''
  const normalizedUserRole = (session?.user?.role ?? '').toLowerCase().trim()
  const normalizedUserDepartment =
    normalizedUserRole === 'comercial'
      ? 'Comercial'
      : userDepartmentRaw.trim() || INCIDENT_ORIGIN_DEPARTMENTS[0]
  const canPickDepartment = ['admin', 'direccio'].includes(normalizedUserRole)

  const [department, setDepartment] = useState(normalizedUserDepartment)
  const [importance, setImportance] = useState('Normal')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<{ id: string; label: string } | null>(null)
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
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
      setCategory(null)
      setImages((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.preview))
        return []
      })
      setImageError('')
      setError('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancel = false
    async function loadCategories() {
      setCategoriesLoading(true)
      try {
        const res = await fetch('/api/incidents/categories', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || 'Error categories'))
        const raw = Array.isArray(json.categories) ? json.categories : []
        const allCategories = sortCategoriesByLabel(
          raw.map((c: { id: string; label: string }) => ({
            id: String(c.id),
            label: String(c.label),
          }))
        )
        if (cancel) return
        setCategories(allCategories)
        setCategory((prev) => {
          if (prev && allCategories.some((x) => x.id === prev.id)) return prev
          return null
        })
      } catch {
        if (!cancel) {
          setCategories([])
          setCategory(null)
        }
      } finally {
        if (!cancel) setCategoriesLoading(false)
      }
    }
    void loadCategories()
    return () => {
      cancel = true
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
    const list: string[] = [...INCIDENT_ORIGIN_DEPARTMENTS]
    const norm = normalizedUserDepartment.trim()
    if (norm && !list.includes(norm)) {
      list.unshift(norm)
    }
    return list
  }, [normalizedUserDepartment])

  const requiresAttachment = category ? incidentCategoryRequiresMedia(category.id) : false

  const handleImageChange = async (fileList: FileList | null) => {
    const selected = fileList ? Array.from(fileList) : []
    if (!selected.length) return

    const remainingSlots = MAX_IMAGES - images.length
    if (remainingSlots <= 0) {
      setImageError('Nomes pots adjuntar fins a 3 imatges o videos.')
      return
    }

    const nextFiles = selected.slice(0, remainingSlots)

    try {
      const compressed = await Promise.all(
        nextFiles.map(async (file) => {
          if (file.type.startsWith('video/')) {
            if (file.size > MAX_VIDEO_INPUT_BYTES) {
              throw new Error('El video supera el limit de 80 MB abans de comprimir.')
            }
            const optimizedVideo = await compressVideoForUpload(
              file,
              DEFAULT_MAX_VIDEO_UPLOAD_BYTES
            )
            if (optimizedVideo.size > MAX_UPLOAD_VIDEO_BYTES) {
              throw new Error('El video comprimit encara supera el limit de 25 MB.')
            }
            return {
              file: optimizedVideo,
              preview: URL.createObjectURL(optimizedVideo),
            }
          }
          if (!file.type.startsWith('image/')) {
            throw new Error('Nomes es permeten imatges o videos.')
          }
          const optimized = await compressRasterImageForUpload(file, MAX_SIZE)
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
        selected.length > remainingSlots ? 'Nomes s han afegit els primers 3 adjunts.' : ''
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
          throw new Error(json?.error || 'No s ha pogut pujar un dels adjunts')
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
    if (!category) {
      setError('Selecciona una categoria')
      return
    }
    if (requiresAttachment && images.length === 0) {
      setError('Les incidències de Maquinària (2XX) i Deco (4XX) requereixen adjuntar com a mínim una imatge o un vídeo.')
      return
    }
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

      const json = await res.json().catch(() => ({}))
      onCreated(typeof json?.id === 'string' ? json.id : undefined)
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
      <DialogContent
        className="flex max-h-[min(88dvh,100svh)] w-[94vw] max-w-sm flex-col overflow-hidden rounded-2xl p-0"
        lockDismissOnOutside
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="px-4 pt-4 text-base font-semibold text-slate-900">Nova incidencia</DialogTitle>
          <DialogDescription className="px-4 pb-3 text-xs leading-5 text-slate-500">
            {event.summary.replace(/#.*$/, '').trim()} · {event.start.substring(0, 10)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className={cn('flex min-h-0 flex-1 flex-col', typography('bodySm'))}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Departament *</label>
              <select
                className={mobileSelectClass}
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

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Categoria *</label>
              <select
                className={mobileSelectClass}
                value={category?.id || ''}
                onChange={(e) => {
                  const selected = categories.find((c) => c.id === e.target.value)
                  setCategory(selected || null)
                }}
                required
                disabled={categoriesLoading || categories.length === 0}
              >
                {categoriesLoading ? (
                  <option value="">Carregant…</option>
                ) : categories.length === 0 ? (
                  <option value="">No hi ha categories</option>
                ) : (
                  <>
                    <option value="">Selecciona categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {category?.label ? (
                <p className="text-[11px] leading-4 text-slate-500">
                  Seleccionada: <span className="font-medium text-slate-700">{category.label}</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Importancia *</label>
              <select
                className={mobileSelectClass}
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

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Descripcio *</label>
              <textarea
                className={cn(mobileFieldClass, 'min-h-[108px] resize-none')}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className={typography('bodyXs')}>
                  {requiresAttachment ? 'Adjuntar imatge o vídeo *' : 'Adjuntar fins a 3 imatges o vídeos'}
                </label>
                <label
                  className={cn(
                    'min-h-[44px] cursor-pointer rounded-full border px-4 py-2',
                    typography('bodySm')
                  )}
                >
                  Fitxers
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleImageChange(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
                <label
                  className={cn(
                    'min-h-[44px] cursor-pointer rounded-full border px-4 py-2',
                    typography('bodySm')
                  )}
                >
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
                <span className={typography('bodyXs')}>
                  {images.length}/{MAX_IMAGES}
                </span>
                {imageError && <span className={cn(typography('bodySm'), 'text-red-600')}>{imageError}</span>}
              </div>
              <p className={cn(typography('bodyXs'), 'text-slate-500')}>
                Pots seleccionar diversos fitxers alhora des del dispositiu.
              </p>
              {requiresAttachment && images.length === 0 ? (
                <p className={cn(typography('bodyXs'), 'text-amber-700')}>
                  Obligatori per incidències de maquinària (2XX) i Deco (4XX).
                </p>
              ) : null}

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((image, index) => (
                    <div key={`${image.preview}-${index}`} className="relative overflow-hidden rounded-2xl border">
                      {image.file.type.startsWith('video/') ? (
                        <video
                          src={image.preview}
                          className="h-28 w-full object-cover"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <Image
                          src={image.preview}
                          alt={`Previsualitzacio ${index + 1}`}
                          width={448}
                          height={112}
                          className="h-28 w-full object-cover"
                          unoptimized
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className={cn(
                          'absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-white',
                          typography('bodyXs')
                        )}
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className={cn(typography('bodySm'), 'text-red-600')}>{error}</p>}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={onClose}>
                Cancel·lar
              </Button>
              <Button
                type="submit"
                className="w-full"
                variant="primary"
                disabled={loading || !category || categoriesLoading || (requiresAttachment && images.length === 0)}
              >
                {loading ? 'Creant...' : 'Crear incidencia'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
