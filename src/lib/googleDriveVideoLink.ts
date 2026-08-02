/** Referència interna i enllaços públics de vídeos allotjats a Google Drive. */
export const GOOGLE_DRIVE_VIDEO_MIME = 'video/google-drive-link'

export function extractGoogleDriveFileId(input: string): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null

  if (raw.startsWith('drive:')) {
    const id = raw.slice('drive:'.length).trim()
    return id || null
  }

  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (!host.includes('google.com')) return null

    const pathMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(url.pathname)
    if (pathMatch?.[1]) return pathMatch[1]

    const idParam = url.searchParams.get('id')
    if (idParam) return idParam.trim() || null
  } catch {
    return null
  }

  return null
}

export function normalizeGoogleDriveVideoRef(
  input: string
): { ref: string; viewUrl: string } | null {
  const id = extractGoogleDriveFileId(input)
  if (!id) return null
  return {
    ref: `drive:${id}`,
    viewUrl: `https://drive.google.com/file/d/${id}/view`,
  }
}

export function isGoogleDriveVideoRef(value: string): boolean {
  return extractGoogleDriveFileId(value) !== null
}

export function googleDriveVideoViewUrl(value: string): string | null {
  return normalizeGoogleDriveVideoRef(value)?.viewUrl ?? null
}
