// file: src/app/api/quadrants/closing/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getToken, type JWT } from 'next-auth/jwt'
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

type ClosingRow = Record<string, unknown>

function jwtString(token: JWT, keys: readonly string[]): string {
  const rec = token as JWT & Record<string, unknown>
  for (const key of keys) {
    const v = rec[key]
    if (typeof v === 'string') return v
  }
  return ''
}

function updateArray(
  arr: ClosingRow[] | undefined,
  updates: PersonUpdate[],
  setter: (item: ClosingRow, upd: PersonUpdate) => void
): ClosingRow[] | undefined {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) => {
    const itemName = typeof item.name === 'string' ? item.name : undefined
    const upd = updates.find((u) => matchByName(u.name, itemName))
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

    const roleRaw = jwtString(token, ['role', 'userRole'])
    const deptToken = norm(
      jwtString(token, ['department', 'userDepartment', 'dept', 'departmentName'])
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
    const userId = jwtString(token, ['sub', 'id'])

    const setter = (item: ClosingRow, upd: PersonUpdate) => {
      item.endTimeReal = upd.endTimeReal || null
      item.sortidaNotes = upd.notes || ''
      item.noShow = !!upd.noShow
      item.leftEarly = !!upd.leftEarly
      item.sortidaSetBy = { userId, ts: now }
    }

    const rawResp = data.responsable
    const responsable: ClosingRow[] = Array.isArray(rawResp)
      ? (rawResp as ClosingRow[])
      : rawResp && typeof rawResp === 'object'
        ? [rawResp as ClosingRow]
        : []
    const updatedResponsable = updateArray(responsable, updates, setter)
    const updatedConductors = updateArray(
      Array.isArray(data.conductors) ? (data.conductors as ClosingRow[]) : undefined,
      updates,
      setter
    )
    const updatedTreballadors = updateArray(
      Array.isArray(data.treballadors) ? (data.treballadors as ClosingRow[]) : undefined,
      updates,
      setter
    )
    const updatedWorkers = updateArray(
      Array.isArray(data.workers) ? (data.workers as ClosingRow[]) : undefined,
      updates,
      setter
    )

    const payload: Record<string, unknown> = {
      updatedAt: now,
    }
    if (updatedResponsable) payload.responsable = Array.isArray(updatedResponsable) && updatedResponsable.length === 1 ? updatedResponsable[0] : updatedResponsable
    if (updatedConductors) payload.conductors = updatedConductors
    if (updatedTreballadors) payload.treballadors = updatedTreballadors
    if (updatedWorkers) payload.workers = updatedWorkers
    if (closeDept) {
      const prevRaw = data.closedByDept
      const prev =
        prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
          ? { ...(prevRaw as Record<string, unknown>) }
          : {}
      payload.closedByDept = {
        ...prev,
        [norm(department)]: now,
      }
    }

    await docRef.set(payload, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[quadrants/closing] error', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
