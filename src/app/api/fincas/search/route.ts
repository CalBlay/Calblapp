// ✅ file: src/app/api/fincas/search/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'


export const runtime = 'nodejs'

type FincaFirestoreRow = {
  _docId: string
  nom?: unknown
  codi?: unknown
  code?: unknown
  searchable?: unknown
}

/**
 * 🔍 Cerca intel·ligent dins la col·lecció "finques"
 * - Tolerant a accents, majúscules i espais.
 * - Cerca tant en nom com en codi.
 * - Sense `q`: retorna totes les finques (per càrrega inicial del buscador).
 * - Amb `q` (mín. 2 lletres): filtra per nom, codi o searchable.
 */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const qRaw = searchParams.get('q') || ''
  const q = qRaw.toLowerCase().trim()

  try {
    const snap = await db.collection('finques').get()
    const all: FincaFirestoreRow[] = snap.docs.map((d) => ({
      _docId: d.id,
      ...(d.data() as Omit<FincaFirestoreRow, '_docId'>),
    }))

    const normalize = (s: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()

    const toRow = (f: FincaFirestoreRow) => ({
      id: String(f._docId || ''),
      nom: String(f.nom || ''),
      codi: String(f.code || f.codi || ''),
    })

    if (q.length === 0) {
      const data = all
        .map(toRow)
        .filter((f) => f.nom.trim() || f.codi.trim())
        .sort((a, b) => a.nom.localeCompare(b.nom, 'ca', { sensitivity: 'base' }))
      return NextResponse.json({ data })
    }

    if (q.length < 2) return NextResponse.json({ data: [] })

    const nq = normalize(q)

    const filtered = all.filter((f) => {
      const nom = normalize(String(f.nom || ''))
      const codi = normalize(String(f.code || f.codi || ''))
      const searchable = normalize(String(f.searchable || ''))
      return (
        nom.includes(nq) ||
        codi.includes(nq) ||
        searchable.includes(nq)
      )
    })

    const sorted = filtered.sort((a, b) => {
      const na = normalize(String(a.nom || ''))
      const nb = normalize(String(b.nom || ''))
      if (na.startsWith(nq) && !nb.startsWith(nq)) return -1
      if (!na.startsWith(nq) && nb.startsWith(nq)) return 1
      return na.localeCompare(nb)
    })

    const data = sorted.slice(0, 80).map(toRow)

    return NextResponse.json({ data })
  } catch (error) {
    console.error('❌ Error cercant finques:', error)
    return NextResponse.json(
      { error: 'Error cercant finques' },
      { status: 500 }
    )
  }
}
