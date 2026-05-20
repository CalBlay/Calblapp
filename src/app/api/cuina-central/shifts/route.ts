import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapShift } from '@/lib/cuina-central/firestoreMappers'
import { cleanText, shiftDurationMinutes, slugDocId, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.shifts

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const snap = await db.collection(COL).orderBy('sortOrder', 'asc').get()
  const shifts = snap.docs.map((doc) => mapShift(doc.id, doc.data() as Record<string, unknown>))
  return NextResponse.json({ shifts })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const code = cleanText(body?.code)
  const name = cleanText(body?.name)
  const startTime = cleanText(body?.startTime)
  const endTime = cleanText(body?.endTime)
  if (!code || !name || !startTime || !endTime) {
    return NextResponse.json({ error: 'Cal codi, nom i horari (inici/fi)' }, { status: 400 })
  }
  const now = Date.now()
  const id = slugDocId(code)
  const payload = {
    code,
    name,
    startTime,
    endTime,
    durationMinutes: shiftDurationMinutes(startTime, endTime),
    sortOrder: Number(body?.sortOrder) || 0,
    active: body?.active !== false,
    customFields: toCustomFields(body?.customFields),
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COL).doc(id).set(payload, { merge: true })
  return NextResponse.json({ ok: true, id })
}
