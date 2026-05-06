import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * 📄 Proxy per carregar PDFs de SharePoint dins un iframe.
 * Evita el bloqueig X-Frame-Options perquè el PDF es serveix des del nostre domini.
 */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    // 🔐 IMPORTANT: SharePoint no permet accedir a PDF públics
    // El token d’usuari Microsoft Graph ja hauria d’estar a les cookies (OAuth)
    // Però si en el futur vols usar un token sistema → puc generar-te el flux sencer

    const res = await fetch(url, {
      method: 'GET',
      // Es pot afegir el token OAuth si el necessites:
      // headers: { "Authorization": `Bearer ${token}` }
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `SharePoint error: ${res.status}` },
        { status: res.status }
      )
    }

    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // ✨ Clau: ara ES POT carregar en iframe
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'inline',
      },
    })
  } catch (e: unknown) {
    console.error('Proxy error', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
