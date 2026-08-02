'use client'

import { isGooglePhotosVideoRef } from '@/lib/googlePhotosVideoLink'
import { isTicketVideoMime } from '@/lib/media/ticketAttachments'
import {
  readSpaceMedia,
  spaceMediaLabel,
  type SpaceMediaItem,
} from '@/lib/spaces/spaceMedia'
import { cn } from '@/lib/utils'
import { Video } from 'lucide-react'

type Props = {
  produccio?: Record<string, unknown> | null
  className?: string
}

function isVideoItem(item: SpaceMediaItem): boolean {
  if (item.kind === 'video' || item.kind === 'google-photos') return true
  if (item.mimeType && isTicketVideoMime(item.mimeType)) return true
  return isGooglePhotosVideoRef(item.url)
}

function MediaTile({ item }: { item: SpaceMediaItem }) {
  const label = spaceMediaLabel(item)
  const isPhotos = item.kind === 'google-photos' || isGooglePhotosVideoRef(item.url)
  const isVideo = !isPhotos && isVideoItem(item)

  const shellClass =
    'group relative block h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition hover:border-slate-300 hover:shadow'

  const labelBar = (
    <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-medium text-white">
      {label}
    </span>
  )

  if (isPhotos) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={shellClass}
        title={`Obrir ${label}`}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-blue-50 px-2 text-center">
          <Video className="h-6 w-6 text-blue-600" aria-hidden />
          <span className="text-[11px] font-semibold text-blue-800">Google Fotos</span>
        </div>
        {labelBar}
      </a>
    )
  }

  if (isVideo) {
    return (
      <div className={shellClass} title={label}>
        <video
          src={item.url}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
        {labelBar}
      </div>
    )
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={shellClass}
      title={`Obrir ${label}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="" className="h-full w-full object-cover" />
      {labelBar}
    </a>
  )
}

export default function SpaceMediaGallery({ produccio, className }: Props) {
  const media = readSpaceMedia(produccio)
  if (!media.length) return null

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm', className)}>
      <h2 className="mb-3 text-sm font-semibold text-gray-800">Fotos i vídeos</h2>
      <div className="flex flex-wrap gap-3">
        {media.map((item, index) => (
          <MediaTile key={`${item.url}-${index}`} item={item} />
        ))}
      </div>
    </div>
  )
}
