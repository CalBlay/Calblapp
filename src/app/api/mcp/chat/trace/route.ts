import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamGet } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/** Replay / audit d'una consulta MCP per traceId (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const traceId = req.nextUrl.searchParams.get('traceId')?.trim() || ''
  if (!traceId) {
    return NextResponse.json({ ok: false, error: 'Falta traceId' }, { status: 400 })
  }

  const params = new URLSearchParams({ traceId })
  const { status, body } = await mcpUpstreamGet('/chat/trace', params)
  return NextResponse.json(body, { status })
}
