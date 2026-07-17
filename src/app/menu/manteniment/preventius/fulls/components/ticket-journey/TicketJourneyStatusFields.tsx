'use client'

import { Camera, FileText, ImagePlus, Paperclip } from 'lucide-react'
import type { JourneyStatus } from '@/lib/maintenanceJourneyStatus'
import type { PendingImage } from '../../hooks/usePendingImages'

const timeInputClass =
  'mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-base touch-manipulation'

type StoredAttachment = {
  url?: string | null
  path?: string | null
  meta?: { size?: number; type?: string; name?: string } | null
}

type Props = {
  nextStatus: JourneyStatus
  horaInici: string
  horaFi: string
  openSegmentDateLabel?: string
  note: string
  showPhotos: boolean
  existingCompletionAttachments: StoredAttachment[]
  pendingAttachments: PendingImage[]
  imageCount: number
  maxCompletionImages: number
  imageError: string | null
  onHoraIniciChange: (value: string) => void
  onHoraFiChange: (value: string) => void
  onNoteChange: (value: string) => void
  onImageChange: (files: FileList | null) => void | Promise<void>
  onRemoveImage: (index: number) => void
}

function isStoredImage(item: StoredAttachment) {
  return String(item.meta?.type || '').toLowerCase().startsWith('image/')
}

function storedAttachmentName(item: StoredAttachment, index: number) {
  return String(item.meta?.name || '').trim() || `Adjunt ${index + 1}`
}

export default function TicketJourneyStatusFields({
  nextStatus,
  horaInici,
  horaFi,
  openSegmentDateLabel,
  note,
  showPhotos,
  existingCompletionAttachments,
  pendingAttachments,
  imageCount,
  maxCompletionImages,
  imageError,
  onHoraIniciChange,
  onHoraFiChange,
  onNoteChange,
  onImageChange,
  onRemoveImage,
}: Props) {
  const atLimit = imageCount >= maxCompletionImages
  const notePlaceholder =
    nextStatus === 'no_fet'
      ? 'Motiu obligatori'
      : nextStatus === 'espera'
        ? 'Explica el motiu de la pausa'
        : 'Opcional'

  return (
    <div className="space-y-4">
      {openSegmentDateLabel ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Tram obert del dia <span className="font-semibold text-slate-900">{openSegmentDateLabel}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-gray-700">
          Hora inici
          <input
            type="time"
            className={timeInputClass}
            value={horaInici}
            onChange={(e) => onHoraIniciChange(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Hora fi
          <input
            type="time"
            className={timeInputClass}
            value={horaFi}
            onChange={(e) => onHoraFiChange(e.target.value)}
          />
        </label>
      </div>

      <label className="block text-sm text-gray-700">
        Observacions
        <textarea
          className="mt-2 min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base touch-manipulation"
          rows={4}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={notePlaceholder}
        />
      </label>

      {showPhotos ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-gray-700">Adjunts de l&apos;operari</div>
              <p className="mt-0.5 text-xs text-slate-500">
                Pots adjuntar fotos o fitxers. Maxim {maxCompletionImages}.
              </p>
              {nextStatus === 'fet' ? (
                <p className="mt-1 text-xs text-amber-700">
                  Per marcar Fet cal pujar com a minim una foto o fitxer nou. Les fotos del ticket
                  o adjunts d&apos;un operari anterior no compten.
                </p>
              ) : null}
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {imageCount}/{maxCompletionImages}
            </span>
          </div>

          {existingCompletionAttachments.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Ja pujats anteriorment
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {existingCompletionAttachments.map((item, index) => {
                  const url = String(item.url || '').trim()
                  if (!url) return null
                  if (isStoredImage(item)) {
                    return (
                      <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={storedAttachmentName(item, index)}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </a>
                    )
                  }

                  return (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                      <span className="truncate">{storedAttachmentName(item, index)}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label
              className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition ${
                atLimit ? 'pointer-events-none opacity-50' : 'hover:border-emerald-400 hover:bg-emerald-50'
              }`}
            >
              <Camera className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Fer foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={atLimit}
                onChange={(e) => {
                  void onImageChange(e.target.files)
                  e.currentTarget.value = ''
                }}
              />
            </label>

            <label
              className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition ${
                atLimit ? 'pointer-events-none opacity-50' : 'hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <ImagePlus className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
              Galeria
              <input
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                className="hidden"
                disabled={atLimit}
                onChange={(e) => {
                  void onImageChange(e.target.files)
                  e.currentTarget.value = ''
                }}
              />
            </label>

            <label
              className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition ${
                atLimit ? 'pointer-events-none opacity-50' : 'hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Paperclip className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
              Fitxer
              <input
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                className="hidden"
                disabled={atLimit}
                onChange={(e) => {
                  void onImageChange(e.target.files)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>

          {imageError ? <p className="text-sm text-red-600">{imageError}</p> : null}

          {pendingAttachments.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Pendents de pujar
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pendingAttachments.map((item, index) => (
                  <div
                    key={`${item.file.name}-${index}`}
                    className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    {item.kind === 'image' && item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex min-h-[96px] items-center gap-3 px-4 py-3 text-sm text-slate-700">
                        <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.file.name}</div>
                          <div className="text-xs text-slate-500">
                            {item.kind === 'video' ? 'Video' : 'Fitxer'}
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow"
                      onClick={() => onRemoveImage(index)}
                      aria-label={`Eliminar adjunt ${index + 1}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
