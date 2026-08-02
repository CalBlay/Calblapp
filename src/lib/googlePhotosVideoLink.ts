/** Enllaços de vídeos compartits des de Google Fotos. */
export const GOOGLE_PHOTOS_VIDEO_MIME = 'video/google-photos-link'

function parseUrl(input: string): URL | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return null
  }
}

export function isGooglePhotosVideoUrl(input: string): boolean {
  const raw = String(input || '').trim()
  if (!raw) return false
  if (raw.startsWith('photos:')) return isGooglePhotosVideoUrl(raw.slice('photos:'.length))

  const url = parseUrl(raw)
  if (!url) return false

  const host = url.hostname.toLowerCase()
  if (host === 'photos.app.goo.gl') return true
  if (host === 'photos.google.com' || host.endsWith('.photos.google.com')) return true

  return false
}

export function normalizeGooglePhotosVideoRef(
  input: string
): { ref: string; viewUrl: string } | null {
  const raw = String(input || '').trim()
  if (!raw) return null

  const candidate = raw.startsWith('photos:') ? raw.slice('photos:'.length).trim() : raw
  if (!isGooglePhotosVideoUrl(candidate)) return null

  const url = parseUrl(candidate)
  if (!url) return null

  const viewUrl = url.href
  return { ref: viewUrl, viewUrl }
}

export function isGooglePhotosVideoRef(value: string): boolean {
  return isGooglePhotosVideoUrl(value)
}

export function googlePhotosVideoViewUrl(value: string): string | null {
  return normalizeGooglePhotosVideoRef(value)?.viewUrl ?? null
}
