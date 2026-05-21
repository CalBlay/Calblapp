import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamGet } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/** Últim run del job delta (col·leccions noves detectades). */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const { status, body } = await mcpUpstreamGet('/jobs/firestore/mapping-delta/status')
  return NextResponse.json(body, { status })
}
