import { NextRequest, NextResponse } from 'next/server'
import { loadPremises } from '@/services/premises'
import { requireQuadrantsModuleRead } from '@/lib/server/quadrantsReadAuth'
import { QUADRANTS_ALLOWED_DEPARTMENTS } from '@/lib/quadrantsPermissions'

export const runtime = 'nodejs'

const normalizeDepartment = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function GET(req: NextRequest) {
  const auth = await requireQuadrantsModuleRead()
  if (!auth.ok) return auth.res

  try {
    const department = normalizeDepartment(
      req.nextUrl.searchParams.get('department') || auth.user.department
    )
    if (!QUADRANTS_ALLOWED_DEPARTMENTS.has(department)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    const { premises } = await loadPremises(department)
    const providers = (premises.ettProviders || []).filter(
      (provider) => provider.active !== false && provider.name && provider.email.includes('@')
    )
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('[quadrants/ett-providers GET]', error)
    return NextResponse.json({ error: 'No s’han pogut carregar les empreses ETT' }, { status: 500 })
  }
}
