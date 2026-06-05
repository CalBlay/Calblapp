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
 * - Retorna màxim 10 coincidències ordenades per rellevància.
 */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const qRaw = searchParams.get('q') || ''
  const q = qRaw.toLowerCase().trim()

  if (q.length < 3) return NextResponse.json({ data: [] })

  try {
    // ✅ Cal fer servir "db" i no "firestore"
    const snap = await db.collection('finques').get()
    const all: FincaFirestoreRow[] = snap.docs.map((d) => ({
      _docId: d.id,
      ...(d.data() as Omit<FincaFirestoreRow, '_docId'>),
    }))

    // 🔤 Normalitza text (elimina accents, passa a minúscules)
    const normalize = (s: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()

    const nq = normalize(q)

    // 🔍 Filtre flexible
    const filtered = all.filter((f) => {
      const nom = normalize(String(f.nom || ''))
      const codi = normalize(String(f.code || f.codi || f._docId || ''))
      const searchable = normalize(String(f.searchable || ''))
      return (
        nom.includes(nq) ||
        codi.includes(nq) ||
        searchable.includes(nq)
      )
    })

    // 📊 Ordena per rellevància (exacte > parcial)
    const sorted = filtered.sort((a, b) => {
      const na = normalize(String(a.nom || ''))
      const nb = normalize(String(b.nom || ''))
      if (na.startsWith(nq) && !nb.startsWith(nq)) return -1
      if (!na.startsWith(nq) && nb.startsWith(nq)) return 1
      return na.localeCompare(nb)
    })

    // 🔢 Limita a 10 resultats
    const data = sorted.slice(0, 10).map((f) => ({
      id: String(f._docId || ''),
      nom: String(f.nom || ''),
      codi: String(f.code || f.codi || f._docId || ''),
    }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('❌ Error cercant finques:', error)
    return NextResponse.json(
      { error: 'Error cercant finques' },
      { status: 500 }
    )
  }
}
