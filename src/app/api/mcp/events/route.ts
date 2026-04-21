import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamGet } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/**
 * Proxy cap al MCP (Cloud Run) per llistar esdeveniments (stage_verd via MCP).
 * Només administradors. La clau MCP només viu al servidor (Vercel env).
 *
 * Env: MCP_SERVER_URL (ex. https://calblay-mcp-server-....run.app), MCP_API_KEY
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const params = new URLSearchParams()
  req.nextUrl.searchParams.forEach((value, key) => {
    params.set(key, value)
  })

  const { status, body } = await mcpUpstreamGet('/tools/get_events', params)
  return NextResponse.json(body, { status })
}
