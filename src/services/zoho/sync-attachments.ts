import { FieldValue } from 'firebase-admin/firestore'
import { storageAdmin } from '@/lib/firebaseAdmin'
import {
  canPruneMissingZohoAttachmentSlots,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  shouldImportZohoAttachment,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  zohoAttachmentSlotKeys,
  type ZohoAttachment,
} from '@/services/zoho/attachments'
import {
  extractFileNameFromContentDisposition,
  sanitizeStorageName,
} from '@/services/zoho/attachmentFileNames'
import { getZohoAccessToken, zohoFetch } from '@/services/zoho/auth'
import type { ZohoDeal } from '@/services/zoho/sync-types'

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

async function listZohoRecordAttachments(
  moduleName: string,
  recordId: string
): Promise<ZohoAttachment[]> {
  const res = await zohoFetch<{ data?: ZohoAttachment[] }>(
    `/${moduleName}/${recordId}/Attachments`
  )
  return Array.isArray(res.data) ? res.data : []
}

async function downloadZohoAttachment(
  moduleName: string,
  recordId: string,
  attachmentId: string,
  fallbackDownloadUrl?: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const token = await getZohoAccessToken()
  const base = String(process.env.ZOHO_API_BASE || '').trim().replace(/\/$/, '')
  if (!base) throw new Error('Missing ZOHO_API_BASE')
  const baseOrigin = new URL(base).origin

  const fetchBinary = async (url: string) =>
    fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
      },
      cache: 'no-store',
    })

  let res = await fetchBinary(
    `${base}/${moduleName}/${recordId}/actions/download_fields_attachment?fields_attachment_id=${encodeURIComponent(attachmentId)}`
  )

  if (!res.ok) {
    const legacyRes = await fetchBinary(
      `${base}/${moduleName}/${recordId}/Attachments/${encodeURIComponent(attachmentId)}`
    )
    if (legacyRes.ok) {
      res = legacyRes
    }
  }

  if (!res.ok && fallbackDownloadUrl) {
    const fallbackUrl = fallbackDownloadUrl.startsWith('http')
      ? fallbackDownloadUrl
      : `${baseOrigin}${fallbackDownloadUrl.startsWith('/') ? '' : '/'}${fallbackDownloadUrl}`
    res = await fetchBinary(fallbackUrl)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Error descarregant fulla d'encarrec Zoho ${attachmentId}: ${res.status} ${text}`
    )
  }

  const arrayBuffer = await res.arrayBuffer()
  const mimeType =
    String(res.headers.get('content-type') || '').split(';')[0].trim() ||
    'application/octet-stream'
  const fileName = extractFileNameFromContentDisposition(
    res.headers.get('content-disposition')
  )

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    fileName,
  }
}

async function resolveZohoDealAttachments(
  moduleName: string,
  dealId: string,
  deal?: Pick<ZohoDeal, 'Fulla_d_enc_rrec' | 'Full_de_Tast'>
): Promise<ZohoAttachment[]> {
  const fieldValues: unknown[] = []

  for (const field of ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES) {
    let value = deal?.[field]
    // Alguns payloads de llistat de Zoho inclouen el camp de fitxer però sense ids útils.
    // Si no podem extreure cap adjunt del valor rebut, rellegim el camp del registre.
    if (mergeZohoFieldAttachments([value]).length === 0) {
      value = await getZohoFieldAttachmentValue(moduleName, dealId, field)
    }
    fieldValues.push(value)
  }

  const merged = mergeZohoFieldAttachments(fieldValues)
  const legacy = await listZohoRecordAttachments(moduleName, dealId).catch(() => [])

  if (legacy.length === 0) return merged

  const out = [...merged]
  const seen = new Set(out.map((attachment) => String(attachment.id || '').trim()))
  for (const attachment of legacy) {
    const id = String(attachment.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(attachment)
  }
  return out
}

export async function buildZohoAttachmentFields(
  moduleName: string,
  dealId: string,
  deal?: Pick<ZohoDeal, 'Fulla_d_enc_rrec' | 'Full_de_Tast'>,
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

  for (const attachment of attachments) {
    const metadataName = String(attachment.File_Name || '').trim()
    if (metadataName && !shouldImportZohoAttachment(metadataName)) continue

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
          attachment.Download_Url
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
          attachment.Download_Url
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
    out[keys.source] = 'zoho-field-attachment'
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
