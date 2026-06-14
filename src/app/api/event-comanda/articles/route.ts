import { NextResponse } from 'next/server'
import { listEventComandaArticles } from '@/lib/eventComanda/articles.server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const articles = await listEventComandaArticles()
  return NextResponse.json({ articles })
}
