import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { COST_SERVEIS_DEPARTMENTS, type CostServeisDepartment } from '@/lib/costServeis/types'
import { estimateManualTrip } from '@/lib/costServeis/manualServices'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    dept?: string
    location?: string
    vehicleType?: string
    vehicleCount?: number
    cacheOnly?: boolean
  } | null

  const dept = String(body?.dept || '').trim()
  if (!(COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(dept)) {
    return NextResponse.json({ error: 'Departament invàlid' }, { status: 400 })
  }

  try {
    const estimate = await estimateManualTrip({
      dept: dept as CostServeisDepartment,
      location: String(body?.location || ''),
      vehicleType: body?.vehicleType,
      vehicleCount: body?.vehicleCount,
      cacheOnly: Boolean(body?.cacheOnly),
    })
    return NextResponse.json({ estimate })
  } catch (err) {
    console.error('[cost-serveis/manual-services/estimate]', err)
    return NextResponse.json({ error: 'Error estimant km/combustible' }, { status: 500 })
  }
}
