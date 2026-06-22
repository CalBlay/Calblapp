import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'
import { normalizeSupplierDepartmentsInput } from '@/lib/companySuppliers/server'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const ref = db.collection(SUPPLIERS_COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Proveidor no trobat' }, { status: 404 })
    }

    const patch: Record<string, unknown> = {
      ...(body?.name !== undefined ? { name: String(body.name || '').trim() } : {}),
      ...(body?.email !== undefined ? { email: String(body.email || '').trim() } : {}),
      ...(body?.phone !== undefined ? { phone: String(body.phone || '').trim() } : {}),
      ...(body?.specialty !== undefined ? { specialty: String(body.specialty || '').trim() } : {}),
      ...(body?.notes !== undefined ? { notes: String(body.notes || '').trim() } : {}),
      ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
      updatedAt: Date.now(),
    }
    if (body?.supplierDepartments !== undefined) {
      patch.supplierDepartments = normalizeSupplierDepartmentsInput(body.supplierDepartments, [
        'Manteniment',
      ])
    }
    await ref.set(patch, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/suppliers/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error actualitzant proveidor' }, { status: 500 })
  }
}
