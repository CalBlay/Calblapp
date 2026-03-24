// file: src/app/api/quadrants/closing/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

type Dept =
  | 'serveis'
  | 'logistica'
  | 'cuina'
  | 'produccio'
  | 'comercial'
  | string

type PersonUpdate = {
  name: string
  role?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const norm = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

async function resolveCollection(department: string) {
  const d = capitalize(norm(department))
  const plural = `quadrants${d}`
  const singular = `quadrant${d}`
  const all = await db.listCollections()
  const names = all.map((c) => c.id.toLowerCase())
  if (names.includes(singular.toLowerCase())) return singular
  if (names.includes(plural.toLowerCase())) return plural
  return plural
}

function matchByName(a?: string, b?: string) {
  return norm(a) === norm(b) && norm(a) !== ''
}

function updateArray(arr: any[] | undefined, updates: PersonUpdate[], setter: (item: any, upd: PersonUpdate) => void) {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) => {
    const upd = updates.find((u) => matchByName(u.name, item?.name))
    if (!upd) return item
    const next = { ...item }
    setter(next, upd)
    return next
  })
}

export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { eventId, department, updates, closeDept } = (await req.json()) as {
      eventId?: string
      department?: Dept
      updates?: PersonUpdate[]
      closeDept?: boolean
    }

    if (!eventId || !department || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'Falten camps requerits' }, { status: 400 })
    }

    const roleRaw = String((token as any)?.role || (token as any)?.userRole || '')
    const deptToken = norm(
      (token as any)?.department ||
        (token as any)?.userDepartment ||
        (token as any)?.dept ||
        (token as any)?.departmentName ||
        ''
    )
    const role = norm(roleRaw)
    const isAdmin = role === 'admin'
    const isDireccio = role === 'direccio' || role === 'direccion'
    const isCap = role.includes('cap')

    if (!(isAdmin || isDireccio || isCap || deptToken === norm(department))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const colName = await resolveCollection(department)
    const docRef = db.collection(colName).doc(String(eventId))
    const snap = await docRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Quadrant no trobat' }, { status: 404 })
    }

    const data = snap.data() || {}
    const now = new Date().toISOString()
    const userId = String((token as any)?.sub || (token as any)?.id || '')

    const setter = (item: any, upd: PersonUpdate) => {
      item.endTimeReal = upd.endTimeReal || null
      item.sortidaNotes = upd.notes || ''
      item.noShow = !!upd.noShow
      item.leftEarly = !!upd.leftEarly
      item.sortidaSetBy = { userId, ts: now }
    }

    const responsable = Array.isArray(data.responsable) ? data.responsable : data.responsable ? [data.responsable] : []
    const updatedResponsable = updateArray(responsable, updates, setter)
    const updatedConductors = updateArray(data.conductors, updates, setter)
    const updatedTreballadors = updateArray(data.treballadors, updates, setter)
    const updatedWorkers = updateArray(data.workers, updates, setter)

    const payload: Record<string, any> = {
      updatedAt: now,
    }
    if (updatedResponsable) payload.responsable = Array.isArray(updatedResponsable) && updatedResponsable.length === 1 ? updatedResponsable[0] : updatedResponsable
    if (updatedConductors) payload.conductors = updatedConductors
    if (updatedTreballadors) payload.treballadors = updatedTreballadors
    if (updatedWorkers) payload.workers = updatedWorkers
    if (closeDept) {
      payload.closedByDept = {
        ...(data.closedByDept || {}),
        [norm(department)]: now,
      }
    }

    await docRef.set(payload, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[quadrants/closing] error', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
