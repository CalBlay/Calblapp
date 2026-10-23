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

/**
 * Field attachment downloads in Zoho CRM v2 can return the binary from a
 * different file-upload field while still responding with HTTP 200. Keep the
 * record-list API version independent and force only binary downloads to the
 * requested, current API version.
 */
export function zohoApiBaseForVersion(rawBase: string, version: string): string {
  const base = String(rawBase || '').trim().replace(/\/$/, '')
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '')
  if (!base || !normalizedVersion) throw new Error('Invalid Zoho API base or version')

  const versioned = base.replace(
    /(\/crm\/)v\d+(?:\.\d+)?$/i,
    `$1v${normalizedVersion}`
  )
  if (versioned === base && !new RegExp(`/crm/v${normalizedVersion}$`, 'i').test(base)) {
    throw new Error(`Unsupported ZOHO_API_BASE format: ${base}`)
  }
  return versioned
}

function normalizeComparableFileName(value?: string | null): string {
  return String(value || '').trim().normalize('NFC')
}

export function validateZohoDownloadedFile({
  expectedFileName,
  expectedSize,
  downloadedFileName,
  downloadedSize,
}: {
  expectedFileName?: string | null
  expectedSize?: number | null
  downloadedFileName?: string | null
  downloadedSize: number
}): { ok: true } | { ok: false; reason: string } {
  const expectedName = normalizeComparableFileName(expectedFileName)
  const actualName = normalizeComparableFileName(downloadedFileName)

  if (expectedName && !actualName) {
    return { ok: false, reason: 'missing response filename' }
  }
  if (expectedName && actualName !== expectedName) {
    return {
      ok: false,
      reason: `filename mismatch (expected ${expectedName}, received ${actualName})`,
    }
  }

  if (
    typeof expectedSize === 'number' &&
    Number.isFinite(expectedSize) &&
    expectedSize >= 0 &&
    downloadedSize !== expectedSize
  ) {
    return {
      ok: false,
      reason: `size mismatch (expected ${expectedSize}, received ${downloadedSize})`,
    }
  }

  return { ok: true }
}
