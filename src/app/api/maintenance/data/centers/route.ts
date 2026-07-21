import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'
import {
  flattenMaintenanceLocationNodes,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
} from '@/lib/maintenanceLocationCatalog'
import {
  requireMaintenanceDataAccess,
  requireMaintenanceTicketApiView,
} from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const normalizeTipus = (raw?: unknown) => {
  const value = String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'propi') return 'propi'
  if (value === 'extern' || value === 'externo') return 'extern'
  const code = String(raw || '').trim().toUpperCase()
  if (code.startsWith('CC')) return 'propi'
  return value || '-'
}

const normalizeCode = (raw?: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()

export async function GET(req: Request) {
  const auth = await requireMaintenanceTicketApiView()
  if (!auth.ok) return auth.res

  try {
    const { searchParams } = new URL(req.url)
    const q = normalizeMaintenanceLocationKey(searchParams.get('q') || '')
    const tipusFilter = normalizeMaintenanceLocationKey(searchParams.get('tipus') || '')

    const snap = await db.collection('finques').get()
    let centers = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        const name = String(data.nom || data.name || '').trim()
        const code = String(data.codi || data.code || doc.id || '').trim()
        const tipus = normalizeTipus(data.tipus ?? data.code)
        const locationNodes = sanitizeMaintenanceLocationNodes(
          data.maintenanceLocationNodes,
          data.maintenanceInternalLocations
        )
        const internalLocations = locationNodes.length
          ? flattenMaintenanceLocationNodes(locationNodes)
          : sanitizeMaintenanceInternalLocations(data.maintenanceInternalLocations)
        const travelMinutes = Math.max(
          0,
          Math.round(Number(data.maintenanceTravelMinutes ?? data.travelMinutes ?? 0) || 0)
        )

        return {
          id: doc.id,
          name,
          code,
          tipus,
          travelMinutes,
          internalLocations,
          locationNodes,
          searchable: normalizeMaintenanceLocationKey(
            [
              name,
              code,
              ...internalLocations,
              ...locationNodes.flatMap((location) => location.zones || []),
              String(data.searchable || ''),
            ]
              .filter(Boolean)
              .join(' ')
          ),
        }
      })
      .filter((row) => row.name)

    if (tipusFilter && tipusFilter !== 'all') {
      centers = centers.filter((row) => row.tipus === tipusFilter)
    }

    if (q) {
      centers = centers.filter((row) => row.searchable.includes(q))
    }

    centers.sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))

    return NextResponse.json({
      centers: centers.map(({ searchable: _searchable, ...row }) => row),
    })
  } catch (error) {
    console.error('[maintenance/data/centers] GET error', error)
    return NextResponse.json({ error: 'Error carregant centres' }, { status: 500 })
  }
}

type CreateCenterBody = {
  name?: string
  code?: string
  tipus?: string
  travelMinutes?: number
  locationNodes?: unknown[]
}

export async function POST(req: Request) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json().catch(() => ({}))) as CreateCenterBody
    const name = String(body.name || '').trim()
    const code = normalizeCode(body.code)
    const tipus = normalizeTipus(body.tipus || code)
    const travelMinutes = Math.max(0, Math.round(Number(body.travelMinutes ?? 0) || 0))
    const locationNodes = sanitizeMaintenanceLocationNodes(body.locationNodes)

    if (!name) {
      return NextResponse.json({ error: 'Cal indicar el nom del centre' }, { status: 400 })
    }

    if (travelMinutes > 24 * 60) {
      return NextResponse.json(
        { error: 'El temps de desplacament no pot superar 24 hores' },
        { status: 400 }
      )
    }

    const snap = await db.collection('finques').get()
    const duplicated = snap.docs.some((doc) => {
      const data = doc.data() as Record<string, unknown>
      const currentName = String(data.nom || data.name || '').trim().toLowerCase()
      const currentCode = normalizeCode(data.codi || data.code || doc.id)
      return currentName === name.toLowerCase() || (code && currentCode === code)
    })

    if (duplicated) {
      return NextResponse.json(
        { error: 'Ja existeix un centre amb aquest nom o codi' },
        { status: 409 }
      )
    }

    const ref = db.collection('finques').doc()
    await ref.set({
      nom: name,
      name,
      codi: code || undefined,
      code: code || undefined,
      tipus,
      maintenanceTravelMinutes: travelMinutes,
      maintenanceTravelUpdatedAt: Date.now(),
      maintenanceLocationNodes: locationNodes,
      maintenanceInternalLocations: flattenMaintenanceLocationNodes(locationNodes),
      origen: 'maintenance_manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    return NextResponse.json({
      ok: true,
      center: {
        id: ref.id,
        name,
        code,
        tipus,
        travelMinutes,
        internalLocations: flattenMaintenanceLocationNodes(locationNodes),
        locationNodes,
      },
    })
  } catch (error) {
    console.error('[maintenance/data/centers] POST error', error)
    return NextResponse.json({ error: 'Error creant centre' }, { status: 500 })
  }
}
