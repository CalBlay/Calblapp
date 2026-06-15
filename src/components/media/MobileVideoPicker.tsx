'use client'

import { useState } from 'react'
import { Camera, Film, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TicketAttachmentTile from '@/components/maintenance/TicketAttachmentTile'

type Props = {
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

const optionClass = (blocked: boolean) =>
  `flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition ${
    blocked
      ? 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400 opacity-50'
      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
  }`

export default function MobileVideoPicker({
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

  const pickFile = (files: FileList | null) => {
    void onFilesSelected(files)
  }

  const submitDrive = () => {
    const value = driveLink.trim()
    if (!value || !onDriveLinkSubmit) return
    void onDriveLinkSubmit(value)
    setDriveLink('')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {count}/{maxVideos}
        </span>
      </div>

      {!atLimit ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className={optionClass(blocked)}>
              <Camera className="h-5 w-5 text-emerald-600" aria-hidden />
              <span>1. Gravar</span>
              <input
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                disabled={blocked}
                onChange={(e) => {
                  pickFile(e.target.files)
                  e.currentTarget.value = ''
                }}
              />
            </label>

            <label className={optionClass(blocked)}>
              <Film className="h-5 w-5 text-slate-600" aria-hidden />
              <span>2. Adjuntar fitxer</span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={blocked}
                onChange={(e) => {
                  pickFile(e.target.files)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>

          {onDriveLinkSubmit ? (
            <div className="flex gap-2">
              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-700">
                <Link2 className="h-4 w-4 text-blue-600" aria-hidden />
                <span className="whitespace-nowrap">3. Google Drive</span>
              </div>
              <input
                type="url"
                inputMode="url"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="Enllaç Google Drive"
                disabled={blocked}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 px-3"
                disabled={blocked || !driveLink.trim()}
                onClick={submitDrive}
              >
                {linking ? '…' : 'OK'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Màxim de vídeos assolit.
        </p>
      )}

      {busy ? (
        <p className="text-xs text-slate-500">
          {compressing ? 'Comprimint…' : linking ? 'Adjuntant…' : 'Pujant…'}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black">
          <TicketAttachmentTile
            url={previewUrl}
            alt="Previsualització"
            className="max-h-48 w-full object-contain"
            lazyVideo={false}
          />
          {onClearPreview ? (
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
              onClick={onClearPreview}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
