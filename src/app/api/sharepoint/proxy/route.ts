// file: src/app/api/sharepoint/proxy/route.ts
import { NextResponse } from 'next/server'
import { downloadFileContent } from '@/services/sharepoint/graph'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 })
    }

    // 🔽 Demanem el contingut real del fitxer a SharePoint
    const fileRes = await downloadFileContent(itemId)

    const arrayBuffer = await fileRes.arrayBuffer()
    const contentType =
      fileRes.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition =
      fileRes.headers.get('content-disposition') || 'inline'

    // 🔥 RETURN → Obrim el fitxer públicament (com Google Drive)
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
      },
    })
  } catch (err: unknown) {
    console.error('❌ Error GET /api/sharepoint/proxy:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
