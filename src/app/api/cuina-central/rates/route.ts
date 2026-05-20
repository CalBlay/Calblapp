import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapRate } from '@/lib/cuina-central/firestoreMappers'
import { cleanText, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.machineArticleRates

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const snap = await db.collection(COL).get()
  const rates = snap.docs.map((doc) => mapRate(doc.id, doc.data() as Record<string, unknown>))
  return NextResponse.json({ rates })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const machineId = cleanText(body?.machineId)
  const articleId = cleanText(body?.articleId)
  const qtyPerHour = Number(body?.qtyPerHour)
  if (!machineId || !articleId || !Number.isFinite(qtyPerHour) || qtyPerHour <= 0) {
    return NextResponse.json({ error: 'Cal màquina, article i rendiment (qty/h)' }, { status: 400 })
  }
  const now = Date.now()
  const payload = {
    machineId,
    machineCode: cleanText(body?.machineCode),
    machineName: cleanText(body?.machineName),
    articleId,
    articleCode: cleanText(body?.articleCode),
    articleName: cleanText(body?.articleName),
    unit: cleanText(body?.unit) || 'kg',
    qtyPerHour,
    notes: cleanText(body?.notes),
    customFields: toCustomFields(body?.customFields),
    createdAt: now,
    updatedAt: now,
  }
  const ref = await db.collection(COL).add(payload)
  return NextResponse.json({ ok: true, id: ref.id })
}
