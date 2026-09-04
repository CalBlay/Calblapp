export interface ZohoAttachment {
  id: string
  File_Name?: string
  Size?: number
  Modified_Time?: string
  Download_Url?: string
}

/** Camps Zoho (Deals) de tipus fitxer que alimenten zohoFile* al sync. */
export const ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES = [
  'Fulla_d_enc_rrec',
  'Full_de_Tast',
] as const

const ZOHO_ATTACHMENT_ALLOWED_PREFIXES = ['FT', 'FG', 'FE', 'FM', 'FC'] as const

export function shouldImportZohoAttachment(fileName?: string | null): boolean {
  const normalized = String(fileName || '').trim().toUpperCase()
  if (!normalized) return false
  return ZOHO_ATTACHMENT_ALLOWED_PREFIXES.some((prefix) => {
    if (!normalized.startsWith(prefix)) return false
    const next = normalized.charAt(prefix.length)
    return !next || next === ' ' || next === '_' || next === '-' || /\d/.test(next)
  })
}

export function shouldRefetchZohoAttachmentField(value: unknown): boolean {
  if (mergeZohoFieldAttachments([value]).length > 0) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return Boolean(value.trim())
  return value !== null && value !== undefined
}

export function zohoAttachmentSlotKeys(baseKey: string) {
  return {
    url: baseKey,
    name: `${baseKey}Name`,
    mimeType: `${baseKey}MimeType`,
    attachmentId: `${baseKey}AttachmentId`,
    modifiedTime: `${baseKey}ModifiedTime`,
    size: `${baseKey}Size`,
    path: `${baseKey}Path`,
    source: `${baseKey}Source`,
  }
}

export function listExistingZohoAttachmentBaseKeys(
  existing?: Record<string, unknown>
): string[] {
  if (!existing) return []
  return Object.keys(existing).filter((key) => /^zohoFile\d+$/i.test(key))
}

export function deletedZohoAttachmentIdsFromDocument(
  existing?: Record<string, unknown>
): Set<string> {
  const values = Array.isArray(existing?.calendarDeletedZohoAttachmentIds)
    ? existing.calendarDeletedZohoAttachmentIds
    : []
  return new Set(values.map((id) => String(id || '').trim()).filter(Boolean))
}

export function canPruneMissingZohoAttachmentSlots(
  currentKeys: ReadonlySet<string>
): boolean {
  return currentKeys.size > 0
}

export function mergeZohoFieldAttachments(
  rawFieldValues: readonly unknown[]
): ZohoAttachment[] {
  const seen = new Set<string>()
  const out: ZohoAttachment[] = []

  for (const rawFieldValue of rawFieldValues) {
    for (const attachment of extractZohoFieldAttachments(rawFieldValue)) {
      const id = String(attachment.id || '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(attachment)
    }
  }

  return out
}

export function extractZohoFieldAttachments(
  rawFieldValue: unknown
): ZohoAttachment[] {
  const rawItems = Array.isArray(rawFieldValue)
    ? rawFieldValue
    : rawFieldValue
      ? [rawFieldValue]
      : []

  return rawItems.flatMap((item) => {
    if (!item) return []
    if (typeof item === 'string') {
      const id = item.trim()
      return id ? [{ id }] : []
    }
    if (typeof item !== 'object') return []

    const record = item as Record<string, unknown>
    const id = String(
      record.attachment_Id ||
        record.attachment_id ||
        record.Attachment_Id ||
        record.File_Id__s ||
        record.file_Id__s ||
        record.file_Id ||
        record.File_Id ||
        record.file_id ||
        record.$file_id ||
        record.id ||
        ''
    ).trim()
    if (!id) return []

    const fileName = String(
      record.File_Name ||
        record.file_Name ||
        record.file_name ||
        record.fileName ||
        record.name ||
        record.Name ||
        ''
    ).trim()
    const size = Number(record.Size || record.original_Size_Byte || record.size)
    const modifiedTime = String(record.Modified_Time || '').trim()
    const downloadUrl = String(
      record.download_Url || record.download_url || ''
    ).trim()

    return [
      {
        id,
        File_Name: fileName || undefined,
        Size: Number.isFinite(size) ? size : undefined,
        Modified_Time: modifiedTime || undefined,
        Download_Url: downloadUrl || undefined,
      },
    ]
  })
}
