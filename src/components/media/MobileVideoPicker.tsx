'use client'

import { useState } from 'react'
import { Film, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  linking?: boolean
  onFilesSelected: (files: FileList | null) => void | Promise<void>
  onDriveLinkSubmit?: (url: string) => void | Promise<void>
  onClearPreview?: () => void
}

export default function MobileVideoPicker({
  label = 'Vídeo de visita',
  hint = 'Adjunta un fitxer de vídeo o enganxa un enllaç de Google Drive.',
  count,
  maxVideos,
  previewUrl,
  error,
  disabled = false,
  compressing = false,
  uploading = false,
  linking = false,
  onFilesSelected,
  onDriveLinkSubmit,
  onClearPreview,
}: Props) {
  const [driveLink, setDriveLink] = useState('')
  const busy = compressing || uploading || linking
  const atLimit = count >= maxVideos
  const blocked = atLimit || disabled || busy

  const handleChange = (files: FileList | null) => {
    void onFilesSelected(files)
  }

  const handleDriveSubmit = () => {
    const value = driveLink.trim()
    if (!value || !onDriveLinkSubmit) return
    void onDriveLinkSubmit(value)
    setDriveLink('')
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
        <div className="space-y-3">
          <label
            className={`flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition ${
              blocked ? 'pointer-events-none opacity-50' : 'hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <Film className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            Triar vídeo del telèfon
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

          {onDriveLinkSubmit ? (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                Enllaç de Google Drive
              </div>
              <input
                type="url"
                inputMode="url"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                disabled={blocked}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={blocked || !driveLink.trim()}
                onClick={handleDriveSubmit}
              >
                {linking ? 'Adjuntant enllaç…' : 'Adjuntar enllaç'}
              </Button>
              <p className="text-xs text-slate-500">
                El fitxer ha de ser un vídeo compartit (com a mínim «qualsevol amb l’enllaç»).
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ja has arribat al màxim de vídeos per aquest esdeveniment.
        </p>
      )}

      {busy ? (
        <p className="text-sm text-slate-600">
          {compressing ? 'Comprimint vídeo…' : linking ? 'Adjuntant enllaç…' : 'Pujant vídeo…'}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <TicketAttachmentTile
            url={previewUrl}
            alt="Previsualització del vídeo"
            className="max-h-56 w-full object-contain"
            lazyVideo={false}
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
