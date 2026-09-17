// src/app/api/quadrantsDraft/unconfirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { listAllCollectionIds } from '@/lib/firestoreCollections'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'

export const runtime = 'nodejs'

// ── Utils locals
const norm = (s?: string | null) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  return `quadrants${key.charAt(0).toUpperCase()}${key.slice(1)}`
}

async function resolveDeptCollection(dept: string) {
  const key = norm(dept)
  const cols = await listAllCollectionIds()
  for (const id of cols) {
    const plain = id
      .replace(/^quadrants/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
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
    const canUnconfirm = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/quadrants', 'draft:unconfirm'),
    })
    const [canConfirmDraft, canConfirm, canDeleteDraft] = await Promise.all([
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'draft:confirm'),
      }),
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'confirm'),
      }),
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'draft:delete'),
      }),
    ])
    const canReopen =
      canUnconfirm === true ||
      canConfirmDraft === true ||
      canConfirm === true ||
      canDeleteDraft === true
    if (!canReopen) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const payload = (await req.json()) as { department: string; eventId: string }
    const department = payload.department
    const eventId = normalizeEventId(payload.eventId)
    if (!department || !eventId) {
      return NextResponse.json({ ok: false, error: 'Bad payload' }, { status: 400 })
    }

    const coll = await resolveDeptCollection(department)
    const collection = db.collection(coll)
    const directRef = collection.doc(eventId)
    const directSnap = await directRef.get()
    const byEvent = await collection.where('eventId', '==', eventId).get()

    const refs = new Map<string, FirebaseFirestore.DocumentReference>()
    if (directSnap.exists) refs.set(directRef.id, directRef)
    byEvent.docs.forEach((doc) => refs.set(doc.id, doc.ref))

    if (refs.size === 0) {
      await directRef.set(
        {
          status: 'draft',
          confirmedAt: null,
          confirmedBy: null,
          updatedAt: new Date(),
        },
        { merge: true }
      )
    } else {
      const batch = db.batch()
      refs.forEach((ref) => {
        batch.set(
          ref,
          {
            status: 'draft',
            confirmedAt: null,
            confirmedBy: null,
            updatedAt: new Date(),
          },
          { merge: true }
        )
      })
      await batch.commit()
    }

    revalidateQuadrantsListCache()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quadrantsDraft/unconfirm] error', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
