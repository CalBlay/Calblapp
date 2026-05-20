import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapPlan } from '@/lib/cuina-central/firestoreMappers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.productionPlans

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  const doc = await db.collection(COL).doc(id).get()
  if (!doc.exists) return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  return NextResponse.json({ plan: mapPlan(doc.id, doc.data() as Record<string, unknown>) })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.status !== undefined) patch.status = body.status === 'confirmed' ? 'confirmed' : 'draft'
  if (body?.operatorCountByShift !== undefined) patch.operatorCountByShift = body.operatorCountByShift
  if (body?.needs !== undefined) patch.needs = body.needs
  if (body?.slots !== undefined) patch.slots = body.slots
  if (body?.warnings !== undefined) patch.warnings = body.warnings
  if (body?.totalEstimatedMinutes !== undefined) patch.totalEstimatedMinutes = Number(body.totalEstimatedMinutes)
  if (body?.totalCapacityMinutes !== undefined) patch.totalCapacityMinutes = Number(body.totalCapacityMinutes)
  if (body?.overtimeMinutes !== undefined) patch.overtimeMinutes = Number(body.overtimeMinutes)
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
