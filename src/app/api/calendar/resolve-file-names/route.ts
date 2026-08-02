import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { displayCalendarFileName } from '@/lib/calendar/calendarFiles'
import { getSharePointFileMeta, parseSharePointItemId } from '@/lib/calendar/calendarEmail'

export const runtime = 'nodejs'

type FileInput = {
  key?: string
  url?: string
  name?: string
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as { files?: FileInput[] }
    const files = Array.isArray(body.files) ? body.files : []

    const resolved = await Promise.all(
      files.map(async (file) => {
        const key = String(file.key || '').trim()
        const url = String(file.url || '').trim()
        const storedName = String(file.name || '').trim()
        if (storedName) {
          return { key, url, name: storedName }
        }

        const itemId = parseSharePointItemId(url)
        if (itemId) {
          try {
            const meta = await getSharePointFileMeta(itemId)
            return { key, url, name: meta.name }
          } catch {
            return { key, url, name: displayCalendarFileName({ key, url }) }
          }
        }

        return { key, url, name: displayCalendarFileName({ key, url }) }
      })
    )

    return NextResponse.json({ files: resolved })
  } catch (err) {
    console.error('[calendar/resolve-file-names POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}
