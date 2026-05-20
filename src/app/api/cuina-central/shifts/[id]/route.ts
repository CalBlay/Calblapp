import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { cleanText, shiftDurationMinutes, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.shifts

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.code !== undefined) patch.code = cleanText(body.code)
  if (body?.name !== undefined) patch.name = cleanText(body.name)
  if (body?.startTime !== undefined) patch.startTime = cleanText(body.startTime)
  if (body?.endTime !== undefined) patch.endTime = cleanText(body.endTime)
  if (body?.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder) || 0
  if (body?.active !== undefined) patch.active = body.active !== false
  if (body?.customFields !== undefined) patch.customFields = toCustomFields(body.customFields)
  if (patch.startTime && patch.endTime) {
    patch.durationMinutes = shiftDurationMinutes(
      String(patch.startTime),
      String(patch.endTime)
    )
  } else {
    const current = await db.collection(COL).doc(id).get()
    const data = current.data() || {}
    const start = cleanText(body?.startTime) || cleanText(data.startTime)
    const end = cleanText(body?.endTime) || cleanText(data.endTime)
    if (start && end) patch.durationMinutes = shiftDurationMinutes(start, end)
  }
  await db.collection(COL).doc(id).set(patch, { merge: true })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  await db.collection(COL).doc(id).delete()
  return NextResponse.json({ ok: true })
}
