// ✅ file: src/app/api/personnel/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'


import { normalizeRole } from '@/lib/roles'

interface FirestorePersonnelDoc {
  id?: string
  name?: string
  role?: string
  department?: string
  departmentLower?: string
  email?: string | null
  phone?: string | null
  available?: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  unavailableNotifiedFor?: string | null
  unavailableNotifiedAt?: number
  driver?: {
    isDriver: boolean
    camioGran: boolean
    camioPetit: boolean
  }
  maxHoursWeek?: number
  createdAt?: number
  [key: string]: unknown
}

interface UserRequestDoc {
  status?: 'pending' | 'approved' | 'rejected'
  [key: string]: unknown
}

interface DebugInfo {
  session: Record<string, unknown>
  query: Record<string, unknown>
  steps: Array<Record<string, unknown>>
  error?: string
}

export interface PersonnelItem {
  id: string
  name: string
  role: string
  driver: {
    isDriver: boolean
    camioGran: boolean
    camioPetit: boolean
  }
  department: string
  departmentLower?: string
  email?: string | null
  phone?: string | null
  maxHoursWeek?: number
  available?: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  unavailableNotifiedFor?: string | null
  unavailableNotifiedAt?: number
  hasUser: boolean
  requestStatus: 'none' | 'pending' | 'approved' | 'rejected'
}

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normLower = (s?: string) => unaccent((s || '').toString().trim()).toLowerCase()

/* -------------------------------------------------------------------------- */
/*                                   GET LIST                                 */
/* -------------------------------------------------------------------------- */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const debugMode = ['1', 'true', 'yes'].includes((searchParams.get('debug') || '').toLowerCase())
  const deptParam = searchParams.get('department') || ''
  const roleRaw = (session.user as { role?: string })?.role
  const roleNorm = normalizeRole(roleRaw)
  const isPriv = roleNorm === 'admin' || roleNorm === 'direccio'
  const rawDept = isPriv
    ? deptParam
    : (session.user as { department?: string })?.department || ''
  const deptLower = normLower(rawDept)

  const dbg: DebugInfo = {
    session: {
      userId:
        (session.user as { id?: string })?.id ||
        (session.user as { userId?: string })?.userId ||
        null,
      name: (session.user as { name?: string })?.name,
      roleRaw,
      roleNorm,
      userDept: (session.user as { department?: string })?.department || null,
      userDeptLower:
        (session.user as { deptLower?: string })?.deptLower ||
        normLower((session.user as { department?: string })?.department ?? ''),
    },
    query: { deptParam, resolvedDept: rawDept, resolvedDeptLower: deptLower, isPrivileged: isPriv },
    steps: [],
  }

  try {
    // 1️⃣ Consultes de Firestore segons departament
    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirestorePersonnelDoc>>()
    const stepUsed: string[] = []

    if (deptLower) {
      const s1 = await firestoreAdmin
        .collection('personnel')
        .where('departmentLower', '==', deptLower)
        .get()
      s1.docs.forEach(d => byId.set(d.id, d))
      stepUsed.push(`lower:${s1.size}`)

      const rawTrim = rawDept.trim()
      if (rawTrim) {
        const s2 = await firestoreAdmin
          .collection('personnel')
          .where('department', '==', rawTrim)
          .get()
        s2.docs.forEach(d => byId.set(d.id, d))
        stepUsed.push(`exact:${s2.size}`)
      }

      const s3all = await firestoreAdmin.collection('personnel').get()


      const addedFromAll = s3all.docs.filter(d => {
        const data = d.data() as FirestorePersonnelDoc
        const dep = normLower(data.departmentLower || data.department)
        return dep === deptLower
      })
      addedFromAll.forEach(d => byId.set(d.id, d))
      stepUsed.push(`all+filter:${addedFromAll.length}`)
    } else {
      const sAll = await firestoreAdmin.collection('personnel').get()
      sAll.docs.forEach(d => byId.set(d.id, d))
      stepUsed.push(`all(no-dept-filter):${sAll.size}`)
    }

    const baseDocs = Array.from(byId.values())

    dbg.steps.push({
      step: 'merge-queries',
      used: stepUsed,
      personnelCount: baseDocs.length,
      ids: baseDocs.map(d => d.id),
    })

    // 2️⃣ Enriquir amb users i userRequests
    const personIds = baseDocs.map(d => d.id)

    const userDocs = await Promise.all(
      personIds.map(id => firestoreAdmin.collection('users').doc(id).get())
    )
    const hasUser = new Map<string, boolean>()
    userDocs.forEach(doc => hasUser.set(doc.id, doc.exists))

    const reqDocs = await Promise.all(
      personIds.map(id => firestoreAdmin.collection('userRequests').doc(id).get())
    )
    const reqStatus = new Map<string, 'none' | 'pending' | 'approved' | 'rejected'>()
    reqDocs.forEach(doc => {
      if (!doc.exists) reqStatus.set(doc.id, 'none')
      else {
        const d = doc.data() as UserRequestDoc
        reqStatus.set(doc.id, d?.status || 'pending')
      }
    })

    // 3️⃣ Construcció final de la llista
    const list: PersonnelItem[] = baseDocs.map(doc => {
      const data = doc.data() as FirestorePersonnelDoc
      return {
        id: doc.id,
        name: data.name || doc.id,
        role: String(data.role || 'treballador'),
        driver: data.driver || { isDriver: false, camioGran: false, camioPetit: false },
        department: data.department || '',
        departmentLower: data.departmentLower || normLower(data.department),
        email: data.email ?? null,
        phone: data.phone ?? null,
        maxHoursWeek: data.maxHoursWeek ?? 40,
        available: data.available ?? true,
        unavailableFrom: data.unavailableFrom ?? null,
        unavailableUntil: data.unavailableUntil ?? null,
        unavailableIndefinite: data.unavailableIndefinite ?? false,
        unavailableNotifiedFor: data.unavailableNotifiedFor ?? null,
        unavailableNotifiedAt: data.unavailableNotifiedAt ?? undefined,
        hasUser: hasUser.get(doc.id) || false,
        requestStatus: reqStatus.get(doc.id) || 'none',
      }
    })

    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    if (debugMode) {
      return NextResponse.json({ success: true, data: list, debug: dbg })
    }
    return NextResponse.json({ success: true, data: list })
  } catch (err: unknown) {
    console.error('[api/personnel GET] Error:', err)
    if (err instanceof Error) {
      if (debugMode) {
        dbg.error = err.message
        return NextResponse.json(
          { success: false, error: 'Error intern', debug: dbg },
          { status: 500 }
        )
      }
      return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
    return NextResponse.json(
      { success: false, error: 'Error intern llegint personal.' },
      { status: 500 }
    )
  }
}

/* -------------------------------------------------------------------------- */
/*                                   POST NEW                                 */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body?.id) {
      return NextResponse.json({ success: false, error: 'Falta camp id' }, { status: 400 })
    }

    const id = body.id
    const now = Date.now()
    const payload = {
      ...body,
      role: body.role || 'equip',
      departmentLower: (body.department || '').toLowerCase(),
      createdAt: now,
    }

    await firestoreAdmin.collection('personnel').doc(id).set(payload)
    return NextResponse.json({ success: true, id, ...payload }, { status: 201 })
  } catch (err) {
    console.error('[api/personnel POST] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Error creant personal' },
      { status: 500 }
    )
  }
}
