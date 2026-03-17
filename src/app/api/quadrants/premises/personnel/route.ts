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

const ALLOWED_DEPARTMENTS = new Set(['serveis', 'logistica', 'cuina'])

type PersonnelItem = {
  id: string
  name: string
  isDriver: boolean
}

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

  return { role, sessionDept }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionContext(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const requestedDept = norm(searchParams.get('department') || session.sessionDept || '')

    if (!ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    if (!canAccessDepartment({ ...session, requestedDept })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snap = await db.collection('personnel').get()
    const personnel = snap.docs
      .map((doc) => {
        const data = doc.data() as any
        const isDriver =
          data?.isDriver === true ||
          data?.driver?.isDriver === true ||
          data?.driver?.camioGran === true ||
          data?.driver?.camioPetit === true

        return {
          id: doc.id,
          name: String(data?.name || '').trim(),
          department: norm(data?.department || ''),
          isDriver,
        }
      })
      .filter((item) => item.department === requestedDept && item.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'ca'))

    const people: PersonnelItem[] = personnel.map((item) => ({
      id: item.id,
      name: item.name,
      isDriver: item.isDriver,
    }))

    return NextResponse.json({
      people,
      drivers: people.filter((item) => item.isDriver),
    })
  } catch (error) {
    console.error('[quadrants/premises/personnel] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
