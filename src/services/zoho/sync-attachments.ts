import { FieldValue } from 'firebase-admin/firestore'
import { storageAdmin } from '@/lib/firebaseAdmin'
import {
  canPruneMissingZohoAttachmentSlots,
  deletedZohoAttachmentIdsFromDocument,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  shouldImportZohoAttachment,
  shouldRefetchZohoAttachmentField,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  zohoAttachmentSlotKeys,
  type ZohoAttachment,
} from '@/services/zoho/attachments'
import {
  extractFileNameFromContentDisposition,
  sanitizeStorageName,
  validateZohoDownloadedFile,
  zohoApiBaseForVersion,
} from '@/services/zoho/attachmentFileNames'
import { getZohoAccessToken, zohoFetch } from '@/services/zoho/auth'
import type { ZohoDeal } from '@/services/zoho/sync-types'

type ZohoDealAttachmentFields = Pick<
  ZohoDeal,
  (typeof ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES)[number]
>

const ZOHO_FIELD_ATTACHMENT_SOURCE_V8 = 'zoho-field-attachment-v8'

async function getZohoFieldAttachmentValue(
  moduleName: string,
  recordId: string,
  fieldApiName: string
): Promise<unknown> {
  const res = await zohoFetch<{ data?: Array<Record<string, unknown>> }>(
    `/${moduleName}/${recordId}?fields=${fieldApiName}`
  )
  return res.data?.[0]?.[fieldApiName]
}

async function downloadZohoAttachment(
  moduleName: string,
  recordId: string,
  attachmentId: string,
  fallbackDownloadUrl?: string,
  expectedFileName?: string,
  expectedSize?: number | null
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const token = await getZohoAccessToken()
  const base = String(process.env.ZOHO_API_BASE || '').trim().replace(/\/$/, '')
  if (!base) throw new Error('Missing ZOHO_API_BASE')
  const baseOrigin = new URL(base).origin
  const downloadBase = zohoApiBaseForVersion(base, '8')

  const fetchBinary = async (url: string) =>
    fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
      },
      cache: 'no-store',
    })

  const fieldPath = `/${moduleName}/${recordId}/actions/download_fields_attachment?fields_attachment_id=${encodeURIComponent(attachmentId)}`
  const attempts = [
    `${downloadBase}${fieldPath}`,
    ...(downloadBase === base ? [] : [`${base}${fieldPath}`]),
    `${base}/${moduleName}/${recordId}/Attachments/${encodeURIComponent(attachmentId)}`,
  ]
  if (fallbackDownloadUrl) {
    attempts.push(
      fallbackDownloadUrl.startsWith('http')
        ? fallbackDownloadUrl
        : `${baseOrigin}${fallbackDownloadUrl.startsWith('/') ? '' : '/'}${fallbackDownloadUrl}`
    )
  }

  const failures: string[] = []
  for (const [index, url] of attempts.entries()) {
    const res = await fetchBinary(url)
    if (!res.ok) {
      failures.push(`attempt ${index + 1}: HTTP ${res.status}`)
      continue
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const fileName = extractFileNameFromContentDisposition(
      res.headers.get('content-disposition')
    )
    const validation = validateZohoDownloadedFile({
      expectedFileName,
      expectedSize,
      downloadedFileName: fileName,
      downloadedSize: buffer.length,
    })
    if (!validation.ok) {
      failures.push(`attempt ${index + 1}: ${validation.reason}`)
      continue
    }

    const mimeType =
      String(res.headers.get('content-type') || '').split(';')[0].trim() ||
      'application/octet-stream'
    return { buffer, mimeType, fileName }
  }

  throw new Error(
    `Error descarregant adjunt Zoho ${attachmentId}: ${failures.join('; ')}`
  )
}

async function resolveZohoDealAttachments(
  moduleName: string,
  dealId: string,
  deal?: ZohoDealAttachmentFields
): Promise<ZohoAttachment[]> {
  const fieldValues = await Promise.all(
    ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES.map(async (field) => {
      const value = deal?.[field]
      if (!shouldRefetchZohoAttachmentField(value)) return value

      return getZohoFieldAttachmentValue(moduleName, dealId, field)
    })
  )

  return mergeZohoFieldAttachments(fieldValues)
}

