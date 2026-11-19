export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'
import { buildPreparationsOverview } from '@/lib/informes/buildPreparationsOverview'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 366

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canViewReportsDomain(auth.user, 'preparations'))) {
    return reportsDomainForbiddenResponse()
  }

  const { searchParams } = new URL(req.url)
  const dateFrom = String(searchParams.get('dateFrom') || '').trim()
  const dateTo = String(searchParams.get('dateTo') || '').trim()
  const department = String(searchParams.get('department') || 'Logística').trim()
  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo) || dateTo < dateFrom) {
    return NextResponse.json({ error: 'Rang de dates no vàlid.' }, { status: 400 })
  }
  const span = Math.round(
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000
  ) + 1
  if (span > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'El rang màxim és d\'un any.' }, { status: 400 })
  }
  try {
    return NextResponse.json(
      await buildPreparationsOverview({
        db,
        dateFrom,
        dateTo,
        department,
        preparer: searchParams.get('preparer') || undefined,
        businessLine: searchParams.get('businessLine') || undefined,
      })
    )
  } catch (error) {
    console.error('[reports/preparations/overview] GET error', error)
    return NextResponse.json({ error: 'No s\'ha pogut carregar l\'informe de preparacions.' }, { status: 500 })
  }
}
