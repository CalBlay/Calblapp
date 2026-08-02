export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { buildEventsWorkersOverview } from '@/lib/informes/buildEventsWorkersOverview'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  const payload = await buildEventsWorkersOverview({
    db,
    window: {
      mode: 'rolling',
      days: 90,
    },
  })

  return NextResponse.json({ filterOptions: payload.filterOptions })
}
