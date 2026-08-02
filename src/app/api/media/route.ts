import { NextResponse } from 'next/server'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { isAllowedByClientOverride } from '@/lib/server/permissions'
import { normalizeRole } from '@/lib/roles'
import {
  aggregateMedia,
  cleanText,
  collectAuditRefs,
  collectEventVisitVideoRefs,
  collectIncidentRefs,
  collectMaintenanceRefs,
  collectMessagingRefs,
  collectSpaceRefs,
  extractOwnedStoragePath,
  type MediaSource,
} from '@/lib/media/collectMediaRefs'
import {
  deleteMediaIndexByPath,
  isMediaIndexEmpty,
  loadMediaIndexPage,
} from '@/lib/media/storageMediaIndex'
import type { AggregatedMediaItem } from '@/lib/media/collectMediaRefs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function canViewMedia(auth: { user: { id: string; role?: string } }): Promise<boolean> {
  const allowed = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: PERM.view('/menu/media'),
  })
  return allowed === true
}

async function allowedMediaSources(auth: { user: { id: string; role?: string } }): Promise<Set<MediaSource>> {
  const all = new Set<MediaSource>(MEDIA_SOURCES)
  if (normalizeRole(auth.user.role) === 'admin') return all

  const allowed = new Set<MediaSource>()
  for (const src of MEDIA_SOURCES) {
    const perm = PERM.action('/menu/media', `source:${src}`)
    const ok = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: perm,
    })
    if (ok === true) {
      allowed.add(src)
    }
  }
  return allowed
}

const MEDIA_SOURCES: MediaSource[] = [
  'incidents',
  'maintenance',
  'messaging',
  'audits',
  'spaces',
  'events',
]

function parseMediaSource(raw: string | null): MediaSource | null {
  const v = cleanText(raw || '')
  return MEDIA_SOURCES.includes(v as MediaSource) ? (v as MediaSource) : null
}

async function loadLegacyMediaAggregated() {
  const [incidents, maintenance, messaging, audits, spaces, events] = await Promise.all([
    collectIncidentRefs(),
    collectMaintenanceRefs(),
    collectMessagingRefs(),
    collectAuditRefs(),
    collectSpaceRefs(),
    collectEventVisitVideoRefs(),
  ])
  return aggregateMedia([...incidents, ...maintenance, ...messaging, ...audits, ...spaces, ...events])
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
        if (filteredPhotos.length === photos.length) return answer
        changed = true
        return { ...answer, photos: filteredPhotos }
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

async function clearEventVisitVideoRefs(path: string) {
  const snap = await db.collection('stage_verd').get()
  let updated = 0

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      let changed = false

      for (const key of Object.keys(data)) {
        if (!/^visitVideo\d+$/i.test(key)) continue
        if (cleanText(data[key]) !== path) continue
        patch[key] = null
        patch[`${key}Name`] = null
        patch[`${key}MimeType`] = null
        patch[`${key}At`] = null
        patch[`${key}By`] = null
        changed = true
      }

      if (!changed) return
      updated += 1
      await doc.ref.set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true })
    })
  )

  return updated
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  if (!(await canViewMedia(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const forceLegacy = searchParams.get('legacy') === '1'

    if (forceLegacy) {
      const media = await loadLegacyMediaAggregated()
      return NextResponse.json(
        { media, fromIndex: false, indexEmpty: false, nextCursor: null, hasMore: false },
        { status: 200 }
      )
    }

    const empty = await isMediaIndexEmpty()
    if (empty) {
      const media = await loadLegacyMediaAggregated()
      return NextResponse.json(
        {
          media,
          fromIndex: false,
          indexEmpty: true,
          nextCursor: null,
          hasMore: false,
          hint: 'Executa POST /api/media/reindex per crear l index i alleugerir properes carregues.',
        },
        { status: 200 }
      )
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 60, 1), 200)
    const cursor = cleanText(searchParams.get('cursor'))
    const source = parseMediaSource(searchParams.get('source'))
    const allowedSources = await allowedMediaSources(auth)
    if (!allowedSources.size) {
      return NextResponse.json(
        { media: [], fromIndex: true, indexEmpty: false, nextCursor: null, hasMore: false },
        { status: 200 }
      )
    }
    if (source && !allowedSources.has(source)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const auditEventId = cleanText(searchParams.get('auditEventId'))
    const incidentEventId = cleanText(searchParams.get('incidentEventId'))
    const eventEventId = cleanText(searchParams.get('eventEventId'))

    const { items, nextCursor } = await loadMediaIndexPage({
      limit,
      cursor: cursor || null,
      source,
      auditEventId: auditEventId || null,
      incidentEventId: incidentEventId || null,
      eventEventId: eventEventId || null,
    })

    const filtered = items.filter((it: AggregatedMediaItem) =>
      Array.isArray(it?.sourceKinds)
        ? it.sourceKinds.some((k: string) => allowedSources.has(k as MediaSource))
        : true
    )

    return NextResponse.json(
      {
        media: filtered,
        fromIndex: true,
        indexEmpty: false,
        nextCursor,
        hasMore: Boolean(nextCursor),
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const ok = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: PERM.action('/menu/media', 'delete'),
  })
  if (ok !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = (await req.json()) as { path?: string }
    const path = cleanText(body?.path)

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 })
    }

    const [incidents, maintenance, messaging, audits, spaces, events] = await Promise.all([
      clearIncidentRefs(path),
      clearMaintenanceRefs(path),
      clearMessagingRefs(path),
      clearAuditRefs(path),
      clearSpaceRefs(path),
      clearEventVisitVideoRefs(path),
    ])

    try {
      await storageAdmin.bucket().file(path).delete()
    } catch {
      // ignore missing or already deleted files
    }

    await deleteMediaIndexByPath(path)

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
          events,
        },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
