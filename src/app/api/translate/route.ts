import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const text = (body?.text as string) || ''
    const target = (body?.target as string) || ''

    if (!text || !target) {
      return NextResponse.json({ error: 'Missing text or target.' }, { status: 400 })
    }

    const apiKey = process.env.DEEPL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing DeepL API key.' }, { status: 500 })
    }

    const apiUrl = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate'
    const params = new URLSearchParams()
    params.append('text', text)
    params.append('target_lang', target)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: 'DeepL request failed.', details: errorText },
        { status: 500 }
      )
    }

    const data = await response.json()
    const translated = data?.translations?.[0]?.text

    if (!translated) {
      return NextResponse.json({ error: 'No translation returned.' }, { status: 500 })
    }

    return NextResponse.json({ text: translated })
  } catch {
    return NextResponse.json({ error: 'Translation error.' }, { status: 500 })
  }
}
