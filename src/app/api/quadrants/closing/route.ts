// file: src/app/api/quadrants/closing/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getToken, type JWT } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { isAllowedByClientOverride } from '@/lib/server/permissions'
import {
  applyClosingUpdatesToGroups,
  applyClosingUpdatesToPersonArray,
} from '@/lib/eventsPersonnelFromQuadrant'

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

async function resolveCollection(department: string) {
  return resolveQuadrantCollection(department, { prefer: 'singular' })
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

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const ok = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/events', 'event:close'),
    })
    if (ok !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    const meta = { userId, ts: now }

    const rawResp = data.responsable
    const responsable: ClosingRow[] = Array.isArray(rawResp)
      ? (rawResp as ClosingRow[])
      : rawResp && typeof rawResp === 'object'
        ? [rawResp as ClosingRow]
        : []
    const updatedResponsable = applyClosingUpdatesToPersonArray(responsable, updates, meta)
    const updatedResponsables = applyClosingUpdatesToPersonArray(
      Array.isArray(data.responsables) ? (data.responsables as ClosingRow[]) : undefined,
      updates,
      meta
    )
    const updatedConductors = applyClosingUpdatesToPersonArray(
      Array.isArray(data.conductors) ? (data.conductors as ClosingRow[]) : undefined,
      updates,
      meta
    )
    const updatedTreballadors = applyClosingUpdatesToPersonArray(
      Array.isArray(data.treballadors) ? (data.treballadors as ClosingRow[]) : undefined,
      updates,
      meta
    )
    const updatedWorkers = applyClosingUpdatesToPersonArray(
      Array.isArray(data.workers) ? (data.workers as ClosingRow[]) : undefined,
      updates,
      meta
    )
    const updatedGroups = applyClosingUpdatesToGroups(data.groups, updates, meta)

    const payload: Record<string, unknown> = {
      updatedAt: now,
    }
    if (updatedResponsable) {
      payload.responsable =
        Array.isArray(updatedResponsable) && updatedResponsable.length === 1
          ? updatedResponsable[0]
          : updatedResponsable
    }
    if (updatedResponsables) payload.responsables = updatedResponsables
    if (updatedConductors) payload.conductors = updatedConductors
    if (updatedTreballadors) payload.treballadors = updatedTreballadors
    if (updatedWorkers) payload.workers = updatedWorkers
    if (Array.isArray(data.groups)) payload.groups = updatedGroups
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
