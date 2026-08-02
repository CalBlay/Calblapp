import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador'])

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  return { role }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const snap = await db.collection('finques').get()
    const locations = snap.docs
      .map((doc) => {
        const data = doc.data() as { nom?: string }
        return String(data?.nom || '').trim()
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ca'))

    return NextResponse.json({ ok: true, locations })
  } catch (error) {
    console.error('[logistics/locations] GET error', error)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
