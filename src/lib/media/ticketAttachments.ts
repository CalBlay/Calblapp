export const MAX_TICKET_ATTACHMENTS = 3
export const MAX_UPLOAD_DOCUMENT_BYTES = 10 * 1024 * 1024

export {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_INPUT_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/lib/media/compressVideoForUpload'

/** Límit d’upload si no es pot comprimir (fallback). */
export const MAX_UPLOAD_VIDEO_BYTES = 25 * 1024 * 1024

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|m4v)(\?|$)/i
const DOCUMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|txt)(\?|$)/i
const DOCUMENT_MIME_SET = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

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

export function isTicketDocumentMime(mime: string): boolean {
  return DOCUMENT_MIME_SET.has(String(mime || '').toLowerCase())
}

export function isTicketDocumentName(name: string): boolean {
  return DOCUMENT_EXTENSIONS.test(String(name || '').trim().toLowerCase())
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