export async function buildZohoAttachmentFields(
  moduleName: string,
  dealId: string,
  deal?: ZohoDealAttachmentFields,
  existing?: FirebaseFirestore.DocumentData
): Promise<{
  fields: Record<string, unknown>
  stats: {
    checked: number
    downloaded: number
    reused: number
    deletedFromStorage: number
  }
}> {
  const attachments = await resolveZohoDealAttachments(moduleName, dealId, deal)
  const out: Record<string, unknown> = {}
  const currentKeys = new Set<string>()
  const bucket = storageAdmin.bucket()
  let downloadedCount = 0
  let reusedCount = 0
  let deletedFromStorage = 0
  let slotIndex = 0
  const deletedAttachmentIds = deletedZohoAttachmentIdsFromDocument(existing)

  for (const attachment of attachments) {
    const metadataName = String(attachment.File_Name || '').trim()
    if (metadataName && !shouldImportZohoAttachment(metadataName)) continue
    if (deletedAttachmentIds.has(String(attachment.id || '').trim())) {
      slotIndex += 1
      continue
    }

    const slot = `zohoFile${slotIndex + 1}`
    const keys = zohoAttachmentSlotKeys(slot)
    const existingName = String(existing?.[keys.name] || '').trim()
    let fileName = metadataName || existingName || `${attachment.id}.bin`
    let fileBuffer: Buffer | null = null
    let initialMimeType = ''

    if (!metadataName) {
      if (existingName) {
        if (!shouldImportZohoAttachment(fileName)) continue
      } else {
        const downloaded = await downloadZohoAttachment(
          moduleName,
          dealId,
          String(attachment.id),
          attachment.Download_Url,
          existingName || undefined,
          typeof attachment.Size === 'number' ? attachment.Size : null
        )
        fileName = downloaded.fileName.trim() || fileName
        if (!shouldImportZohoAttachment(fileName)) continue
        fileBuffer = downloaded.buffer
        initialMimeType = downloaded.mimeType
      }
    }

    slotIndex += 1
    const storageName = sanitizeStorageName(fileName)
    const storagePath = `events/zoho/${dealId}/${attachment.id}-${storageName}`
    const modifiedTime = String(attachment.Modified_Time || '').trim()
    const size =
      typeof attachment.Size === 'number' && Number.isFinite(attachment.Size)
        ? attachment.Size
        : null

    const needsRefresh =
      String(existing?.[keys.attachmentId] || '') !== String(attachment.id) ||
      String(existing?.[keys.modifiedTime] || '') !== modifiedTime ||
      Number(existing?.[keys.size] || 0) !== Number(size || 0) ||
      String(existing?.[keys.path] || '') !== storagePath ||
      String(existing?.[keys.source] || '') !== ZOHO_FIELD_ATTACHMENT_SOURCE_V8 ||
      !String(existing?.[keys.url] || '').trim()

    let publicUrl = String(existing?.[keys.url] || '').trim()
    let mimeType =
      initialMimeType || String(existing?.[keys.mimeType] || '').trim()

    if (needsRefresh) {
      if (!fileBuffer) {
        const downloaded = await downloadZohoAttachment(
          moduleName,
          dealId,
          String(attachment.id),
          attachment.Download_Url,
          fileName,
          size
        )
        fileBuffer = downloaded.buffer
        mimeType = downloaded.mimeType
      }
      await bucket.file(storagePath).save(fileBuffer, {
        contentType: mimeType || 'application/octet-stream',
        resumable: false,
      })
      ;[publicUrl] = await bucket.file(storagePath).getSignedUrl({
        action: 'read',
        expires: '2035-01-01',
      })
      downloadedCount += 1
    } else {
      reusedCount += 1
    }

    out[keys.url] = publicUrl
    out[keys.name] = fileName
    out[keys.mimeType] = mimeType || 'application/octet-stream'
    out[keys.attachmentId] = String(attachment.id)
    out[keys.modifiedTime] = modifiedTime
    out[keys.size] = size
    out[keys.path] = storagePath
    out[keys.source] = ZOHO_FIELD_ATTACHMENT_SOURCE_V8
    currentKeys.add(slot)
  }

  if (canPruneMissingZohoAttachmentSlots(currentKeys)) {
    for (const existingBaseKey of listExistingZohoAttachmentBaseKeys(existing)) {
      if (currentKeys.has(existingBaseKey)) continue
      const keys = zohoAttachmentSlotKeys(existingBaseKey)
      const oldPath = String(existing?.[keys.path] || '').trim()
      if (oldPath) {
        try {
          await bucket.file(oldPath).delete({ ignoreNotFound: true })
          deletedFromStorage += 1
        } catch {
          // Ignorem errors de neteja del bucket i continuem amb la neteja de metadades.
        }
      }
      out[keys.url] = FieldValue.delete()
      out[keys.name] = FieldValue.delete()
      out[keys.mimeType] = FieldValue.delete()
      out[keys.attachmentId] = FieldValue.delete()
      out[keys.modifiedTime] = FieldValue.delete()
      out[keys.size] = FieldValue.delete()
      out[keys.path] = FieldValue.delete()
      out[keys.source] = FieldValue.delete()
    }
  }

  return {
    fields: out,
    stats: {
      checked: attachments.length,
      downloaded: downloadedCount,
      reused: reusedCount,
      deletedFromStorage,
    },
  }
}
