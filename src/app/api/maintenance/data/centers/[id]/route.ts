import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { combineTravelParts } from '@/lib/maintenanceCenterTravel'
import { sanitizeMaintenanceInternalLocations } from '@/lib/maintenanceLocationCatalog'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PatchBody = {
  travelMinutes?: number
  travelHours?: number
  travelMinutesPart?: number
  internalLocations?: string[]
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

    const patch: Record<string, unknown> = {
      maintenanceTravelMinutes: travelMinutes,
      maintenanceTravelUpdatedAt: Date.now(),
    }
    if (body.internalLocations !== undefined) {
      patch.maintenanceInternalLocations = sanitizeMaintenanceInternalLocations(body.internalLocations)
    }

    await ref.set(patch, { merge: true })

    return NextResponse.json({
      ok: true,
      id,
      travelMinutes,
      internalLocations:
        body.internalLocations !== undefined
          ? sanitizeMaintenanceInternalLocations(body.internalLocations)
          : undefined,
    })
  } catch (error) {
    console.error('[maintenance/data/centers/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error desant temps de desplaçament' }, { status: 500 })
  }
}
