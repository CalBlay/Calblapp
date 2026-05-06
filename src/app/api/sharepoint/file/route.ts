// file: src/app/api/sharepoint/file/route.ts
import { NextResponse } from 'next/server'
import { getSiteAndDrive, getGraphToken } from '@/services/sharepoint/graph'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 })
    }

    // 1️⃣ Drive + token
    const { driveId } = await getSiteAndDrive()
    const { access_token } = await getGraphToken()

    // 2️⃣ Demanem CONTINGUT DIRECTE (no downloadUrl)
    const fileRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    )

    if (!fileRes.ok) {
      const msg = await fileRes.text()
      console.error('❌ SharePoint content error:', msg)
      return NextResponse.json(
        { error: 'Unable to fetch file content' },
        { status: 404 }
      )
    }

    const buffer = await fileRes.arrayBuffer()
    const contentType =
      fileRes.headers.get('content-type') || 'application/octet-stream'

    // 3️⃣ INLINE → OBRIR, NO DESCARREGAR
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    console.error('❌ Error /api/sharepoint/file:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
