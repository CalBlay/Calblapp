export interface ZohoAttachment {
  id: string
  File_Name?: string
  Size?: number
  Modified_Time?: string
  Download_Url?: string
}

const ZOHO_ATTACHMENT_ALLOWED_PREFIXES = ['FT', 'FG', 'FE', 'FM'] as const

export function shouldImportZohoAttachment(fileName?: string | null): boolean {
  const normalized = String(fileName || '').trim().toUpperCase()
  if (!normalized) return false
  return ZOHO_ATTACHMENT_ALLOWED_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  )
}

export function extractZohoFieldAttachments(rawFieldValue: unknown): ZohoAttachment[] {
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

export function shouldCleanupMissingZohoAttachmentSlots(
  importedSlotCount: number
): boolean {
  return importedSlotCount > 0
}
