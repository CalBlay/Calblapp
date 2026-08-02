// File: src/app/api/staff/available/route.ts

import { NextResponse } from 'next/server'
import { getPersonnelByDepartment, Personnel } from '@/lib/firestore/personnel'
import { requireAuth } from '@/lib/server/apiAuth'

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(request.url)
  const department = (searchParams.get('department') || '').trim()
  const roleParam  = (searchParams.get('role')       || '').trim() as Personnel['role']

  // Carrega tot el personal disponible d’aquest departament
  const allStaff = await getPersonnelByDepartment(department)

  // Filtra per rol
  const filtered = allStaff.filter(p => p.role === roleParam)

  return NextResponse.json(filtered)
}
