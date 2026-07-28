import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { listAllCollectionIds } from '@/lib/firestoreCollections'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import {
  docMatchesServeisPhaseScope,
  resolveServeisPhaseScope,
} from '@/lib/quadrantsServeisPhaseScope'

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
  phaseDate?: string
  startDate?: string
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

    const body = await req.json()
    const department = body?.department
    const eventId = body?.eventId
    const phaseKey = body?.phaseKey || body?.phaseType || body?.phaseLabel || ''
    const phaseDate = body?.phaseDate || body?.startDate || ''
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
    const phaseScope = phaseKey
      ? resolveServeisPhaseScope({
          phaseType: body?.phaseType || phaseKey,
          phaseLabel: body?.phaseLabel || phaseKey,
          phaseDate,
        })
      : null

    if (directSnap.exists) {
      const data = directSnap.data() as QuadrantDraftSnap
      const phases = Array.isArray(data?.logisticaPhases) ? data.logisticaPhases : []
      const deptNorm = norm(department)
      const target = String(phaseKey || '').toLowerCase().trim()

      if (phaseKey && deptNorm === 'logistica' && phases.length > 0) {
        const next = phases.filter((phase) => {
          const key = (phase?.key || phase?.label || '').toString().toLowerCase().trim()
          return key !== target
        })
        await directRef.set({ logisticaPhases: next }, { merge: true })
        revalidateQuadrantsListCache()
        return NextResponse.json({ ok: true, phaseDeleted: true, deletedCount: 1 })
      }

      const batch = db.batch()
      const shouldDeleteDirect =
        !phaseScope ||
        docMatchesServeisPhaseScope(
          directSnap.id,
          (directSnap.data() as Record<string, unknown>) || {},
          phaseScope
        )
      if (shouldDeleteDirect) batch.delete(directRef)
      byEvent.docs.forEach((doc) => {
        if (doc.id === directRef.id) return
        if (
          phaseScope &&
          !docMatchesServeisPhaseScope(
            doc.id,
            (doc.data() as Record<string, unknown>) || {},
            phaseScope
          )
        ) {
          return
        }
        batch.delete(doc.ref)
      })
      await batch.commit()
      revalidateQuadrantsListCache()
      return NextResponse.json({
        ok: true,
        deletedCount:
          (shouldDeleteDirect ? 1 : 0) +
          byEvent.docs.filter((doc) => {
            if (doc.id === directRef.id) return false
            if (!phaseScope) return true
            return docMatchesServeisPhaseScope(
              doc.id,
              (doc.data() as Record<string, unknown>) || {},
              phaseScope
            )
          }).length,
      })
    }

    if (byEvent.empty) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, deletedCount: 0 })
    }

    const docsToDelete = byEvent.docs.filter((doc) => {
      if (!phaseScope) return true
      return docMatchesServeisPhaseScope(
        doc.id,
        (doc.data() as Record<string, unknown>) || {},
        phaseScope
      )
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
