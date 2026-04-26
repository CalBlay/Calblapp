import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamPost } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/**
 * Proxy cap al MCP POST /chat/feedback (learning loop). Només administradors.
 *
 * Body: { traceId: string, helpful: boolean, correctedAnswer?: string, note?: string, tags?: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invàlid' }, { status: 400 })
  }

  const traceId =
    typeof body === 'object' && body !== null && 'traceId' in body
      ? String((body as { traceId: unknown }).traceId ?? '').trim()
      : ''
  if (!traceId) {
    return NextResponse.json({ ok: false, error: 'Falta traceId' }, { status: 400 })
  }

  const helpfulRaw =
    typeof body === 'object' && body !== null && 'helpful' in body
      ? (body as { helpful: unknown }).helpful
      : undefined
  const helpful = typeof helpfulRaw === 'boolean' ? helpfulRaw : undefined

  const correctedAnswer =
    typeof body === 'object' && body !== null && 'correctedAnswer' in body
      ? String((body as { correctedAnswer: unknown }).correctedAnswer ?? '')
      : ''

  const note =
    typeof body === 'object' && body !== null && 'note' in body
      ? String((body as { note: unknown }).note ?? '')
      : ''

  const tags =
    typeof body === 'object' &&
    body !== null &&
    'tags' in body &&
    Array.isArray((body as { tags: unknown }).tags)
      ? (body as { tags: unknown[] }).tags.map((t) => String(t))
      : []

  const { status, body: upstream } = await mcpUpstreamPost(
    '/chat/feedback',
    {
      traceId,
      helpful,
      correctedAnswer,
      note,
      tags,
    },
    { timeoutMs: 25_000 }
  )

  return NextResponse.json(upstream, { status })
}
