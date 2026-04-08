import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  aggregateMedia,
  cleanText,
  collectAuditRefs,
  collectIncidentRefs,
  collectMaintenanceRefs,
  collectMessagingRefs,
  collectSpaceRefs,
  extractOwnedStoragePath,
} from '@/lib/media/collectMediaRefs'
import {
  deleteMediaIndexByPath,
  isMediaIndexEmpty,
  loadAllMediaFromIndex,
} from '@/lib/media/storageMediaIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id?: string
  role?: string
}

function requireAdmin(role?: string) {
  return normalizeRole(role || '') === 'admin'
}

async function loadLegacyMediaAggregated() {
  const [incidents, maintenance, messaging, audits, spaces] = await Promise.all([
    collectIncidentRefs(),
    collectMaintenanceRefs(),
    collectMessagingRefs(),
    collectAuditRefs(),
    collectSpaceRefs(),
  ])
  return aggregateMedia([...incidents, ...maintenance, ...messaging, ...audits, ...spaces])
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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as SessionUser | undefined

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!requireAdmin(user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const forceLegacy = searchParams.get('legacy') === '1'

    if (forceLegacy) {
      const media = await loadLegacyMediaAggregated()
      return NextResponse.json({ media, fromIndex: false, indexEmpty: false }, { status: 200 })
    }

    const empty = await isMediaIndexEmpty()
    if (empty) {
      const media = await loadLegacyMediaAggregated()
      return NextResponse.json(
        {
          media,
          fromIndex: false,
          indexEmpty: true,
          hint: 'Executa POST /api/media/reindex per crear l index i alleugerir properes carregues.',
        },
        { status: 200 }
      )
    }

    const media = await loadAllMediaFromIndex()
    return NextResponse.json({ media, fromIndex: true, indexEmpty: false }, { status: 200 })
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
        },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
