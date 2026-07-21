import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  buildControlledMaintenanceLocations,
  buildMaintenanceCenterHierarchy,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
} from '@/lib/maintenanceLocationCatalog'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceMachines'

const buildLabel = (code?: string, name?: string) => {
  const cleanCode = String(code || '').trim()
  const cleanName = String(name || '').trim()
  if (cleanCode && cleanName) return `${cleanCode} · ${cleanName}`
  return cleanCode || cleanName
}

async function loadCenterCatalog() {
  const snap = await db.collection('finques').get()
  return snap.docs.map((doc) => {
    const data = doc.data() || {}
    return {
      id: doc.id,
      name: String(data.nom || data.name || '').trim(),
      code: String(data.codi || data.code || '').trim(),
      tipus: String(data.tipus || '').trim().toLowerCase(),
      internalLocations: sanitizeMaintenanceInternalLocations(data.maintenanceInternalLocations),
      locationNodes: sanitizeMaintenanceLocationNodes(
        (data as Record<string, unknown>).maintenanceLocationNodes,
        (data as Record<string, unknown>).maintenanceInternalLocations
      ),
    }
  })
}

function resolveMachineHierarchy(
  centers: Awaited<ReturnType<typeof loadCenterCatalog>>,
  centerName: string,
  locationName: string,
  zoneName: string
) {
  const hierarchy = buildMaintenanceCenterHierarchy(centers)
  const center = hierarchy.find((item) => item.name === centerName)
  if (!center) {
    return { error: 'Cal seleccionar un centre valid' }
  }

  const location = center.locations.find((item) => item.name === locationName)
  if (!location) {
    return { error: 'Cal seleccionar una ubicacio valida per aquest centre' }
  }

  if (zoneName) {
    const hasZone = location.zones.includes(zoneName)
    if (!hasZone) {
      return { error: 'La zona seleccionada no es valida per aquesta ubicacio' }
    }
  }

  return {
    center: center.name,
    location: location.name,
    zone: zoneName,
  }
}

export async function GET() {
  const auth = await requireMaintenanceDataAccess()
  if (!auth.ok) return auth.res

  try {
    const snap = await db.collection(COLLECTION).orderBy('name', 'asc').get()
    const machines = snap.docs.map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        code: String(data.code || '').trim(),
        name: String(data.name || '').trim(),
        label: buildLabel(data.code, data.name),
        center: String(data.center || '').trim(),
        location: String(data.location || '').trim(),
        zone: String(data.zone || '').trim(),
        brand: String(data.brand || '').trim(),
        model: String(data.model || '').trim(),
        serialNumber: String(data.serialNumber || '').trim(),
        supplierId: String(data.supplierId || '').trim(),
        supplierName: String(data.supplierName || '').trim(),
        active: data.active !== false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      }
    })
    return NextResponse.json({ machines })
  } catch (error) {
    console.error('[maintenance/data/machines] GET error', error)
    return NextResponse.json({ error: 'Error carregant maquinaria' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const body = await req.json().catch(() => ({}))
    const code = String(body?.code || '').trim()
    const name = String(body?.name || '').trim()
    const center = String(body?.center || '').trim()
    const location = String(body?.location || '').trim()
    const zone = String(body?.zone || '').trim()

    if (!code && !name) {
      return NextResponse.json({ error: 'Cal informar codi o nom' }, { status: 400 })
    }
    if (!center) {
      return NextResponse.json({ error: 'Cal seleccionar un centre' }, { status: 400 })
    }
    if (!location) {
      return NextResponse.json({ error: 'Cal seleccionar una ubicacio' }, { status: 400 })
    }

    const centers = await loadCenterCatalog()
    const hierarchy = resolveMachineHierarchy(centers, center, location, zone)
    if ('error' in hierarchy) {
      return NextResponse.json({ error: hierarchy.error }, { status: 400 })
    }

    const allowedLocations = buildControlledMaintenanceLocations(centers)
    if (!allowedLocations.includes(hierarchy.location)) {
      return NextResponse.json({ error: 'La ubicacio seleccionada no es valida' }, { status: 400 })
    }

    const now = Date.now()
    const payload = {
      code,
      name,
      label: buildLabel(code, name),
      center: hierarchy.center,
      location: hierarchy.location,
      zone: hierarchy.zone,
      brand: String(body?.brand || '').trim(),
      model: String(body?.model || '').trim(),
      serialNumber: String(body?.serialNumber || '').trim(),
      supplierId: String(body?.supplierId || '').trim(),
      supplierName: String(body?.supplierName || '').trim(),
      active: body?.active !== false,
      createdAt: now,
      updatedAt: now,
    }

    const ref = await db.collection(COLLECTION).add(payload)
    return NextResponse.json({ ok: true, id: ref.id })
  } catch (error) {
    console.error('[maintenance/data/machines] POST error', error)
    return NextResponse.json({ error: 'Error desant maquinaria' }, { status: 500 })
  }
}
