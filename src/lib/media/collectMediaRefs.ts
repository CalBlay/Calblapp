/**
 * Recull referències a fitxers de Storage des de Firestore (per índex media / reindexació).
 */
import { createHash } from 'crypto'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'

export type MediaSource = 'incidents' | 'maintenance' | 'messaging' | 'audits' | 'spaces'

export type MediaRef = {
  source: MediaSource
  docId: string
  /** Per diverses fotos del mateix document (auditories). */
  refSuffix?: string
  createdAt: number
  url: string | null
  path: string
  size: number | null
  type: string | null
  title: string
}

export type AggregatedMediaItem = {
  id: string
  path: string
  url: string | null
  createdAt: number
  size: number | null
  type: string | null
  sourceKinds: MediaSource[]
  referenceCount: number
  title: string
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}

export function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    const candidate = value as { toDate?: () => Date }
    const date = typeof candidate.toDate === 'function' ? candidate.toDate() : null
    return date ? date.getTime() : 0
  }
  return 0
}

export function cleanText(value: unknown) {
  return String(value || '').trim()
}

export function extractOwnedStoragePath(url: string, bucketName: string): string | null {
  const raw = cleanText(url)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const pathname = decodeURIComponent(parsed.pathname || '')
    const prefix = `/${bucketName}/`
    if (pathname.startsWith(prefix)) {
      return pathname.slice(prefix.length)
    }
  } catch {
    return null
  }
  return null
}

function photoSizeFromDoc(photo: Record<string, unknown>): number | null {
  const raw = photo.size ?? (photo.meta as { size?: unknown } | undefined)?.size
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  return null
}

function photoTypeFromDoc(photo: Record<string, unknown>): string | null {
  const t = cleanText(photo.type) || cleanText((photo.meta as { type?: unknown } | undefined)?.type)
  return t || null
}

export async function collectIncidentRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('incidents').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const path = cleanText(data.imagePath)
      if (!path) return null
      const titleBits = [
        cleanText(data.incidentNumber),
        cleanText(data.eventTitle),
        cleanText(data.description).slice(0, 80),
      ].filter(Boolean)
      return {
        source: 'incidents' as const,
        docId: doc.id,
        createdAt: toMillis(data.createdAt),
        url: cleanText(data.imageUrl) || null,
        path,
        size:
          typeof (data.imageMeta as { size?: unknown } | null)?.size === 'number'
            ? Number((data.imageMeta as { size?: number }).size)
            : null,
        type: cleanText((data.imageMeta as { type?: unknown } | null)?.type) || null,
        title: titleBits.join(' · ') || `Incidencia ${doc.id}`,
      }
    })
    .filter(isNonNull)
}

export async function collectMaintenanceRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('maintenanceTickets').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const path = cleanText(data.imagePath)
      if (!path) return null
      const titleBits = [
        cleanText(data.ticketCode),
        cleanText(data.location),
        cleanText(data.description).slice(0, 80),
      ].filter(Boolean)
      return {
        source: 'maintenance' as const,
        docId: doc.id,
        createdAt: toMillis(data.createdAt),
        url: cleanText(data.imageUrl) || null,
        path,
        size:
          typeof (data.imageMeta as { size?: unknown } | null)?.size === 'number'
            ? Number((data.imageMeta as { size?: number }).size)
            : null,
        type: cleanText((data.imageMeta as { type?: unknown } | null)?.type) || null,
        title: titleBits.join(' · ') || `Ticket ${doc.id}`,
      }
    })
    .filter(isNonNull)
}

export async function collectMessagingRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('messages').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const path = cleanText(data.imagePath)
      if (!path) return null
      const titleBits = [cleanText(data.senderName), cleanText(data.body).slice(0, 80)].filter(Boolean)
      return {
        source: 'messaging' as const,
        docId: doc.id,
        createdAt: toMillis(data.createdAt),
        url: cleanText(data.imageUrl) || null,
        path,
        size:
          typeof (data.imageMeta as { size?: unknown } | null)?.size === 'number'
            ? Number((data.imageMeta as { size?: number }).size)
            : null,
        type: cleanText((data.imageMeta as { type?: unknown } | null)?.type) || null,
        title: titleBits.join(' · ') || `Missatge ${doc.id}`,
      }
    })
    .filter(isNonNull)
}

