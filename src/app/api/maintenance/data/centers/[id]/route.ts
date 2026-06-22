import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { combineTravelParts } from '@/lib/maintenanceCenterTravel'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PatchBody = {
  travelMinutes?: number
  travelHours?: number
  travelMinutesPart?: number
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as PatchBody

    let travelMinutes: number
    if (body.travelMinutes !== undefined) {
      travelMinutes = Math.max(0, Math.round(Number(body.travelMinutes) || 0))
    } else {
      travelMinutes = combineTravelParts(
        Number(body.travelHours ?? 0),
        Number(body.travelMinutesPart ?? 0)
      )
    }

    if (travelMinutes > 24 * 60) {
      return NextResponse.json(
        { error: 'El temps de desplaçament no pot superar 24 hores' },
        { status: 400 }
      )
    }

    const ref = db.collection('finques').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Centre no trobat' }, { status: 404 })
    }

    await ref.set(
      {
        maintenanceTravelMinutes: travelMinutes,
        maintenanceTravelUpdatedAt: Date.now(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, id, travelMinutes })
  } catch (error) {
    console.error('[maintenance/data/centers/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error desant temps de desplaçament' }, { status: 500 })
  }
}
