import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { normalizeRole } from '@/lib/roles'
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

const ALLOWED_DEPARTMENTS = new Set(['serveis', 'logistica', 'cuina'])

function canAccessDepartment(params: {
  role: string
  sessionDept: string
  requestedDept: string
}) {
  const { role, sessionDept, requestedDept } = params
  if (role === 'admin' || role === 'direccio') return true
  if (role === 'cap') return sessionDept === requestedDept
  return false
}

async function getSessionContext(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return null

  const role = normalizeRole(
    String((token as any).userRole ?? (token as any).role ?? '')
  )
  const sessionDept = norm(
    String(
      (token as any).department ??
        (token as any).userDepartment ??
        (token as any).dept ??
        (token as any).departmentName ??
        ''
    )
  )
  const email = String((token as any)?.user?.email || (token as any)?.email || '')

  return { role, sessionDept, email }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionContext(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const requestedDept = norm(searchParams.get('department') || session.sessionDept || 'serveis')

    if (!ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    if (!canAccessDepartment({ ...session, requestedDept })) {
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
    const session = await getSessionContext(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const requestedDept = norm(body?.department || '')

    if (!ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    if (!canAccessDepartment({ ...session, requestedDept })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const normalized = normalizePremises(requestedDept, body)
    const saved = await savePremises(requestedDept, normalized, session.email)

    return NextResponse.json({ ok: true, premises: saved })
  } catch (error) {
    console.error('[quadrants/premises] PUT error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