export async function collectAuditRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('audit_runs').get()
  const refs: MediaRef[] = []
  const bucket = storageAdmin.bucket()

  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const answers = Array.isArray(data.auditAnswers)
      ? (data.auditAnswers as Array<Record<string, unknown>>)
      : []

    answers.forEach((answer) => {
      const itemId = cleanText(answer.itemId)
      const photos = Array.isArray(answer.photos)
        ? (answer.photos as Array<Record<string, unknown>>)
        : []

      photos.forEach((photo, index) => {
        const path = cleanText(photo.path)
        if (!path) return
        const suffix = `${itemId || 'item'}_${index}`
        refs.push({
          source: 'audits',
          docId: doc.id,
          refSuffix: suffix,
          createdAt: toMillis(data.createdAt || data.updatedAt),
          url: cleanText(photo.url) || null,
          path,
          size: photoSizeFromDoc(photo),
          type: photoTypeFromDoc(photo),
          title:
            [cleanText(data.templateName), cleanText(data.eventTitle), `Foto ${index + 1}`]
              .filter(Boolean)
              .join(' · ') || `Auditoria ${doc.id}`,
        })
      })
    })
  })

  await Promise.all(
    refs.map(async (ref) => {
      if (ref.size != null && ref.size > 0) return
      if (!ref.path) return
      try {
        const [meta] = await bucket.file(ref.path).getMetadata()
        const s = Number(meta.size)
        if (Number.isFinite(s) && s > 0) ref.size = s
        if (!ref.type && meta.contentType) ref.type = meta.contentType
      } catch {
        // ignore
      }
    })
  )

  return refs
}

export async function collectSpaceRefs(): Promise<MediaRef[]> {
  const bucketName = storageAdmin.bucket().name
  const snap = await db.collection('finques').get()
  const refs: MediaRef[] = []

  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const produccio =
      data.produccio && typeof data.produccio === 'object'
        ? (data.produccio as Record<string, unknown>)
        : {}
    const images = Array.isArray(produccio.images) ? (produccio.images as unknown[]) : []

    images.forEach((imageUrl, index) => {
      const url = cleanText(imageUrl)
      const path = extractOwnedStoragePath(url, bucketName)
      if (!path) return
      refs.push({
        source: 'spaces',
        docId: doc.id,
        refSuffix: `img_${index}`,
        createdAt: toMillis(data.updatedAt || data.createdAt),
        url,
        path,
        size: null,
        type: null,
        title:
          [cleanText(data.nom), cleanText(data.code), `Imatge ${index + 1}`]
            .filter(Boolean)
            .join(' · ') || `Espai ${doc.id}`,
      })
    })
  })

  return refs
}

export async function collectAllMediaRefs(): Promise<MediaRef[]> {
  const [incidents, maintenance, messaging, audits, spaces] = await Promise.all([
    collectIncidentRefs(),
    collectMaintenanceRefs(),
    collectMessagingRefs(),
    collectAuditRefs(),
    collectSpaceRefs(),
  ])
  return [...incidents, ...maintenance, ...messaging, ...audits, ...spaces]
}

export function aggregateMedia(refs: MediaRef[]): AggregatedMediaItem[] {
  const byPath = new Map<string, AggregatedMediaItem>()

  refs.forEach((ref) => {
    const current = byPath.get(ref.path)
    if (!current) {
      byPath.set(ref.path, {
        id: ref.path,
        path: ref.path,
        url: ref.url,
        createdAt: ref.createdAt,
        size: ref.size,
        type: ref.type,
        sourceKinds: [ref.source],
        referenceCount: 1,
        title: ref.title,
      })
      return
    }

    current.referenceCount += 1
    if (!current.sourceKinds.includes(ref.source)) current.sourceKinds.push(ref.source)
    if (!current.url && ref.url) current.url = ref.url
    if (!current.size && ref.size) current.size = ref.size
    if (!current.type && ref.type) current.type = ref.type
    if (ref.createdAt > current.createdAt) current.createdAt = ref.createdAt
    if (!current.title && ref.title) current.title = ref.title
  })

  return Array.from(byPath.values()).sort((a, b) => b.createdAt - a.createdAt)
}

export function mediaIndexDocId(path: string): string {
  return createHash('sha256').update(path, 'utf8').digest('hex')
}

export function mediaRefKey(ref: Pick<MediaRef, 'source' | 'docId' | 'refSuffix'>): string {
  const s = ref.refSuffix?.trim()
  return s ? `${ref.source}__${ref.docId}__${s}` : `${ref.source}__${ref.docId}`
}
