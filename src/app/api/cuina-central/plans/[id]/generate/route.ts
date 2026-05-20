import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import {
  mapArticle,
  mapLog,
  mapMachine,
  mapPlan,
  mapRate,
  mapShift,
} from '@/lib/cuina-central/firestoreMappers'
import { loadAllModelStates } from '@/lib/cuina-central/ml/loadModelStates'
import { generateWeeklyPlan } from '@/lib/cuina-central/planner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.productionPlans

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const { id } = await ctx.params

  const planDoc = await db.collection(COL).doc(id).get()
  if (!planDoc.exists) return NextResponse.json({ error: 'Pla no trobat' }, { status: 404 })
  const plan = mapPlan(planDoc.id, planDoc.data() as Record<string, unknown>)

  const [articlesSnap, machinesSnap, shiftsSnap, ratesSnap, logsSnap, modelStates] =
    await Promise.all([
      db.collection(CUINA_CENTRAL_COLLECTIONS.articles).get(),
      db.collection(CUINA_CENTRAL_COLLECTIONS.machines).get(),
      db.collection(CUINA_CENTRAL_COLLECTIONS.shifts).get(),
      db.collection(CUINA_CENTRAL_COLLECTIONS.machineArticleRates).get(),
      db.collection(CUINA_CENTRAL_COLLECTIONS.productionLogs).orderBy('endedAt', 'desc').limit(1500).get(),
      loadAllModelStates(db),
    ])

  const articles = articlesSnap.docs.map((d) => mapArticle(d.id, d.data() as Record<string, unknown>))
  const articleById = new Map(articles.map((a) => [a.id, a]))

  const needs = plan.needs.map((need) => {
    const article = articleById.get(need.articleId)
    return {
      ...need,
      articleCode: need.articleCode || article?.code || '',
      articleName: need.articleName || article?.name || '',
      unit: need.unit || article?.unit || 'kg',
    }
  })

  const result = generateWeeklyPlan({
    weekStart: plan.weekStart,
    needs,
    shifts: shiftsSnap.docs.map((d) => mapShift(d.id, d.data() as Record<string, unknown>)),
    machines: machinesSnap.docs.map((d) => mapMachine(d.id, d.data() as Record<string, unknown>)),
    rates: ratesSnap.docs.map((d) => mapRate(d.id, d.data() as Record<string, unknown>)),
    logs: logsSnap.docs.map((d) => mapLog(d.id, d.data() as Record<string, unknown>)),
    modelStates,
    operatorCountByShift: plan.operatorCountByShift,
  })

  await db.collection(COL).doc(id).set(
    {
      slots: result.slots,
      warnings: result.warnings,
      totalEstimatedMinutes: result.totalEstimatedMinutes,
      totalCapacityMinutes: result.totalCapacityMinutes,
      overtimeMinutes: result.overtimeMinutes,
      updatedAt: Date.now(),
    },
    { merge: true }
  )

  const updated = await db.collection(COL).doc(id).get()
  return NextResponse.json({
    ok: true,
    plan: mapPlan(updated.id, updated.data() as Record<string, unknown>),
  })
}
