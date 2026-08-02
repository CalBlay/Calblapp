import { NextResponse } from 'next/server'
import {
  resolveEventComandaArticlesByCodes,
  type ResolveArticleInput,
} from '@/lib/eventComanda/articles.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    lines?: ResolveArticleInput[]
    createMissing?: boolean
  }

  const lines = Array.isArray(body.lines) ? body.lines : []
  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cal indicar almenys una línia.' }, { status: 400 })
  }

  const sanitized = lines
    .map((line) => ({
      articleCode: String(line.articleCode || '').trim().toUpperCase(),
      articleName: String(line.articleName || '').trim(),
      family: String(line.family || '').trim(),
      qtyUnit: String(line.qtyUnit || '').trim(),
    }))
    .filter((line) => line.articleCode && line.articleName)

  if (sanitized.length === 0) {
    return NextResponse.json({ error: 'Cap línia vàlida per resoldre.' }, { status: 400 })
  }

  const userId = String(auth.user?.id || '').trim()
  const result = await resolveEventComandaArticlesByCodes(sanitized, {
    userId,
    createMissing: body.createMissing !== false,
  })

  return NextResponse.json(result)
}
