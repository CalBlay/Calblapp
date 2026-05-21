import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { mcpUpstreamGet } from '@/lib/server/mcpUpstreamFetch'

export const dynamic = 'force-dynamic'

/** Estat del mapping Firestore (col·leccions sense documentar, cobertura, camps). */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const params = new URLSearchParams()
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const limit = req.nextUrl.searchParams.get('limit')?.trim()
  const sampleLimit = req.nextUrl.searchParams.get('sampleLimit')?.trim()
  if (q) params.set('q', q)
  if (limit) params.set('limit', limit)
  if (sampleLimit) params.set('sampleLimit', sampleLimit)

  const { status, body } = await mcpUpstreamGet('/tools/firestore/collection-dictionary', params)
  return NextResponse.json(body, { status })
}
