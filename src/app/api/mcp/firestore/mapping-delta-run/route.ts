import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamPost } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/** Executa repàs delta (detecta col·leccions noves respecte l'últim run). */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  let payload: Record<string, unknown> = {}
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    payload = {}
  }

  const { status, body } = await mcpUpstreamPost('/jobs/firestore/mapping-delta/run', {
    q: typeof payload.q === 'string' ? payload.q : '',
    limit: typeof payload.limit === 'number' ? payload.limit : 500,
    sampleLimit: typeof payload.sampleLimit === 'number' ? payload.sampleLimit : 8,
  })

  return NextResponse.json(body, { status })
}
