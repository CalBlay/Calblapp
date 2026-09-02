/** Storage object basename for a Zoho attachment (GCS / Firebase Storage). */
export function sanitizeStorageName(raw?: string | null): string {
  const value = String(raw || '').trim()
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || `attachment-${Date.now()}`
}

/** Parse Content-Disposition from Zoho binary download responses. */
export function extractFileNameFromContentDisposition(headerValue: string | null): string {
  const value = String(headerValue || '').trim()
  if (!value) return ''

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim()
    } catch {
      return utf8Match[1].trim()
    }
  }

  const quotedMatch = value.match(/filename=\"([^\"]+)\"/i)
  if (quotedMatch?.[1]) return quotedMatch[1].trim()

  const plainMatch = value.match(/filename=([^;]+)/i)
  return plainMatch?.[1]?.trim() || ''
}
