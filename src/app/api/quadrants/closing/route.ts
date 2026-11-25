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
import {
  canEditUiPath,
  canViewUiPath,
  isAllowedByClientOverride,
} from '@/lib/server/permissions'
import {
  EVENT_CLOSING_ACTION,
  EVENT_CLOSING_CROSS_DEPARTMENT_ACTION,
  canCloseEventDepartment,
  canEnableEventClosingAction,
} from '@/lib/eventClosingPermissions'
import {
  applyClosingUpdatesToQuadrantData,
  normalizeClosingEventId,
  selectClosingQuadrantDocs,
  type ClosingPersonUpdate,
} from '@/lib/quadrantsClosing'
import { isUserOperationalResponsibleInQuadrants } from '@/lib/server/eventOperationalResponsibility'
import { normalizeCommercialAuditGroup } from '@/lib/auditDepartment'

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
    const [closingOverrideAllowed, crossDepartmentOverrideAllowed, canViewEvents, canEditEvents] = await Promise.all([
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/events', EVENT_CLOSING_ACTION),
      }),
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/events', EVENT_CLOSING_CROSS_DEPARTMENT_ACTION),
      }),
      canViewUiPath({ user: auth.user, path: '/menu/events' }),
      canEditUiPath({ user: auth.user, path: '/menu/events' }),
    ])
    const hasClosingPermission = canEnableEventClosingAction({
      canViewEvents,
      canEditEvents,
      hasClosingOverride: closingOverrideAllowed === true,
    })
    if (!hasClosingPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { eventId, department, updates, closeDept, quadrantId, phaseType, correctionReason } = (await req.json()) as {
      eventId?: string
      department?: Dept
      updates?: ClosingPersonUpdate[]
      closeDept?: boolean
      quadrantId?: string
      phaseType?: string
      correctionReason?: string
    }

    if (!eventId || !department || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'Falten camps requerits' }, { status: 400 })
    }
    const invalidLateArrival = updates.find(
      (update) =>
        update.lateArrival === true &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(update.startTimeReal || ''))
    )
    if (invalidLateArrival) {
      return NextResponse.json(
        { error: `Falta una hora real d'arribada vàlida per a ${invalidLateArrival.name || 'una persona'}` },
        { status: 400 }
      )
    }

    const roleRaw = jwtString(token, ['role', 'userRole'])
    const deptToken = norm(
      jwtString(token, ['department', 'userDepartment', 'dept', 'departmentName'])
    )
    const role = norm(roleRaw)

    if (!canCloseEventDepartment({
      role,
      userDepartment: deptToken,
      targetDepartment: department,
      hasClosingPermission,
      hasCrossDepartmentPermission: crossDepartmentOverrideAllowed === true,
    })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const colName = await resolveCollection(department)
    const collection = db.collection(colName)
    const canonicalEventId = normalizeClosingEventId(eventId)
    const targetDepartment = norm(String(department))
    const userCommercialGroup = normalizeCommercialAuditGroup(auth.user.department)
    const isCrossDepartmentChange = Boolean(deptToken && targetDepartment !== deptToken)
    if (isCrossDepartmentChange && userCommercialGroup) {
      const eventSnaps = await Promise.all(
        ['stage_verd', 'stage_taronja'].map((collectionId) =>
          db.collection(collectionId).doc(canonicalEventId).get()
        )
      )
      const eventData = eventSnaps.find((snap) => snap.exists)?.data()
      const eventCode = String(eventData?.code || eventData?.Codi || '').trim()
      const eventCommercialGroup =
        normalizeCommercialAuditGroup(String(eventData?.LN || eventData?.lnKey || '')) ||
        (/^F(?:-|\d)/i.test(eventCode) ? 'foodlovers' : null)
      if (eventCommercialGroup !== userCommercialGroup) {
        return NextResponse.json(
          { error: 'El permÃ­s interdepartamental nomÃ©s sâ€™aplica als esdeveniments de la teva lÃ­nia comercial' },
          { status: 403 }
        )
      }
    }
    const requestedQuadrantId = String(quadrantId || '').trim()
    if (requestedQuadrantId.includes('/')) {
      return NextResponse.json({ error: 'quadrantId no vàlid' }, { status: 400 })
    }

    const [byEventIdSnap, exactSnap] = await Promise.all([
      collection.where('eventId', '==', canonicalEventId).get(),
      requestedQuadrantId ? collection.doc(requestedQuadrantId).get() : Promise.resolve(null),
    ])
    const queriedDocs = byEventIdSnap.docs.map((doc) => ({
      id: doc.id,
      data: (doc.data() || {}) as Record<string, unknown>,
    }))

    let directDoc: { id: string; data: Record<string, unknown> } | null =
      exactSnap?.exists
        ? { id: exactSnap.id, data: (exactSnap.data() || {}) as Record<string, unknown> }
        : null
    if (!directDoc && queriedDocs.length === 0) {
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
      quadrantId: requestedQuadrantId || null,
      phaseType: requestedQuadrantId ? null : phaseType || null,
    })

    if (targetDocs.length === 0) {
      return NextResponse.json({ error: 'Quadrant no trobat' }, { status: 404 })
    }

    if (
      auth.role === 'treballador' &&
      !isUserOperationalResponsibleInQuadrants({
        docs: targetDocs.map((target) => target.data),
        userId: auth.user.id,
        userName: auth.user.name,
      })
    ) {
      return NextResponse.json(
        { error: 'Només el responsable assignat a l’esdeveniment pot fer el tancament operatiu' },
        { status: 403 }
      )
    }

    const now = new Date().toISOString()
    const userId = auth.user.id || jwtString(token, ['sub', 'id'])
    const reason = String(correctionReason || '').trim()
    let totalMatched = 0
    let written = 0
    const pendingWrites: Array<{
      target: (typeof targetDocs)[number]
      payload: Record<string, unknown>
      changes: ReturnType<typeof applyClosingUpdatesToQuadrantData>['changes']
    }> = []

    for (const target of targetDocs) {
      const { payload, matchedPeople, changes } = applyClosingUpdatesToQuadrantData({
        data: target.data,
        updates,
        department: String(department),
        closeDept: Boolean(closeDept),
        nowIso: now,
        userId,
        userName: auth.user.name || '',
        correctionReason: reason,
      })

      totalMatched += matchedPeople
      if (matchedPeople === 0 && !closeDept) continue

      pendingWrites.push({ target, payload, changes })
      written += 1
    }

    if (written === 0 || (totalMatched === 0 && !closeDept)) {
      return NextResponse.json(
        { error: 'No s’han trobat persones coincidents al quadrant' },
        { status: 404 }
      )
    }

    const hasCorrections = pendingWrites.some(({ changes }) =>
      changes.some((change) => change.isCorrection)
    )
    if (hasCorrections && !reason) {
      return NextResponse.json(
        { error: 'Cal indicar el motiu de la correcciÃ³ de les hores ja tancades' },
        { status: 400 }
      )
    }

    const batch = db.batch()
    let auditEntries = 0
    for (const { target, payload, changes } of pendingWrites) {
      batch.set(collection.doc(target.id), payload, { merge: true })
      for (const change of changes) {
        const historyRef = db.collection('eventClosingHistory').doc()
        batch.create(historyRef, {
          eventId: canonicalEventId,
          quadrantId: target.id,
          department: norm(String(department)),
          personId: change.personId || null,
          personName: change.personName,
          personRole: change.role,
          before: change.before,
          after: change.after,
          isCorrection: change.isCorrection,
          revision: change.revision,
          reason: change.isCorrection ? reason : '',
          changedAt: now,
          changedBy: {
            userId,
            userName: String(auth.user.name || ''),
            userRole: String(auth.user.role || roleRaw || ''),
            userDepartment: String(auth.user.department || deptToken || ''),
          },
        })
        auditEntries += 1
      }
    }
    await batch.commit()

    return NextResponse.json({
      ok: true,
      updatedDocs: written,
      matchedPeople: totalMatched,
      auditEntries,
    })
  } catch (err: unknown) {
    console.error('[quadrants/closing] error', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
