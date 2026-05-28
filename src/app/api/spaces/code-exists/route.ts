import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { SPACES_ACTION } from '@/lib/spacesPermissions'
import { requireSpacesAction } from '@/lib/server/spacesApiAuth'

export const runtime = 'nodejs'

const normalizeSpaceCode = (raw?: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const canCreate = await requireSpacesAction(auth, SPACES_ACTION.BBDD_CREATE)
    const canUpdate = await requireSpacesAction(auth, SPACES_ACTION.BBDD_UPDATE)
    if (!canCreate && !canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
