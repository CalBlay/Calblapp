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

  if (zoneName && !location.zones.includes(zoneName)) {
    return { error: 'La zona seleccionada no es valida per aquesta ubicacio' }
  }

  return {
    center: center.name,
    location: location.name,
    zone: zoneName,
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const ref = db.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Maquina no trobada' }, { status: 404 })
    }

    const current = snap.data() || {}
    const code =
      body?.code !== undefined ? String(body.code || '').trim() : String(current.code || '').trim()
    const name =
      body?.name !== undefined ? String(body.name || '').trim() : String(current.name || '').trim()
    const center =
      body?.center !== undefined ? String(body.center || '').trim() : String(current.center || '').trim()
    const location =
      body?.location !== undefined
        ? String(body.location || '').trim()
        : String(current.location || '').trim()
    const zone =
      body?.zone !== undefined ? String(body.zone || '').trim() : String(current.zone || '').trim()

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

    await ref.set(
      {
        ...(body?.code !== undefined ? { code } : {}),
        ...(body?.name !== undefined ? { name } : {}),
        ...(body?.center !== undefined ? { center: hierarchy.center } : {}),
        ...(body?.location !== undefined ? { location: hierarchy.location } : {}),
        ...(body?.zone !== undefined ? { zone: hierarchy.zone } : {}),
        ...(body?.brand !== undefined ? { brand: String(body.brand || '').trim() } : {}),
        ...(body?.model !== undefined ? { model: String(body.model || '').trim() } : {}),
        ...(body?.serialNumber !== undefined
          ? { serialNumber: String(body.serialNumber || '').trim() }
          : {}),
        ...(body?.supplierId !== undefined ? { supplierId: String(body.supplierId || '').trim() } : {}),
        ...(body?.supplierName !== undefined
          ? { supplierName: String(body.supplierName || '').trim() }
          : {}),
        ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
        label: buildLabel(code, name),
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/machines/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error actualitzant maquinaria' }, { status: 500 })
  }
}
