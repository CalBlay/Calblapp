import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { cleanText, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.machines

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.code !== undefined) patch.code = cleanText(body.code)
  if (body?.name !== undefined) patch.name = cleanText(body.name)
  if (body?.location !== undefined) patch.location = cleanText(body.location)
  if (body?.zone !== undefined) patch.zone = cleanText(body.zone)
  if (body?.mapX !== undefined) patch.mapX = body.mapX == null ? null : Number(body.mapX)
  if (body?.mapY !== undefined) patch.mapY = body.mapY == null ? null : Number(body.mapY)
  if (body?.active !== undefined) patch.active = body.active !== false
  if (body?.customFields !== undefined) patch.customFields = toCustomFields(body.customFields)
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
