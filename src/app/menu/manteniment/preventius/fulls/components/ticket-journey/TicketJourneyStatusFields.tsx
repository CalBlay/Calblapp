'use client'

import MobileImagePicker from '@/app/menu/manteniment/components/MobileImagePicker'
import type { JourneyStatus } from '@/lib/maintenanceJourneyStatus'

const timeInputClass =
  'mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-base touch-manipulation'

type Props = {
  nextStatus: JourneyStatus
  horaInici: string
  horaFi: string
  note: string
  showPhotos: boolean
  existingImages: string[]
  previews: string[]
  imageCount: number
  maxCompletionImages: number
  imageError: string | null
  onHoraIniciChange: (value: string) => void
  onHoraFiChange: (value: string) => void
  onNoteChange: (value: string) => void
  onImageChange: (files: FileList | null) => void | Promise<void>
  onRemoveImage: (index: number) => void
}

export default function TicketJourneyStatusFields({
  nextStatus,
  horaInici,
  horaFi,
  note,
  showPhotos,
  existingImages,
  previews,
  imageCount,
  maxCompletionImages,
  imageError,
  onHoraIniciChange,
  onHoraFiChange,
  onNoteChange,
  onImageChange,
  onRemoveImage,
}: Props) {
  return (
    <div className="space-y-4">
      {existingImages.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Fotos del ticket</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {existingImages.map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Foto ticket ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover"
                />
              </a>
            ))}
          </div>
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
          placeholder={nextStatus === 'no_fet' ? 'Motiu obligatori' : 'Opcional'}
        />
      </label>

      {showPhotos ? (
        <MobileImagePicker
          label="Fotos feina feta"
          count={imageCount}
          maxImages={maxCompletionImages}
          previews={previews}
          error={imageError}
          onFilesSelected={onImageChange}
          onRemove={onRemoveImage}
        />
      ) : null}
    </div>
  )
}
