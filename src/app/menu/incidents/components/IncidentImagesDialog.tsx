'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { ImageOff, Paperclip } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Incident } from '@/hooks/useIncidents'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { isTicketVideoUrl } from '@/lib/media/ticketAttachments'

interface Props {
  incident: Incident | null
  open: boolean
  onClose: () => void
}

export default function IncidentImagesDialog({ incident, open, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<NonNullable<Incident['images']>>([])

  useEffect(() => {
    if (!open || !incident?.id) return

    let cancelled = false
    const incidentId = incident.id

    async function loadImages() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/incidents/${incidentId}`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || 'Error carregant adjunts'))
        if (cancelled) return

        const nextImages = Array.isArray(json?.incident?.images)
          ? json.incident.images.filter(
              (image: { url?: string | null; path?: string | null; missing?: boolean }) =>
                image?.url || image?.path || image?.missing
            )
          : []
        setImages(nextImages)
      } catch (err) {
        if (!cancelled) {
          setImages([])
          setError(err instanceof Error ? err.message : 'Error carregant adjunts')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadImages()

    return () => {
      cancelled = true
    }
  }, [open, incident?.id])

  useEffect(() => {
    if (!open) {
      setLoading(false)
      setError('')
      setImages([])
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-slate-600" />
            <span>{incident?.incidentNumber || 'Adjunts incidència'}</span>
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {[incident?.eventTitle, incident?.description].filter(Boolean).join(' · ') || 'Adjunts de la incidència'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className={cn('py-10 text-center text-slate-500', typography('bodySm'))}>
            Carregant adjunts…
          </p>
        ) : error ? (
          <p className={cn('py-10 text-center text-red-600', typography('bodySm'))}>{error}</p>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
            <ImageOff className="h-8 w-8" />
            <p className={typography('bodySm')}>No hi ha adjunts disponibles en aquesta incidència.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => (
              <div
                key={`${image.url || image.path || 'image'}-${index}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-slate-100">
                  {image.url ? (
                    String(image.meta?.type || '').startsWith('video/') || isTicketVideoUrl(image.url) ? (
                      <video
                        src={image.url}
                        className="h-full w-full object-cover"
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <a href={image.url} target="_blank" rel="noreferrer" className="block h-full w-full">
                        <Image
                          src={image.url}
                          alt={`Foto incidència ${index + 1}`}
                          className="h-full w-full object-cover"
                          width={800}
                          height={600}
                          unoptimized
                        />
                      </a>
                    )
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
                      <ImageOff className="h-8 w-8" />
                      <span className={typography('bodyXs')}>
                        Aquesta foto ja no existeix al bucket o no es pot recuperar.
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-500">
                  <span>Adjunt {index + 1}</span>
                  {typeof image.meta?.size === 'number' ? (
                    <span>{Math.round(image.meta.size / 1024)} KB</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
