import { NextResponse } from 'next/server'
import { createServei, getServeiById, listServeis } from '@/lib/serveis/server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as { nom?: string; codi?: string }
  const nom = String(body.nom || '').trim()
  if (!nom) {
    return NextResponse.json({ error: 'Cal el nom del servei.' }, { status: 400 })
  }

  try {
    const existing = (await listServeis(nom)).find(
      (servei) => servei.nom.toLowerCase() === nom.toLowerCase()
    )
    if (existing) {
      return NextResponse.json({ servei: existing, created: false })
    }

    const servei = await createServei({
      nom,
      codi: body.codi ? String(body.codi) : undefined,
      origen: 'manual',
    })
    return NextResponse.json({ servei, created: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No s\'ha pogut crear el servei.'
    if (message.includes('Ja existeix')) {
      const codi = String(body.codi || '').trim()
      const existing = codi ? await getServeiById(codi) : null
      if (existing) {
        return NextResponse.json({ servei: existing, created: false })
      }
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
