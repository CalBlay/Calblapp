export const MAX_TICKET_ATTACHMENTS = 3

export {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_INPUT_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/lib/media/compressVideoForUpload'

/** Límit d’upload si no es pot comprimir (fallback). */
export const MAX_UPLOAD_VIDEO_BYTES = 25 * 1024 * 1024

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|m4v)(\?|$)/i

export function isTicketImageMime(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/')
}

export function isTicketVideoMime(mime: string): boolean {
  const value = String(mime || '').toLowerCase()
  return value.startsWith('video/')
}

export function isTicketVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(String(url || '').trim())
}

export function extensionForVideoMime(mime: string): string {
  const value = String(mime || '').toLowerCase()
  if (value.includes('quicktime')) return 'mov'
  if (value.includes('webm')) return 'webm'
  if (value.includes('msvideo') || value.includes('avi')) return 'avi'
  return 'mp4'
}

export function formatTicketAttachmentLimitMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
