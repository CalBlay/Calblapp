// ✅ file: src/app/api/fincas/search/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'


export const runtime = 'nodejs'

/**
 * 🔍 Cerca intel·ligent dins la col·lecció "finques"
 * - Tolerant a accents, majúscules i espais.
 * - Cerca tant en nom com en codi.
 * - Retorna màxim 10 coincidències ordenades per rellevància.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const qRaw = searchParams.get('q') || ''
  const q = qRaw.toLowerCase().trim()

  if (q.length < 2) return NextResponse.json({ data: [] })

  try {
    // ✅ Cal fer servir "db" i no "firestore"
    const snap = await db.collection('finques').get()
    const all = snap.docs.map((d) => d.data() as Record<string, unknown>)

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
      const codi = normalize(String(f.codi || ''))
      const searchable = normalize(String(f.searchable || ''))
      return (
        nom.includes(nq) ||
        codi.includes(nq) ||
        searchable.includes(nq)
      )
    })

    // 📊 Ordena per rellevància (exacte > parcial)
    const sorted = filtered.sort((a, b) => {
      const na = normalize(a.nom)
      const nb = normalize(b.nom)
      if (na.startsWith(nq) && !nb.startsWith(nq)) return -1
      if (!na.startsWith(nq) && nb.startsWith(nq)) return 1
      return na.localeCompare(nb)
    })

    // 🔢 Limita a 10 resultats
    const data = sorted.slice(0, 10).map((f) => ({
      nom: String(f.nom || ''),
      codi: String(f.codi || ''),
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
