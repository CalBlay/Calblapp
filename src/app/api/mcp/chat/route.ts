import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamPost } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/** Vercel: allarga el límit del serverless (OpenAI + tools pot superar 10s). Requereix pla Pro per >60s segons regió. */
export const maxDuration = 120

/**
 * Proxy cap al MCP /chat (OpenAI + tools). Només administradors.
 *
 * Body JSON: { question: string, language?: string, rich?: boolean }
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

  const question =
    typeof body === 'object' && body !== null && 'question' in body
      ? String((body as { question: unknown }).question ?? '').trim()
      : ''
  const language =
    typeof body === 'object' && body !== null && 'language' in body
      ? String((body as { language: unknown }).language ?? 'ca').trim() || 'ca'
      : 'ca'

  if (!question) {
    return NextResponse.json({ ok: false, error: 'Falta question' }, { status: 400 })
  }

  const rich =
    typeof body === 'object' &&
    body !== null &&
    'rich' in body &&
    (body as { rich: unknown }).rich === true

  const { status, body: upstream } = await mcpUpstreamPost('/chat', {
    question,
    language,
    rich,
  })

  return NextResponse.json(upstream, { status })
}
