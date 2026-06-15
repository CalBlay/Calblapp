'use client'

import Image from 'next/image'
import { isTicketVideoUrl } from '@/lib/media/ticketAttachments'

type Props = {
  url: string
  alt?: string
  className?: string
  videoClassName?: string
  imageClassName?: string
}

export default function TicketAttachmentTile({
  url,
  alt = 'Adjunt del ticket',
  className = 'max-h-36 w-auto max-w-full object-contain',
  videoClassName,
  imageClassName,
}: Props) {
  if (isTicketVideoUrl(url)) {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className={videoClassName || className}
      />
    )
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={640}
      height={360}
      className={imageClassName || className}
      unoptimized
    />
  )
}
