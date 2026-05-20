import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapLog } from '@/lib/cuina-central/firestoreMappers'
import { ingestProductionLog } from '@/lib/cuina-central/ml/ingest'
import { buildDailyDecisionReport } from '@/lib/cuina-central/ml/dailyReport'
import { dateKeyFromIso } from '@/lib/cuina-central/ml/constants'
import { cleanText, isoDurationMinutes, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.productionLogs

export async function GET(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200))

  const snap = await db.collection(COL).orderBy('endedAt', 'desc').limit(limit)
  let logs = snap.docs.map((doc) => mapLog(doc.id, doc.data() as Record<string, unknown>))
  if (from) logs = logs.filter((l) => l.endedAt >= from)
  if (to) logs = logs.filter((l) => l.endedAt <= to)
  return NextResponse.json({ logs })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const startedAt = cleanText(body?.startedAt)
  const endedAt = cleanText(body?.endedAt)
  const quantityProduced = Number(body?.quantityProduced)
  if (!startedAt || !endedAt || !Number.isFinite(quantityProduced) || quantityProduced <= 0) {
    return NextResponse.json({ error: 'Cal inici, fi i quantitat produïda' }, { status: 400 })
  }
  const now = Date.now()
  const payload = {
    articleId: cleanText(body?.articleId),
    articleCode: cleanText(body?.articleCode),
    articleName: cleanText(body?.articleName),
    machineId: cleanText(body?.machineId),
    machineCode: cleanText(body?.machineCode),
    machineName: cleanText(body?.machineName),
    shiftId: cleanText(body?.shiftId),
    shiftName: cleanText(body?.shiftName),
    unit: cleanText(body?.unit) || 'kg',
    quantityProduced,
    quantityRejected: Number(body?.quantityRejected) || 0,
    startedAt,
    endedAt,
    durationMinutes: isoDurationMinutes(startedAt, endedAt),
    operatorNames: cleanText(body?.operatorNames),
    notes: cleanText(body?.notes),
    customFields: toCustomFields(body?.customFields),
    createdAt: now,
    updatedAt: now,
  }
  const ref = await db.collection(COL).add(payload)
  try {
    const ml = await ingestProductionLog(db, ref.id, {
      ...payload,
      customFields: payload.customFields,
    })
    await buildDailyDecisionReport(db, dateKeyFromIso(endedAt))
    return NextResponse.json({ ok: true, id: ref.id, ml })
  } catch (err) {
    console.error('[cuina-central/production-logs] ML ingest error', err)
    return NextResponse.json({ ok: true, id: ref.id, mlWarning: 'Registre desat; ML pendent de recàlcul' })
  }
}
