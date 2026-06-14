import { NextResponse } from 'next/server'
import { queryEventComandaArticles } from '@/lib/eventComanda/articles.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || undefined
  const cursor = searchParams.get('cursor') || undefined
  const limit = Number(searchParams.get('limit') || 50)

  const result = await queryEventComandaArticles({ q, cursor, limit })
  return NextResponse.json(result)
}
