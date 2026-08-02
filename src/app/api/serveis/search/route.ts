// ✅ file: src/app/api/serveis/search/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').toLowerCase().trim()

  if (q.length < 2) return NextResponse.json({ data: [] })

  try {
    // ✅ correcte: utilitza la instància "db" de firebase-admin
    const snap = await db.collection('serveis').get()
    type ServeiDoc = { nom?: string; searchable?: string; codi?: string }
    const all = snap.docs.map((d) => d.data() as ServeiDoc)

    const filtered = all.filter((s) => {
      const nom = String(s.nom || '').toLowerCase()
      const searchable = String(s.searchable || '').toLowerCase()
      return nom.includes(q) || searchable.includes(q)
    })

    const data = filtered.slice(0, 10).map((s) => ({
      nom: s.nom,
      codi: s.codi,
    }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('❌ Error cercant serveis:', error)
    return NextResponse.json({ data: [] }, { status: 500 })
  }
}
