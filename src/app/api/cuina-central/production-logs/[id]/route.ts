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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.quantityProduced !== undefined) patch.quantityProduced = Number(body.quantityProduced)
  if (body?.quantityRejected !== undefined) patch.quantityRejected = Number(body.quantityRejected)
  if (body?.startedAt !== undefined) patch.startedAt = cleanText(body.startedAt)
  if (body?.endedAt !== undefined) patch.endedAt = cleanText(body.endedAt)
  if (body?.operatorNames !== undefined) patch.operatorNames = cleanText(body.operatorNames)
  if (body?.notes !== undefined) patch.notes = cleanText(body.notes)
  if (body?.customFields !== undefined) patch.customFields = toCustomFields(body.customFields)

  const current = await db.collection(COL).doc(id).get()
  const data = current.data() || {}
  const startedAt = cleanText(patch.startedAt) || cleanText(data.startedAt)
  const endedAt = cleanText(patch.endedAt) || cleanText(data.endedAt)
  if (startedAt && endedAt) patch.durationMinutes = isoDurationMinutes(startedAt, endedAt)

  await db.collection(COL).doc(id).set(patch, { merge: true })

  const merged = await db.collection(COL).doc(id).get()
  if (merged.exists) {
    const log = mapLog(merged.id, merged.data() as Record<string, unknown>)
    try {
      await ingestProductionLog(db, id, log)
      await buildDailyDecisionReport(db, dateKeyFromIso(log.endedAt))
    } catch (err) {
      console.error('[cuina-central/production-logs] ML re-ingest', err)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  await db.collection(COL).doc(id).delete()
  return NextResponse.json({ ok: true })
}
