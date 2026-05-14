import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as firestore, storageAdmin } from '@/lib/firebaseAdmin'

type CleanupResult = {
  scannedEvents: number
  matchedEvents: number
  deletedFiles: number
  cleanedFields: number
  cutoffDate: string
}

function getCutoffDate(days: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function listZohoAttachmentBaseKeys(
  data?: FirebaseFirestore.DocumentData
): string[] {
  if (!data) return []
  return Object.keys(data).filter((key) => /^zohoFile\d+$/i.test(key))
}

function zohoAttachmentSlotKeys(baseKey: string) {
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

export async function cleanupZohoAttachmentsForStageVerd(
  retentionDays = 30
): Promise<CleanupResult> {
  const cutoffDate = getCutoffDate(retentionDays)
  const bucket = storageAdmin.bucket()

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = []
  try {
    const snap = await firestore
      .collection('stage_verd')
      .where('DataFi', '<=', cutoffDate)
      .get()
    docs = snap.docs
  } catch (error) {
    console.warn(
      '[zoho-cleanup] Fallback a escaneig complet de stage_verd',
      error
    )
    const snap = await firestore.collection('stage_verd').get()
    docs = snap.docs.filter((doc) => {
      const data = doc.data()
      const dataFi = String(data?.DataFi || data?.DataInici || '').slice(0, 10)
      return !!dataFi && dataFi <= cutoffDate
    })
  }

  let matchedEvents = 0
  let deletedFiles = 0
  let cleanedFields = 0

  for (const doc of docs) {
    const data = doc.data()
    const baseKeys = listZohoAttachmentBaseKeys(data)
    if (baseKeys.length === 0) continue

    matchedEvents += 1
    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }

    for (const baseKey of baseKeys) {
      const keys = zohoAttachmentSlotKeys(baseKey)
      const path = String(data?.[keys.path] || '').trim()
      if (path) {
        try {
          await bucket.file(path).delete({ ignoreNotFound: true })
          deletedFiles += 1
        } catch {
          // Si el binari no existeix o falla la neteja, igualment netegem metadades.
        }
      }

      update[keys.url] = FieldValue.delete()
      update[keys.name] = FieldValue.delete()
      update[keys.mimeType] = FieldValue.delete()
      update[keys.attachmentId] = FieldValue.delete()
      update[keys.modifiedTime] = FieldValue.delete()
      update[keys.size] = FieldValue.delete()
      update[keys.path] = FieldValue.delete()
      update[keys.source] = FieldValue.delete()
      cleanedFields += 8
    }

    await doc.ref.set(update, { merge: true })
  }

  return {
    scannedEvents: docs.length,
    matchedEvents,
    deletedFiles,
    cleanedFields,
    cutoffDate,
  }
}
