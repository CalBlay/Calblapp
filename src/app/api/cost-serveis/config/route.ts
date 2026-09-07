import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { getServiceCostConfig, saveServiceCostConfig } from '@/lib/costServeis/store'
import type { ServiceCostConfig } from '@/lib/costServeis/types'
import { defaultServiceCostConfig, normalizeFuelConfig } from '@/lib/costServeis/defaults'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const config = await getServiceCostConfig()
  return NextResponse.json({ config })
}

export async function PUT(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canEdit = await canEditUiPath({ user: auth.user, path: `${MODULE_PATH}/configuracio` })
  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Partial<ServiceCostConfig> | null
  if (!body) {
    return NextResponse.json({ error: 'Body invàlid' }, { status: 400 })
  }

  const base = defaultServiceCostConfig()
  const next: ServiceCostConfig = {
    hourlyRates: {
      logistica: Number(body.hourlyRates?.logistica ?? base.hourlyRates.logistica),
      serveis: Number(body.hourlyRates?.serveis ?? base.hourlyRates.serveis),
      cuina: Number(body.hourlyRates?.cuina ?? base.hourlyRates.cuina),
    },
    departures: {
      logistica: {
        ...base.departures.logistica,
        ...(body.departures?.logistica || {}),
      },
      serveis: {
        ...base.departures.serveis,
        ...(body.departures?.serveis || {}),
      },
      cuina: {
        ...base.departures.cuina,
        ...(body.departures?.cuina || {}),
      },
    },
    fuel: normalizeFuelConfig(body.fuel ?? base.fuel),
  }

  const saved = await saveServiceCostConfig(next, auth.user.id)
  return NextResponse.json({ config: saved })
}
