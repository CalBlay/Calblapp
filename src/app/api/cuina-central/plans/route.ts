import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapPlan } from '@/lib/cuina-central/firestoreMappers'
import { cleanText } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.productionPlans

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const snap = await db.collection(COL).orderBy('weekStart', 'desc').limit(50).get()
  const plans = snap.docs.map((doc) => mapPlan(doc.id, doc.data() as Record<string, unknown>))
  return NextResponse.json({ plans })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const weekStart = cleanText(body?.weekStart)
  if (!weekStart) {
    return NextResponse.json({ error: 'Cal weekStart (YYYY-MM-DD)' }, { status: 400 })
  }
  const now = Date.now()
  const payload = {
    weekStart,
    status: 'draft',
    operatorCountByShift: body?.operatorCountByShift || {},
    needs: Array.isArray(body?.needs) ? body.needs : [],
    slots: [],
    warnings: [],
    totalEstimatedMinutes: 0,
    totalCapacityMinutes: 0,
    overtimeMinutes: 0,
    createdAt: now,
    updatedAt: now,
  }
  const ref = await db.collection(COL).add(payload)
  return NextResponse.json({ ok: true, id: ref.id })
}
