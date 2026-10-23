import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { filterSuppliersByDepartment, listAllSuppliers } from '@/lib/companySuppliers/server'
import { listRobaSuppliers } from '@/lib/roba-personal/suppliers.server'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireSettingsSuppliersView } from '@/lib/server/settingsApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsSuppliersView(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [maintenanceRows, robaRows] = await Promise.all([
      listAllSuppliers(db),
      listRobaSuppliers(db),
    ])
    const suppliers = [
      ...filterSuppliersByDepartment(maintenanceRows, 'Manteniment').map((supplier) => ({
        ...supplier,
        source: 'manteniment' as const,
        sourceLabel: 'Manteniment',
      })),
      ...robaRows.map((supplier) => ({
        ...supplier,
        source: 'roba' as const,
        sourceLabel: 'Roba personal (RRHH)',
      })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('[settings/suppliers] GET', error)
    return NextResponse.json({ error: 'Error carregant els proveïdors' }, { status: 500 })
  }
}
