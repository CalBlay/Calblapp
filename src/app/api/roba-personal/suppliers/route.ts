export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'
import {
  filterSuppliersByDepartment,
  listAllSuppliers,
  normalizeSupplierDepartmentsInput,
} from '@/lib/companySuppliers/server'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'

/** Mateixa col·lecció que Manteniment → Dades → proveïdors (`SUPPLIERS_COLLECTION`). */
export async function GET() {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.compres)
  if (!auth.ok) return auth.res

  try {
    const all = await listAllSuppliers(db)
    const suppliers = filterSuppliersByDepartment(all, 'Recursos Humans')
    return NextResponse.json({ suppliers })
  } catch (e: unknown) {
    console.error('[roba-personal/suppliers] GET', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.compres)
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal el nom del proveïdor' }, { status: 400 })
    }
    const now = Date.now()
    const supplierDepartments = normalizeSupplierDepartmentsInput(body.supplierDepartments, [
      'Recursos Humans',
    ])
    const payload = {
      name,
      email: String(body.email || '').trim(),
      phone: String(body.phone || '').trim(),
      specialty: String(body.specialty || '').trim(),
      notes: String(body.notes || '').trim(),
      active: body.active !== false,
      supplierDepartments,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(SUPPLIERS_COLLECTION).add(payload)
    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 })
  } catch (e: unknown) {
    console.error('[roba-personal/suppliers] POST', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
