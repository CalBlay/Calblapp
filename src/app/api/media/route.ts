import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id?: string
  role?: string
}

type MediaSource = 'incidents' | 'maintenance' | 'messaging' | 'audits' | 'spaces'

type MediaRef = {
  source: MediaSource
  docId: string
  createdAt: number
  url: string | null
  path: string
  size: number | null
  type: string | null
  title: string
}

type AggregatedMediaItem = {
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

function requireAdmin(role?: string) {
  return normalizeRole(role || '') === 'admin'
}

function toMillis(value: unknown): number {
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

function cleanText(value: unknown) {
  return String(value || '').trim()
}

function extractOwnedStoragePath(url: string, bucketName: string): string | null {
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

async function collectIncidentRefs(): Promise<MediaRef[]> {
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
    .filter((item): item is MediaRef => Boolean(item))
}

async function collectMaintenanceRefs(): Promise<MediaRef[]> {
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
    .filter((item): item is MediaRef => Boolean(item))
}

async function collectMessagingRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('messages').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      const path = cleanText(data.imagePath)
      if (!path) return null
      const titleBits = [
        cleanText(data.senderName),
        cleanText(data.body).slice(0, 80),
      ].filter(Boolean)
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
    .filter((item): item is MediaRef => Boolean(item))
}

async function collectAuditRefs(): Promise<MediaRef[]> {
  const snap = await db.collection('audit_runs').get()
  const refs: MediaRef[] = []

  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const answers = Array.isArray(data.auditAnswers)
      ? (data.auditAnswers as Array<Record<string, unknown>>)
      : []

    answers.forEach((answer) => {
      const photos = Array.isArray(answer.photos)
        ? (answer.photos as Array<Record<string, unknown>>)
        : []

      photos.forEach((photo, index) => {
        const path = cleanText(photo.path)
        if (!path) return
        refs.push({
          source: 'audits',
          docId: doc.id,
          createdAt: toMillis(data.createdAt || data.updatedAt),
          url: cleanText(photo.url) || null,
          path,
          size: null,
          type: null,
          title:
            [cleanText(data.templateName), cleanText(data.eventTitle), `Foto ${index + 1}`]
              .filter(Boolean)
              .join(' · ') || `Auditoria ${doc.id}`,
        })
      })
    })
  })

  return refs
}

async function collectSpaceRefs(): Promise<MediaRef[]> {
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

function aggregateMedia(refs: MediaRef[]): AggregatedMediaItem[] {
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

async function clearIncidentRefs(path: string) {
  const snap = await db.collection('incidents').where('imagePath', '==', path).get()
  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.set({ imageUrl: null, imagePath: null, imageMeta: null }, { merge: true })
    )
  )
  return snap.size
}

async function clearMaintenanceRefs(path: string) {
  const snap = await db.collection('maintenanceTickets').where('imagePath', '==', path).get()
  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.set({ imageUrl: null, imagePath: null, imageMeta: null }, { merge: true })
    )
  )
  return snap.size
}

async function clearMessagingRefs(path: string) {
  const snap = await db.collection('messages').where('imagePath', '==', path).get()
  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.set({ imageUrl: null, imagePath: null, imageMeta: null }, { merge: true })
    )
  )
  return snap.size
}

async function clearAuditRefs(path: string) {
  const snap = await db.collection('audit_runs').get()
  let updated = 0

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>
      const answers = Array.isArray(data.auditAnswers)
        ? (data.auditAnswers as Array<Record<string, unknown>>)
        : []

      let changed = false
      const nextAnswers = answers.map((answer) => {
        const photos = Array.isArray(answer.photos)
          ? (answer.photos as Array<Record<string, unknown>>)
          : []
        const filteredPhotos = photos.filter((photo) => cleanText(photo.path) !== path)
        if (filteredPhotos.length !== photos.length) changed = true
        return changed ? { ...answer, photos: filteredPhotos } : answer
      })

      if (!changed) return
      updated += 1
      await doc.ref.set({ auditAnswers: nextAnswers, updatedAt: Date.now() }, { merge: true })
    })
  )

  return updated
}

async function clearSpaceRefs(path: string) {
  const bucketName = storageAdmin.bucket().name
  const snap = await db.collection('finques').get()
  let updated = 0

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>
      const produccio =
        data.produccio && typeof data.produccio === 'object'
          ? ({ ...(data.produccio as Record<string, unknown>) } as Record<string, unknown>)
          : {}
      const images = Array.isArray(produccio.images) ? (produccio.images as unknown[]) : []
      const filtered = images.filter((imageUrl) => {
        const url = cleanText(imageUrl)
        return extractOwnedStoragePath(url, bucketName) !== path
      })
      if (filtered.length === images.length) return
      updated += 1
      produccio.images = filtered
      await doc.ref.set({ produccio, updatedAt: Date.now() }, { merge: true })
    })
  )

  return updated
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as SessionUser | undefined

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!requireAdmin(user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [incidents, maintenance, messaging, audits, spaces] = await Promise.all([
      collectIncidentRefs(),
      collectMaintenanceRefs(),
      collectMessagingRefs(),
      collectAuditRefs(),
      collectSpaceRefs(),
    ])

    const media = aggregateMedia([
      ...incidents,
      ...maintenance,
      ...messaging,
      ...audits,
      ...spaces,
    ])

    return NextResponse.json({ media }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as SessionUser | undefined

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!requireAdmin(user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as { path?: string }
    const path = cleanText(body?.path)

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 })
    }

    const [incidents, maintenance, messaging, audits, spaces] = await Promise.all([
      clearIncidentRefs(path),
      clearMaintenanceRefs(path),
      clearMessagingRefs(path),
      clearAuditRefs(path),
      clearSpaceRefs(path),
    ])

    try {
      await storageAdmin.bucket().file(path).delete()
    } catch {
      // ignore missing or already deleted files
    }

    return NextResponse.json(
      {
        ok: true,
        removedPath: path,
        cleanedReferences: {
          incidents,
          maintenance,
          messaging,
          audits,
          spaces,
        },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
