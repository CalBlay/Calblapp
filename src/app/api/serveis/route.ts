import { NextResponse } from 'next/server'
import {
  requireSettingsServeisEdit,
  requireSettingsServeisView,
} from '@/lib/server/settingsApiAuth'
import { createServei, listServeis } from '@/lib/serveis/server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsServeisView(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const serveis = await listServeis(q)
  return NextResponse.json({ serveis })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsServeisEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as { nom?: string; codi?: string }
  try {
    const servei = await createServei({
      nom: String(body.nom || ''),
      codi: body.codi ? String(body.codi) : undefined,
      origen: 'manual',
    })
    return NextResponse.json({ servei })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut crear el servei.' },
      { status: 400 }
    )
  }
}
