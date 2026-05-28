import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireQuadrantsPremissesEdit } from '@/lib/server/quadrantsApiAuth'
import { QUADRANTS_ALLOWED_DEPARTMENTS } from '@/lib/quadrantsPermissions'
import {
  loadPremises,
  savePremises,
  getStoredPremises,
  normalizePremises,
} from '@/services/premises'
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
    const requestedDept = norm(
      searchParams.get('department') || auth.user.department || 'serveis'
    )

    if (!QUADRANTS_ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    const canAccess = await requireQuadrantsPremissesEdit(auth, requestedDept)
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stored = await getStoredPremises(requestedDept)
    const { premises, warnings } = await loadPremises(requestedDept)

    return NextResponse.json({
      premises,
      meta: {
        department: requestedDept,
        source: stored ? 'firestore' : 'fallback',
        warnings,
      },
    })
  } catch (error) {
    console.error('[quadrants/premises] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const body = await req.json()
    const requestedDept = norm(body?.department || '')

    if (!QUADRANTS_ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    const canAccess = await requireQuadrantsPremissesEdit(auth, requestedDept)
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const normalized = normalizePremises(requestedDept, body)
    const email = String(auth.user.email || '').trim()
    const saved = await savePremises(requestedDept, normalized, email)

    return NextResponse.json({ ok: true, premises: saved })
  } catch (error) {
    console.error('[quadrants/premises] PUT error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
