export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { buildEventsWorkersOverview } from '@/lib/informes/buildEventsWorkersOverview'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canViewReportsDomain(auth.user, 'events'))) {
    return reportsDomainForbiddenResponse()
  }

  const payload = await buildEventsWorkersOverview({
    db,
    window: {
      mode: 'rolling',
      days: 90,
    },
  })

  return NextResponse.json({ filterOptions: payload.filterOptions })
}
