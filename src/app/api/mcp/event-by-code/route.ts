import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

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

  const base = (process.env.MCP_SERVER_URL || '').replace(/\/$/, '')
  const apiKey = process.env.MCP_API_KEY || ''
  if (!base || !apiKey) {
    return NextResponse.json(
      { error: 'Falten MCP_SERVER_URL o MCP_API_KEY al servidor' },
      { status: 500 }
    )
  }

  const target = new URL(`${base}/tools/get_event_by_code`)
  target.searchParams.set('code', code)

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
