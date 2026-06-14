import { NextResponse } from 'next/server'
import { requireEventComandaAdmin } from '@/lib/eventComanda/adminAccess'
import { importEventComandaCatalog } from '@/lib/eventComanda/catalogImport.server'
import type { ParsedCatalogArticle } from '@/lib/eventComanda/parseArticlesCatalogExcel'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireEventComandaAdmin(auth)
  if (forbidden) return forbidden.res

  const body = (await req.json()) as { lines?: ParsedCatalogArticle[] }
  const lines = Array.isArray(body.lines) ? body.lines : []

  try {
    const result = await importEventComandaCatalog(lines, auth.user.id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut importar el catàleg.' },
      { status: 400 }
    )
  }
}
