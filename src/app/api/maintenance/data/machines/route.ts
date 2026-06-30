import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  buildControlledMaintenanceLocations,
  sanitizeMaintenanceInternalLocations,
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

async function loadAllowedLocations() {
  const snap = await db.collection('finques').get()
  return snap.docs.map((doc) => {
    const data = doc.data() || {}
    return {
      id: doc.id,
      name: String(data.nom || data.name || '').trim(),
      code: String(data.codi || data.code || '').trim(),
      tipus: String(data.tipus || '').trim().toLowerCase(),
      internalLocations: sanitizeMaintenanceInternalLocations(data.maintenanceInternalLocations),
    }
  })
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
        location: String(data.location || '').trim(),
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
    const location = String(body?.location || '').trim()

    if (!code && !name) {
      return NextResponse.json({ error: 'Cal informar codi o nom' }, { status: 400 })
    }
    if (!location) {
      return NextResponse.json({ error: 'Cal seleccionar una ubicacio valida' }, { status: 400 })
    }

    const allowedLocations = buildControlledMaintenanceLocations(await loadAllowedLocations())
    if (!allowedLocations.includes(location)) {
      return NextResponse.json({ error: 'La ubicacio seleccionada no es valida' }, { status: 400 })
    }

    const now = Date.now()
    const payload = {
      code,
      name,
      label: buildLabel(code, name),
      location,
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
