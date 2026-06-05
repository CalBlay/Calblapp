import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'
import {
  filterSuppliersByDepartment,
  listAllSuppliers,
  normalizeSupplierDepartmentsInput,
} from '@/lib/companySuppliers/server'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMaintenanceDataAccess()
  if (!auth.ok) return auth.res

  try {
    const all = await listAllSuppliers(db)
    const suppliers = filterSuppliersByDepartment(all, 'Manteniment')
    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('[maintenance/data/suppliers] GET error', error)
    return NextResponse.json({ error: 'Error carregant proveidors' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireMaintenanceDataAccess()
  if (!auth.ok) return auth.res

  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal informar el nom del proveidor' }, { status: 400 })
    }
    const now = Date.now()
    const supplierDepartments = normalizeSupplierDepartmentsInput(body?.supplierDepartments, ['Manteniment'])
    const payload = {
      name,
      email: String(body?.email || '').trim(),
      phone: String(body?.phone || '').trim(),
      specialty: String(body?.specialty || '').trim(),
      notes: String(body?.notes || '').trim(),
      active: body?.active !== false,
      supplierDepartments,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(SUPPLIERS_COLLECTION).add(payload)
    return NextResponse.json({ ok: true, id: ref.id })
  } catch (error) {
    console.error('[maintenance/data/suppliers] POST error', error)
    return NextResponse.json({ error: 'Error desant proveidor' }, { status: 500 })
  }
}
