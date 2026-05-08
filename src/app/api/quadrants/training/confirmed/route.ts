import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'

export const runtime = 'nodejs'

const TRAINING_COLLECTION = 'quadrantTrainingSamples'

const norm = (v?: string) =>
  (v || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

function safeString(value: unknown) {
  return String(value ?? '').trim()
}

type TrainingSampleRow = {
  id: string
  startDate?: unknown
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const department = norm(url.searchParams.get('department') || '')
    const startDate = safeString(url.searchParams.get('startDate') || '')
    const endDate = safeString(url.searchParams.get('endDate') || '')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200)

    let q: FirebaseFirestore.Query = db.collection(TRAINING_COLLECTION).orderBy('createdAt', 'desc')
    if (department) q = q.where('department', '==', department)

    const snap = await q.limit(limit).get()
    const rows = snap.docs
      .map(
        (doc) =>
          ({
            id: doc.id,
            ...(doc.data() as Record<string, unknown>),
          }) as TrainingSampleRow
      )
      .filter((row) => {
        if (!startDate && !endDate) return true
        const d = safeString(row.startDate)
        if (!d) return false
        if (startDate && d < startDate) return false
        if (endDate && d > endDate) return false
        return true
      })

    return NextResponse.json({ ok: true, samples: rows })
  } catch (e) {
    console.error('[quadrants/training/confirmed] error', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
