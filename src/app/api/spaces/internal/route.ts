import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string) => unaccent(s).toLowerCase().trim()

const stripPrefixes = (value: string) =>
  value
    .replace(/^(restaurant|restauracio|empresa|casament|casaments)\s+/i, '')
    .trim()

export async function GET() {
  try {
    const [finquesSnap, channelsSnap] = await Promise.all([
      firestoreAdmin.collection('finques').get(),
      firestoreAdmin.collection('channels').where('source', '==', 'restaurants').get(),
    ])

    const rawLocations: string[] = []

    finquesSnap.docs.forEach((doc) => {
      const d = doc.data() as Record<string, unknown>
      const rawCode = String(d.code ?? d.codi ?? '')
      const rawTipus = String(d.tipus ?? '')
      const tipus = rawTipus || (rawCode.startsWith('CC') ? 'Propi' : 'Extern')
      if (tipus === 'Propi') rawLocations.push(String(d.nom ?? doc.id))
    })

    channelsSnap.docs.forEach((doc) => {
      const d = doc.data() as Record<string, unknown>
      rawLocations.push(String(d.location ?? d.name ?? doc.id))
    })

    rawLocations.push('CENTRAL')

    const map = new Map<string, string>()
    rawLocations.forEach((raw) => {
      const original = String(raw || '').trim()
      if (!original) return
      const cleaned = stripPrefixes(original) || original
      const key = norm(cleaned)
      if (!key) return
      if (!map.has(key)) map.set(key, cleaned)
    })

    const locations = Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'ca', { sensitivity: 'base' })
    )

    return NextResponse.json({ locations })
  } catch (err) {
    console.error('[spaces/internal] error', err)
    return NextResponse.json({ error: 'Error carregant ubicacions' }, { status: 500 })
  }
}
