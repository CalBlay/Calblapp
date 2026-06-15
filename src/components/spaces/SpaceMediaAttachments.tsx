'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Film, ImageIcon, Link2, Trash2, Video } from 'lucide-react'
import TicketAttachmentTile from '@/components/maintenance/TicketAttachmentTile'
import { Button } from '@/components/ui/button'
import { useSpaceMediaUpload } from '@/hooks/spaces/useSpaceMediaUpload'
import {
  isGooglePhotosVideoRef,
} from '@/lib/googlePhotosVideoLink'
import { isTicketVideoMime } from '@/lib/media/ticketAttachments'
import {
  parsePastedSpaceMediaUrl,
  spaceMediaLabel,
  type SpaceMediaItem,
} from '@/lib/spaces/spaceMedia'
import { cn } from '@/lib/utils'

type Props = {
  fincaId?: string
  media: SpaceMediaItem[]
  canEdit: boolean
  onChange: (media: SpaceMediaItem[]) => void
}

const optionClass = (blocked: boolean) =>
  cn(
    'flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition',
    blocked
      ? 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400 opacity-50'
      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
  )

function isVideoItem(item: SpaceMediaItem): boolean {
  if (item.kind === 'video' || item.kind === 'google-photos') return true
  if (item.mimeType && isTicketVideoMime(item.mimeType)) return true
  return isGooglePhotosVideoRef(item.url)
}

function MediaPreview({ item }: { item: SpaceMediaItem }) {
  if (item.kind === 'google-photos' || isGooglePhotosVideoRef(item.url)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-blue-50 px-2 text-center text-[11px] font-medium text-blue-700">
        <Video className="h-5 w-5" aria-hidden />
        <span>Google Fotos</span>
      </div>
    )
  }

  if (isVideoItem(item)) {
    return (
      <TicketAttachmentTile
        url={item.url}
        alt="Vídeo de l espai"
        mimeType={item.mimeType}
        className="h-full w-full object-cover"
        videoClassName="h-full w-full object-cover"
        lazyVideo={false}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" className="h-full w-full object-cover" />
  )
}

export default function SpaceMediaAttachments({
  fincaId,
  media,
  canEdit,
  onChange,
}: Props) {
  const [linkInput, setLinkInput] = useState('')

  const addItem = useCallback(
    (item: SpaceMediaItem) => {
      if (media.some((entry) => entry.url === item.url)) return
      onChange([...media, item])
    },
    [media, onChange]
  )

  const {
    busy,
    compressing,
    uploading,
    error,
    setError,
    handleImageSelected,
    handleVideoSelected,
    handlePastedFile,
    attachLink,
  } = useSpaceMediaUpload({
    fincaId,
    onUploaded: addItem,
  })

  const removeItem = (index: number) => {
    onChange(media.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (!canEdit) return

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items?.length) return

      for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          event.preventDefault()
          const file = item.getAsFile()
          if (file) void handlePastedFile(file)
          return
        }
      }

      const text = event.clipboardData?.getData('text')?.trim()
      if (!text) return
      const parsed = parsePastedSpaceMediaUrl(text)
      if (!parsed) return
      event.preventDefault()
      addItem(parsed)
      setLinkInput('')
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addItem, canEdit, handlePastedFile])

  const blocked = !canEdit || busy || !fincaId

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {media.map((item, index) => {
          const showOpenLink = item.kind === 'image' || item.kind === 'google-photos'
          return (
          <div
            key={`${item.url}-${index}`}
            className="group relative h-24 w-24 overflow-hidden rounded-xl border bg-gray-100"
          >
            <MediaPreview item={item} />
            <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-medium text-white">
              {spaceMediaLabel(item)}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  removeItem(index)
                }}
                className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white opacity-90 hover:bg-black/80"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
            {showOpenLink ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-[1]"
                aria-label={`Obrir ${spaceMediaLabel(item)}`}
              />
            ) : null}
          </div>
          )
        })}

        {media.length === 0 ? (
          <p className="text-xs text-gray-400">
            Encara no hi ha fotos ni vídeos. Afegeix imatges, grava o adjunta vídeos, o enganxa un
            enllaç de Google Fotos.
          </p>
        ) : null}
      </div>

      {canEdit ? (
        <div
          className="space-y-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            if (!canEdit || blocked) return
            const file = event.dataTransfer.files?.[0]
            if (file) void handlePastedFile(file)
          }}
        >
          {!fincaId ? (
            <p className="text-sm text-amber-800">
              Desa l&apos;espai abans de pujar fitxers. Pots enganxar enllaços i es desaran amb la
              fitxa.
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Imatges
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className={optionClass(blocked)}>
                <ImageIcon className="h-5 w-5 text-emerald-600" aria-hidden />
                <span>Adjuntar imatge</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={blocked}
                  onChange={(e) => {
                    void handleImageSelected(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <div
                className={cn(
                  optionClass(blocked),
                  'col-span-1 sm:col-span-2 cursor-default hover:bg-white'
                )}
              >
                <span className="text-gray-600">Arrossega, clica o Ctrl+V</span>
                <span className="font-normal text-gray-400">També URL d&apos;imatge</span>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Vídeos
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className={optionClass(blocked)}>
                <Camera className="h-5 w-5 text-emerald-600" aria-hidden />
                <span>Gravar vídeo</span>
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  disabled={blocked}
                  onChange={(e) => {
                    void handleVideoSelected(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <label className={optionClass(blocked)}>
                <Film className="h-5 w-5 text-slate-600" aria-hidden />
                <span>Adjuntar vídeo</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={blocked}
                  onChange={(e) => {
                    void handleVideoSelected(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Link2 className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              Enllaç (Google Fotos, imatge o vídeo)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                inputMode="url"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="https://photos.app.goo.gl/..."
                disabled={!canEdit || busy}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={!canEdit || busy || !linkInput.trim()}
                onClick={() => {
                  attachLink(linkInput)
                  setLinkInput('')
                }}
              >
                Afegir enllaç
              </Button>
            </div>
          </div>

          {busy ? (
            <p className="text-xs text-slate-500">
              {compressing ? 'Comprimint…' : 'Pujant…'}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
