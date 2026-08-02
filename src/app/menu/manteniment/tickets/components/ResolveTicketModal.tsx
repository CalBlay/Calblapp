'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { usePendingImages } from '../../preventius/fulls/hooks/usePendingImages'
import type { Ticket } from '../types'

type Props = {
  ticket: Ticket
  busy?: boolean
  onClose: () => void
  onSubmit: (payload: {
    category: string
    note: string
    completionImages?: Array<{
      url?: string | null
      path?: string | null
      meta?: { size?: number; type?: string; name?: string } | null
    }>
  }) => void | Promise<void>
}

export default function ResolveTicketModal({ ticket, busy = false, onClose, onSubmit }: Props) {
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const {
    images,
    imageCount,
    imageError,
    handleImageChange,
    removeImage,
    clearImages,
    uploadImages,
  } = usePendingImages(3)

  useEffect(() => {
    setCategory(String(ticket.resolutionCategory || '').trim())
    setNote(String(ticket.resolutionNote || '').trim())
    clearImages()
  }, [clearImages, ticket.id, ticket.resolutionCategory, ticket.resolutionNote])

  useEffect(() => {
    let cancelled = false

    const loadCategories = async () => {
      try {
        const res = await fetch('/api/maintenance/data/resolution-categories', {
          cache: 'no-store',
        })
        const json = res.ok ? await res.json().catch(() => ({})) : {}
        if (cancelled) return
        const next = Array.isArray(json?.categories)
          ? json.categories
              .filter((item: { active?: boolean; name?: string }) => item?.active !== false)
              .map((item: { name?: string }) => String(item?.name || '').trim())
              .filter(Boolean)
          : []
        setCategoryOptions(next)
      } catch {
        if (!cancelled) setCategoryOptions([])
      }
    }

    void loadCategories()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async () => {
    const completionImages = imageCount > 0 ? await uploadImages() : []
    await onSubmit({
      category: category.trim(),
      note: note.trim(),
      completionImages,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6">
          <div>
            <div className="text-lg font-semibold text-slate-900">Resoldre ticket</div>
            <div className="mt-1 text-sm text-slate-500">
              {ticket.ticketCode || ticket.incidentNumber || 'TIC'} · {ticket.operatorTitle || ticket.description || ticket.location || 'Ticket'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
          >
            Tancar
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 md:px-6">
          <label className="block space-y-2 text-sm text-slate-700">
            <span className="font-medium">Categoria de resolució</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="maintenance-resolution-categories"
              placeholder="Ex.: consulta tancada, ajust intern, incidència menor..."
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900"
            />
            {categoryOptions.length > 0 ? (
              <datalist id="maintenance-resolution-categories">
                {categoryOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ) : null}
          </label>

          <label className="block space-y-2 text-sm text-slate-700">
            <span className="font-medium">Com s'ha tancat</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explica breument què s'ha fet per tancar el ticket."
              rows={5}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-800">Adjunts de resolucio</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pots adjuntar fins a 3 fitxers per deixar constancia del tancament.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                {imageCount}/3 nous
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
                Afegir foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={imageCount >= 3}
                  onChange={(e) => {
                    void handleImageChange(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50">
                Afegir fitxer
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  className="hidden"
                  disabled={imageCount >= 3}
                  onChange={(e) => {
                    void handleImageChange(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>

            {imageError ? <p className="text-sm text-red-600">{imageError}</p> : null}

            {images.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Pendents de pujar
                </div>
                <div className="space-y-2">
                  {images.map((item, index) => (
                    <div
                      key={`${item.file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 text-sm text-slate-700">
                        <div className="truncate font-medium">{item.file.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {item.kind === 'image' ? 'Foto' : item.kind === 'video' ? 'Video' : 'Fitxer'}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeImage(index)}
                        className="h-9 w-9 shrink-0 rounded-full"
                        aria-label={`Eliminar adjunt ${index + 1}`}
                        title="Eliminar adjunt"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
        </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700"
          >
            Cancel·lar
          </button>
          <button
            type="button"
            disabled={busy || !category.trim() || !note.trim()}
            onClick={() => void handleSubmit()}
            className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Resolent...' : 'Resoldre ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
