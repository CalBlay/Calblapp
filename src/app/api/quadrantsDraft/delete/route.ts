import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { listAllCollectionIds } from '@/lib/firestoreCollections'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'

export const runtime = 'nodejs'

const norm = (v?: string) =>
  (v || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

type LogisticsPhaseRow = { key?: string; label?: string }

type QuadrantDraftSnap = {
  logisticaPhases?: LogisticsPhaseRow[]
  phaseKey?: string
  phaseType?: string
  phaseLabel?: string
}

const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1)
  return `quadrants${capitalized}`
}

async function resolveDeptCollection(dept: string) {
  const key = norm(dept)
  const cols = await listAllCollectionIds()
  for (const id of cols) {
    const plain = id
      .replace(/^quadrants?/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
    if (plain === key) return id
  }
  return canonicalCollectionFor(dept)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
    if (!canView) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const canDelete = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/quadrants', 'draft:delete'),
    })
    if (canDelete !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { department, eventId, phaseKey } = await req.json()
    const canonicalEventId = normalizeEventId(eventId)

    if (!department || !canonicalEventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing department or eventId' },
        { status: 400 }
      )
    }

    const coll = await resolveDeptCollection(department)
    const collection = db.collection(coll)
    const directRef = collection.doc(String(canonicalEventId))
    const directSnap = await directRef.get()
    const byEvent = await collection.where('eventId', '==', String(canonicalEventId)).get()

    if (directSnap.exists) {
      if (phaseKey) {
        const data = directSnap.data() as QuadrantDraftSnap
        const phases = Array.isArray(data?.logisticaPhases) ? data.logisticaPhases : []
        const target = String(phaseKey).toLowerCase().trim()
        const next = phases.filter((phase) => {
          const key = (phase?.key || phase?.label || '').toString().toLowerCase().trim()
          return key !== target
        })
        await directRef.set({ logisticaPhases: next }, { merge: true })
        revalidateQuadrantsListCache()
        return NextResponse.json({ ok: true, phaseDeleted: true, deletedCount: 1 })
      }

      const batch = db.batch()
      batch.delete(directRef)
      byEvent.docs.forEach((doc) => {
        if (doc.id !== directRef.id) batch.delete(doc.ref)
      })
      await batch.commit()
      revalidateQuadrantsListCache()
      return NextResponse.json({ ok: true, deletedCount: 1 + byEvent.docs.filter((doc) => doc.id !== directRef.id).length })
    }

    if (byEvent.empty) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, deletedCount: 0 })
    }

    const targetPhase = String(phaseKey || '').toLowerCase().trim()
    const docsToDelete = byEvent.docs.filter((doc) => {
      if (!targetPhase) return true
      const data = doc.data() as QuadrantDraftSnap
      const keys = [data?.phaseKey, data?.phaseType, data?.phaseLabel]
        .map((value) => String(value || '').toLowerCase().trim())
        .filter(Boolean)
      return keys.includes(targetPhase)
    })

    if (docsToDelete.length === 0) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, deletedCount: 0 })
    }

    const batch = db.batch()
    docsToDelete.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()

    revalidateQuadrantsListCache()
    return NextResponse.json({ ok: true, deletedCount: docsToDelete.length })
  } catch (e) {
    console.error('[quadrantsDraft/delete] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
