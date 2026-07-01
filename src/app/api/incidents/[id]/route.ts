// File: src/app/api/incidents/[id]/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin, storageAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { deleteMediaIndexByPath } from '@/lib/media/storageMediaIndex'
import { canDeleteIncident, normalizeIncidentStatus } from '@/lib/incidentPolicy'
import { requireIncidentsCategoryEdit, requireIncidentsModuleView } from '@/lib/server/incidentsApiAuth'

function normalizeTimestamp(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString()
  }
  if (typeof ts === 'string') return ts
  return ''
}

function normalizeImportance(raw: string): string {
  const v = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  if (v === 'urgent') return 'urgent'
  if (v === 'alta') return 'alta'
  if (v === 'baixa') return 'baixa'
  if (v === 'normal' || v === 'mitjana') return 'normal'
  return 'normal'
}

const PATCHABLE = new Set([
  'description',
  'originDepartment',
  'importance',
  'priority',
  'status',
  'resolutionNote',
  'category',
])

async function buildIncidentImagePayload(
  rawImages: Array<{ url?: string | null; path?: string | null; meta?: { size?: number; type?: string } | null }>
) {
  const bucket = storageAdmin.bucket()

  return Promise.all(
    rawImages.map(async (image) => {
      const path = String(image?.path || '').trim()
      if (!path) {
        return {
          url: image?.url || null,
          path: image?.path || null,
          meta: image?.meta || null,
          missing: false,
        }
      }

      try {
        const [freshUrl] = await bucket.file(path).getSignedUrl({
          action: 'read',
          expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        })

        return {
          url: freshUrl,
          path,
          meta: image?.meta || null,
          missing: false,
        }
      } catch {
        return {
          url: null,
          path,
          meta: image?.meta || null,
          missing: true,
        }
      }
    })
  )
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireIncidentsModuleView()
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const incidentId = String(id || '').trim()
    if (!incidentId) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const snap = await firestoreAdmin.collection('incidents').doc(incidentId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Incidencia no trobada' }, { status: 404 })
    }

    const data = snap.data() || {}
    const rawImages = Array.isArray(data.images) ? data.images : []
    const normalizedImages =
      rawImages.length > 0
        ? rawImages
        : data.imageUrl || data.imagePath
          ? [
              {
                url: data.imageUrl || null,
                path: data.imagePath || null,
                meta: data.imageMeta || null,
              },
            ]
          : []

    const images = await buildIncidentImagePayload(normalizedImages)

    const incident = {
      id: snap.id,
      ...data,
      images,
      hasImages: images.length > 0,
      imageCount: images.length,
      createdAt: normalizeTimestamp(data.createdAt),
      updatedAt: normalizeTimestamp(data.updatedAt),
    }

    return NextResponse.json({ incident }, { status: 200 })
  } catch (err) {
    console.error('[incidents GET one] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireIncidentsModuleView()
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const incidentId = String(id || '').trim()
    if (!incidentId) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const payload = (await req.json()) as Record<string, unknown>
    const wantsCategoryEdit = 'category' in payload
    if (wantsCategoryEdit) {
      const catAuth = await requireIncidentsCategoryEdit()
      if (!catAuth.ok) return catAuth.res
    }

    const docRef = firestoreAdmin.collection('incidents').doc(incidentId)
    const snap = await docRef.get()

    if (!snap.exists) {
      return NextResponse.json({ error: 'Incidència no trobada' }, { status: 404 })
    }

    const cleaned: Record<string, unknown> = {}
    let hasPatch = false

    for (const key of PATCHABLE) {
      if (!(key in payload)) continue
      const val = payload[key]
      if (key === 'description' && typeof val === 'string') {
        cleaned.description = val
        hasPatch = true
      }
      if (key === 'originDepartment' && typeof val === 'string') {
        cleaned.originDepartment = val.trim()
        hasPatch = true
      }
      if (key === 'importance' && typeof val === 'string') {
        cleaned.importance = normalizeImportance(val)
        hasPatch = true
      }
      if (key === 'priority' && typeof val === 'string') {
        cleaned.priority = val.trim()
        cleaned.importance = normalizeImportance(val)
        hasPatch = true
      }
      if (key === 'status' && typeof val === 'string') {
        cleaned.status = normalizeIncidentStatus(val)
        hasPatch = true
      }
      if (key === 'resolutionNote' && typeof val === 'string') {
        cleaned.resolutionNote = val.trim()
        hasPatch = true
      }
      if (key === 'category' && val && typeof val === 'object') {
        const category = val as { id?: unknown; label?: unknown }
        const id = String(category.id || '').trim()
        const label = String(category.label || '').trim()
        if (!id || !label) {
          return NextResponse.json({ error: 'Categoria no vàlida' }, { status: 400 })
        }
        cleaned.category = { id, label }
        hasPatch = true
      }
    }

    if (!hasPatch) {
      return NextResponse.json({ error: 'Cap camp valid per actualitzar' }, { status: 400 })
    }

    cleaned.updatedAt = admin.firestore.Timestamp.now()

    await docRef.set(cleaned, { merge: true })

    const updated = await docRef.get()
    const data = updated.data() || {}

    const incident = {
      id: updated.id,
      ...data,
      createdAt: normalizeTimestamp(data.createdAt),
      updatedAt: normalizeTimestamp(data.updatedAt),
    }

    return NextResponse.json({ incident }, { status: 200 })
  } catch (err) {
    console.error('[incidents PATCH] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as {
      id?: string
      role?: string
      department?: string
      name?: string | null
      email?: string | null
    } | undefined

    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

    const { id } = await ctx.params
    const incidentId = String(id || '').trim()
    if (!incidentId) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const ref = firestoreAdmin.collection('incidents').doc(incidentId)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Incidència no trobada' }, { status: 404 })
    }

    const data = snap.data() || {}
    if (!canDeleteIncident(user, data as { createdById?: string | null; createdBy?: string | null })) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const rawImages = Array.isArray(data.images) ? data.images : []
    const normalizedImages =
      rawImages.length > 0
        ? rawImages
        : data.imageUrl || data.imagePath
          ? [
              {
                url: data.imageUrl || null,
                path: data.imagePath || null,
              },
            ]
          : []

    const imagePaths = normalizedImages
      .map((image) => String(image?.path || '').trim())
      .filter(Boolean)

    const actionsSnap = await firestoreAdmin
      .collection('incident_actions')
      .where('incidentId', '==', incidentId)
      .get()

    const batch = firestoreAdmin.batch()
    actionsSnap.docs.forEach((doc) => batch.delete(doc.ref))
    batch.delete(ref)
    await batch.commit()

    await Promise.all(
      imagePaths.map(async (path) => {
        try {
          await storageAdmin.bucket().file(path).delete({ ignoreNotFound: true })
        } catch {
          // ignore missing storage objects
        }
        await deleteMediaIndexByPath(path)
      })
    )

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('[incidents DELETE] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
