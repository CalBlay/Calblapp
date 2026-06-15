'use client'

import { Camera, Film } from 'lucide-react'
import TicketAttachmentTile from '@/components/maintenance/TicketAttachmentTile'

type Props = {
  label?: string
  hint?: string
  count: number
  maxVideos: number
  previewUrl?: string | null
  error?: string | null
  disabled?: boolean
  compressing?: boolean
  uploading?: boolean
  onFilesSelected: (files: FileList | null) => void | Promise<void>
  onClearPreview?: () => void
}

export default function MobileVideoPicker({
  label = 'Vídeo de visita',
  hint = 'Grava al lloc o tria un fitxer del telèfon.',
  count,
  maxVideos,
  previewUrl,
  error,
  disabled = false,
  compressing = false,
  uploading = false,
  onFilesSelected,
  onClearPreview,
}: Props) {
  const busy = compressing || uploading
  const atLimit = count >= maxVideos
  const blocked = atLimit || disabled || busy

  const handleChange = (files: FileList | null) => {
    void onFilesSelected(files)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">{label}</div>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {count}/{maxVideos}
        </span>
      </div>

      {!atLimit ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            className={`flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800 transition ${
              blocked ? 'pointer-events-none opacity-50' : 'hover:border-emerald-400 hover:bg-emerald-100'
            }`}
          >
            <Camera className="h-5 w-5 shrink-0" aria-hidden />
            Gravar vídeo
            <input
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              disabled={blocked}
              onChange={(e) => {
                handleChange(e.target.files)
                e.currentTarget.value = ''
              }}
            />
          </label>

          <label
            className={`flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition ${
              blocked ? 'pointer-events-none opacity-50' : 'hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Film className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            Triar fitxer
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={blocked}
              onChange={(e) => {
                handleChange(e.target.files)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ja has arribat al màxim de vídeos per aquest esdeveniment.
        </p>
      )}

      {busy ? (
        <p className="text-sm text-slate-600">
          {compressing ? 'Comprimint vídeo…' : 'Pujant vídeo…'}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <TicketAttachmentTile
            url={previewUrl}
            alt="Previsualització del vídeo"
            className="max-h-56 w-full object-contain"
          />
          {onClearPreview ? (
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white"
              onClick={onClearPreview}
            >
              Tancar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
