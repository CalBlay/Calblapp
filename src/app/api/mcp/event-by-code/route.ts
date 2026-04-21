import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamGet } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/**
 * Esdeveniment complet per `code` (stage_verd) via MCP. Només admin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const code = req.nextUrl.searchParams.get('code')?.trim()
  if (!code) {
    return NextResponse.json({ error: 'Falta el paràmetre code' }, { status: 400 })
  }

  const params = new URLSearchParams({ code })
  const { status, body } = await mcpUpstreamGet('/tools/get_event_by_code', params)
  return NextResponse.json(body, { status })
}
