'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Play } from 'lucide-react'
import { isTicketVideoMime, isTicketVideoUrl } from '@/lib/media/ticketAttachments'

type Props = {
  url: string
  alt?: string
  className?: string
  videoClassName?: string
  imageClassName?: string
  mimeType?: string | null
  /** Per defecte: lazy per URLs remotes; immediat per blob: (previsualització local). */
  lazyVideo?: boolean
}

function isVideoAttachment(url: string, mimeType?: string | null): boolean {
  if (mimeType && isTicketVideoMime(mimeType)) return true
  return isTicketVideoUrl(url)
}

function LazyVideoPlayer({
  url,
  alt,
  className,
}: {
  url: string
  alt: string
  className: string
}) {
  const [active, setActive] = useState(false)

  if (active) {
    return (
      <video
        key="player"
        src={url}
        controls
        playsInline
        preload="metadata"
        autoPlay
        className={className}
      />
    )
  }

  return (
    <button
      key="preview"
      type="button"
      onClick={() => setActive(true)}
      className={`flex min-h-[7rem] w-full flex-col items-center justify-center gap-2 bg-slate-900 text-white transition hover:bg-slate-800 ${className}`}
      aria-label={`Reproduir ${alt}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
        <Play className="h-6 w-6 shrink-0 fill-current" aria-hidden />
      </span>
      <span className="text-xs font-medium text-white/90">Reproduir vídeo</span>
    </button>
  )
}

export default function TicketAttachmentTile({
  url,
  alt = 'Adjunt del ticket',
  className = 'max-h-36 w-auto max-w-full object-contain',
  videoClassName,
  imageClassName,
  mimeType,
  lazyVideo,
}: Props) {
  const videoClass = videoClassName || className

  if (isVideoAttachment(url, mimeType)) {
    const isLocalPreview = url.startsWith('blob:')
    const shouldLazy = lazyVideo ?? !isLocalPreview

    if (!shouldLazy) {
      return (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className={videoClass}
        />
      )
    }

    return <LazyVideoPlayer url={url} alt={alt} className={videoClass} />
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={640}
      height={360}
      loading="lazy"
      className={imageClassName || className}
      unoptimized
    />
  )
}
