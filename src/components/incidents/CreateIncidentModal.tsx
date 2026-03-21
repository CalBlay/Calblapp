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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')

  useEffect(() => {
    setDepartment(normalizedUserDepartment)
  }, [normalizedUserDepartment])

  useEffect(() => {
    if (!open) {
      setImportance('Normal')
      setDescription('')
      setCategory(categories[0])
      setImageFile(null)
      setImagePreview(null)
      setImageError('')
      setError('')
    }
  }, [open])

  const departmentOptions = React.useMemo(() => {
    const list = [...DEPARTAMENTS]
    if (!list.includes(normalizedUserDepartment)) {
      list.unshift(normalizedUserDepartment)
    }
    return list
  }, [normalizedUserDepartment])

  const handleImageChange = (file: File | null) => {
    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      setImageError('')
      return
    }
    if (file.size > 1024 * 1024) {
      setImageFile(null)
      setImagePreview(null)
      setImageError('La imatge supera 1MB. Fes-la mes petita.')
      return
    }
    setImageError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const uploadImageIfNeeded = async () => {
    if (!imageFile) return { url: null, path: null, meta: null }
    const form = new FormData()
    form.append('file', imageFile)
    form.append('eventId', event.id)
    const res = await fetch('/api/incidents/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error || 'No s ha pogut pujar la imatge')
    }
    const json = await res.json()
    return { url: json.url || null, path: json.path || null, meta: json.meta || null }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const image = await uploadImageIfNeeded()

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
          imageUrl: image.url,
          imagePath: image.path,
          imageMeta: image.meta,
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
              <label className="text-sm text-gray-500">Adjuntar</label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Fitxer
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                />
              </label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                />
              </label>
              {imageError && <span className="text-sm text-red-600">{imageError}</span>}
            </div>

            {imagePreview && (
              <img
                src={imagePreview}
                alt="Previsualitzacio"
                className="max-h-56 w-full rounded-2xl object-cover"
              />
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
