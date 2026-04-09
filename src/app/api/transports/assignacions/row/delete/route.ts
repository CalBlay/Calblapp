import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import {
  parseConductorSlotIndex,
  parsePendingAssignacionsRowId,
} from '@/lib/transportAssignacionsRowSlot'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type QuadrantConductorRecord = { id?: string }
type QuadrantRecord = Record<string, unknown> & {
  code?: string
  conductors?: QuadrantConductorRecord[]
}

type TokenLike = {
  name?: string
  email?: string
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const authToken = token as TokenLike

    const body = await req.json()
    const {
      eventCode,
      department,
      rowId,
      quadrantDocId,
      conductorIndex,
    } = body as {
      eventCode?: string
      department?: string
      rowId?: string
      quadrantDocId?: string
      conductorIndex?: unknown
    }

    if (!eventCode || !department || !rowId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const colName = `quadrants${cap(department)}`
    const qidBody = typeof quadrantDocId === 'string' ? quadrantDocId.trim() : ''
    const fromPendingId = parsePendingAssignacionsRowId(rowId)
    const effectiveQid = qidBody || fromPendingId?.quadrantDocId || ''

    let ref: FirebaseFirestore.DocumentReference
    let data: QuadrantRecord

    if (effectiveQid) {
      const docSnap = await db.collection(colName).doc(effectiveQid).get()
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Quadrant not found' }, { status: 404 })
      }
      const d = docSnap.data() as QuadrantRecord
      if (String(d.code ?? '') !== String(eventCode)) {
        return NextResponse.json({ error: 'Event code mismatch' }, { status: 400 })
      }
      ref = docSnap.ref
      data = d
    } else {
      const snap = await db
        .collection(colName)
        .where('code', '==', String(eventCode))
        .limit(1)
        .get()

      if (snap.empty) {
        return NextResponse.json({ error: 'Quadrant not found' }, { status: 404 })
      }

      ref = snap.docs[0].ref
      data = snap.docs[0].data() as QuadrantRecord
    }

    const conductors = Array.isArray(data.conductors) ? data.conductors : []

    let slotIdx = parseConductorSlotIndex(conductorIndex)
    if (slotIdx === null && fromPendingId) slotIdx = fromPendingId.conductorIndex

    let nextConductors: QuadrantConductorRecord[]

    if (
      fromPendingId &&
      ref.id === fromPendingId.quadrantDocId &&
      fromPendingId.conductorIndex >= 0 &&
      fromPendingId.conductorIndex < conductors.length
    ) {
      nextConductors = conductors.filter((_, i) => i !== fromPendingId.conductorIndex)
    } else if (
      effectiveQid &&
      slotIdx !== null &&
      slotIdx >= 0 &&
      slotIdx < conductors.length
    ) {
      nextConductors = conductors.filter((_, i) => i !== slotIdx)
    } else {
      nextConductors = conductors.filter((c) => c.id !== rowId)
    }

    await ref.update({
      conductors: nextConductors,
      updatedAt: new Date().toISOString(),
      updatedBy: authToken.name || authToken.email || 'system',
    })

    revalidateQuadrantsListCache()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[row/delete]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
