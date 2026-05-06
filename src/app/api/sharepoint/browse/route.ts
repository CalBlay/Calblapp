// file: src/app/api/sharepoint/browse/route.ts
import { NextResponse } from 'next/server'
import { listChildren, createAnonymousViewLink } from '@/services/sharepoint/graph'

export const runtime = 'nodejs'

/* ──────────────────────────────────────────────
   GET → Llistar carpetes i fitxers
   /api/sharepoint/browse?path=/Esdeveniments
────────────────────────────────────────────── */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const path = searchParams.get('path') || '/'

    const items = await listChildren(path)

    return NextResponse.json({ items })
  } catch (error: unknown) {
    console.error('❌ Error GET /api/sharepoint/browse:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ items: [], error: message }, { status: 500 })
  }
}

/* ──────────────────────────────────────────────
   POST → Generar link públic d’un fitxer
   body: { itemId: string }
────────────────────────────────────────────── */
export async function POST(req: Request) {
  try {
    const { itemId } = await req.json()

    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 })
    }

    const publicUrl = await createAnonymousViewLink(itemId, 'anonymous')

    return NextResponse.json({ url: publicUrl })

  } catch (error: unknown) {
    console.error('❌ Error POST /api/sharepoint/browse:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
