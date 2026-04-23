import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const normalizeSpaceCode = (raw?: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const code = normalizeSpaceCode(searchParams.get('code'))
    const excludeId = String(searchParams.get('excludeId') || '').trim()

    if (!code) {
      return NextResponse.json({ exists: false })
    }

    const snap = await db.collection('finques').get()
    const existingDoc = snap.docs.find((doc) => {
      if (excludeId && doc.id === excludeId) return false
      const data = doc.data() as Record<string, unknown>
      const current =
        normalizeSpaceCode(data.code) ||
        normalizeSpaceCode(data.codi) ||
        normalizeSpaceCode(doc.id)
      return current === code
    })

    return NextResponse.json({
      exists: Boolean(existingDoc),
      id: existingDoc?.id || null,
    })
  } catch (err) {
    console.error('Error comprovant codi d espai:', err)
    return NextResponse.json(
      { error: 'Error comprovant el codi.' },
      { status: 500 }
    )
  }
}
