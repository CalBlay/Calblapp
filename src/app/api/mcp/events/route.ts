import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

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

  const base = (process.env.MCP_SERVER_URL || '').replace(/\/$/, '')
  const apiKey = process.env.MCP_API_KEY || ''
  if (!base || !apiKey) {
    return NextResponse.json(
      { error: 'Falten MCP_SERVER_URL o MCP_API_KEY al servidor' },
      { status: 500 }
    )
  }

  const target = new URL(`${base}/tools/get_events`)
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value)
  })

  const upstream = await fetch(target.toString(), {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store'
  })

  const text = await upstream.text()
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    body = { error: 'Resposta MCP no JSON', raw: text.slice(0, 500) }
  }

  return NextResponse.json(body, { status: upstream.status })
}
