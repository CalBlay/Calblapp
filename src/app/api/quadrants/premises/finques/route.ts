import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { normalizeRole } from '@/lib/roles'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function getSessionContext(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return null

  const role = normalizeRole(
    String((token as any).userRole ?? (token as any).role ?? '')
  )

  return { role }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionContext(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'direccio', 'cap'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snap = await db.collection('finques').get()
    const finques = snap.docs
      .map((doc) => {
        const data = doc.data() as any
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
