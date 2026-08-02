import { GOOGLE_PHOTOS_VIDEO_MIME, isGooglePhotosVideoUrl, normalizeGooglePhotosVideoRef } from '@/lib/googlePhotosVideoLink'
import { isTicketImageMime, isTicketVideoMime, isTicketVideoUrl } from '@/lib/media/ticketAttachments'

export type SpaceMediaKind = 'image' | 'video' | 'google-photos'

export type SpaceMediaItem = {
  kind: SpaceMediaKind
  url: string
  mimeType?: string | null
}

const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i

function cleanUrl(value: unknown): string {
  return String(value || '').trim()
}

function inferKind(url: string, mimeType?: string | null): SpaceMediaKind | null {
  const mime = String(mimeType || '').toLowerCase()
  if (mime === GOOGLE_PHOTOS_VIDEO_MIME || isGooglePhotosVideoUrl(url)) return 'google-photos'
  if (mime && isTicketVideoMime(mime)) return 'video'
  if (mime && isTicketImageMime(mime)) return 'image'
  if (isTicketVideoUrl(url)) return 'video'
  if (IMAGE_URL_PATTERN.test(url)) return 'image'
  if (/^https?:\/\//i.test(url)) return 'image'
  return null
}

function normalizeItem(raw: unknown): SpaceMediaItem | null {
  if (!raw || typeof raw !== 'object') {
    const url = cleanUrl(raw)
    if (!url) return null
    const kind = inferKind(url)
    return kind ? { kind, url } : null
  }

  const row = raw as Record<string, unknown>
  const url = cleanUrl(row.url)
  if (!url) return null

  const kindRaw = cleanUrl(row.kind).toLowerCase()
  const mimeType = row.mimeType == null ? null : String(row.mimeType)
  const kind =
    kindRaw === 'image' || kindRaw === 'video' || kindRaw === 'google-photos'
      ? (kindRaw as SpaceMediaKind)
      : inferKind(url, mimeType)

  if (!kind) return null
  return { kind, url, mimeType }
}

export function readSpaceMedia(produccio?: Record<string, unknown> | null): SpaceMediaItem[] {
  if (!produccio) return []

  if (Array.isArray(produccio.media)) {
    const items = produccio.media.map(normalizeItem).filter(Boolean) as SpaceMediaItem[]
    if (items.length) return items
  }

  const legacyImages = Array.isArray(produccio.images) ? produccio.images : []
  return legacyImages
    .map((entry) => normalizeItem({ kind: 'image', url: entry }))
    .filter(Boolean) as SpaceMediaItem[]
}

export function writeSpaceMediaPayload(media: SpaceMediaItem[]) {
  const cleaned = media
    .map((item) => ({
      kind: item.kind,
      url: cleanUrl(item.url),
      mimeType: item.mimeType ?? null,
    }))
    .filter((item) => item.url)

  return {
    media: cleaned,
    images: cleaned.filter((item) => item.kind === 'image').map((item) => item.url),
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parsePastedSpaceMediaUrl(text: string): SpaceMediaItem | null {
  const trimmed = cleanUrl(text)
  if (!trimmed || !isHttpUrl(trimmed)) return null

  const photos = normalizeGooglePhotosVideoRef(trimmed)
  if (photos) {
    return {
      kind: 'google-photos',
      url: photos.viewUrl,
      mimeType: GOOGLE_PHOTOS_VIDEO_MIME,
    }
  }

  if (isTicketVideoUrl(trimmed)) {
    return { kind: 'video', url: trimmed }
  }

  if (IMAGE_URL_PATTERN.test(trimmed) || isHttpUrl(trimmed)) {
    return { kind: 'image', url: trimmed }
  }

  return null
}

export function spaceMediaLabel(item: SpaceMediaItem): string {
  if (item.kind === 'google-photos') return 'Google Fotos'
  if (item.kind === 'video') return 'Vídeo'
  return 'Imatge'
}
