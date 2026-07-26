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
  applyClosingUpdatesToQuadrantData,
  normalizeClosingEventId,
  selectClosingQuadrantDocs,
  type ClosingPersonUpdate,
} from '@/lib/quadrantsClosing'

type Dept =
  | 'serveis'
  | 'logistica'
  | 'cuina'
  | 'produccio'
  | 'comercial'
  | string

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const norm = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())

async function resolveCollection(department: string) {
  return resolveQuadrantCollection(department, { prefer: 'singular' })
}

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
      updates?: ClosingPersonUpdate[]
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
    const collection = db.collection(colName)
    const canonicalEventId = normalizeClosingEventId(eventId)

    const byEventIdSnap = await collection.where('eventId', '==', canonicalEventId).get()
    const queriedDocs = byEventIdSnap.docs.map((doc) => ({
      id: doc.id,
      data: (doc.data() || {}) as Record<string, unknown>,
    }))

    let directDoc: { id: string; data: Record<string, unknown> } | null = null
    if (queriedDocs.length === 0) {
      const directSnap = await collection.doc(canonicalEventId).get()
      if (directSnap.exists) {
        directDoc = {
          id: directSnap.id,
          data: (directSnap.data() || {}) as Record<string, unknown>,
        }
      }
    }

    const targetDocs = selectClosingQuadrantDocs({
      eventId: canonicalEventId,
      queriedDocs,
      directDoc,
    })

    if (targetDocs.length === 0) {
      return NextResponse.json({ error: 'Quadrant no trobat' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const userId = jwtString(token, ['sub', 'id'])
    let totalMatched = 0
    let written = 0

    for (const target of targetDocs) {
      const { payload, matchedPeople } = applyClosingUpdatesToQuadrantData({
        data: target.data,
        updates,
        department: String(department),
        closeDept: Boolean(closeDept),
        nowIso: now,
        userId,
      })

      totalMatched += matchedPeople
      if (matchedPeople === 0 && !closeDept) continue

      await collection.doc(target.id).set(payload, { merge: true })
      written += 1
    }

    if (written === 0 || (totalMatched === 0 && !closeDept)) {
      return NextResponse.json(
        { error: 'No s’han trobat persones coincidents al quadrant' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      updatedDocs: written,
      matchedPeople: totalMatched,
    })
  } catch (err: unknown) {
    console.error('[quadrants/closing] error', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
