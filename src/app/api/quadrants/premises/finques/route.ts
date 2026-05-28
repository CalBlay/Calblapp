import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireQuadrantsPremissesEdit } from '@/lib/server/quadrantsApiAuth'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const requestedDept = norm(searchParams.get('department') || auth.user.department || 'serveis')
    const canAccess = await requireQuadrantsPremissesEdit(auth, requestedDept)
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snap = await db.collection('finques').get()
    const finques = snap.docs
      .map((doc) => {
        const data = doc.data() as { nom?: string; tipus?: string }
        return {
          id: doc.id,
          nom: String(data?.nom || '').trim(),
          tipus: norm(data?.tipus || ''),
        }
      })
      .filter((item) => item.nom && item.tipus === 'propi')
      .sort((a, b) => a.nom.localeCompare(b.nom, 'ca'))
      .map((item) => ({
        id: item.id,
        name: item.nom,
      }))

    return NextResponse.json({ finques })
  } catch (error) {
    console.error('[quadrants/premises/finques] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
