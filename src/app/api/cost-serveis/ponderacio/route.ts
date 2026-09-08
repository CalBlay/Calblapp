import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'
import {
  isPonderacioDept,
  listServeiWeightRows,
  syncPonderacioFromOccurrences,
  updateServeiWeightRow,
  type PonderacioDept,
} from '@/lib/costServeis/serveiWeights'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import { splitServiceTypeLabels } from '@/lib/serveis/utils'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'
const CONFIG_PATH = `${MODULE_PATH}/configuracio`

function readServiceType(d: Record<string, unknown>): string {
  return String(
    d.Servei || d.Servicio || d.service || d.TipusServei || d.tipusServei || d.serviceType || ''
  ).trim()
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView =
    (await canViewUiPath({ user: auth.user, path: CONFIG_PATH })) ||
    (await canViewUiPath({ user: auth.user, path: MODULE_PATH }))
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const deptParam = String(req.nextUrl.searchParams.get('dept') || 'all')
  const dept =
    deptParam === 'all' || isPonderacioDept(deptParam)
      ? (deptParam as PonderacioDept | 'all')
      : 'all'

  const rows = await listServeiWeightRows({ dept })
  return NextResponse.json({ rows })
}

/** PUT: actualitza pesos d’una fila { id, dept?, gestio?, preparacio?, rentat? } */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: CONFIG_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string
    dept?: string
    gestio?: number
    preparacio?: number
    rentat?: number
    active?: boolean
  } | null

  const id = String(body?.id || '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  try {
    const row = await updateServeiWeightRow(id, {
      dept: body?.dept && isPonderacioDept(body.dept) ? body.dept : undefined,
      gestio: body?.gestio,
      preparacio: body?.preparacio,
      rentat: body?.rentat,
      active: typeof body?.active === 'boolean' ? body.active : undefined,
    })
    return NextResponse.json({ row })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 400 }
    )
  }
}

/**
 * POST ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Agafa serveis × espai reals d’Edició del rang → crea només les files noves
 * a ponderacioServeisLogistica / ponderacioServeisCuina (sense trepitjar les existents).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: CONFIG_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const from = String(req.nextUrl.searchParams.get('from') || '').slice(0, 10)
  const to = String(req.nextUrl.searchParams.get('to') || '').slice(0, 10)
  if (!isIsoDateDayParam(from) || !isIsoDateDayParam(to)) {
    return NextResponse.json(
      { error: 'Cal from/to (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const [stageDocs, spaceIndex] = await Promise.all([
      queryStageCollectionDocsInDateRange(db, 'stage_verd', from, to),
      loadSpaceOwnershipIndex(),
    ])

    const occurrences = stageDocs.map((doc) => {
      const d = doc.data() as Record<string, unknown>
      const location = String(d.Ubicacio || '')
      const eventName = String(d.NomEvent || d.summary || '')
      return {
        serviceType: readServiceType(d),
        spaceKind: resolveSpaceKind(spaceIndex, {
          fincaId: d.FincaId ? String(d.FincaId) : null,
          fincaCode: d.FincaCode ? String(d.FincaCode) : null,
          ubicacioCode: d.UbicacioCode ? String(d.UbicacioCode) : null,
          location,
          eventName,
        }),
      }
    })

    const result = await syncPonderacioFromOccurrences(occurrences)
    const rows = await listServeiWeightRows({ dept: 'all' })
    const uniqueParts = [
      ...new Set(
        occurrences.flatMap((o) => splitServiceTypeLabels(o.serviceType))
      ),
    ]
    return NextResponse.json({
      ...result,
      rows,
      scannedEvents: stageDocs.length,
      uniqueTypes: uniqueParts.length,
      classifiedEvents: occurrences.filter((o) => o.spaceKind).length,
    })
  } catch (err) {
    console.error('[cost-serveis/ponderacio POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error sync' },
      { status: 500 }
    )
  }
}
