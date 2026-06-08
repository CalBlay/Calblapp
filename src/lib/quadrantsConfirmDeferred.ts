/**
 * Confirmació quadrants: escriptura ràpida a Firestore + efectes diferits (training, chat, pushes).
 * Utilitzar des de `/api/quadrants/confirm` i des del POST `/api/quadrants` amb `confirmImmediately`.
 */
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { internalApiHeaders } from '@/lib/server/internalApiAuth'
import { formatTornNotificationLabel } from '@/lib/date-format'
import { resolveEventDisplayName } from '@/lib/eventDisplayName'

export const QUADRANT_TRAINING_COLLECTION = 'quadrantTrainingSamples'

export type QuadrantConfirmDoc = {
  status?: string
  treballadors?: Array<{ name: string }>
  conductors?: Array<{ name: string }>
  responsable?: { name: string }
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  autoProposal?: {
    createdAt?: string
    generationMode?: 'auto' | 'semi' | 'manual'
    responsibleName?: string | null
    driverNames?: string[]
    staffNames?: string[]
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
  [key: string]: unknown
}

type ValidUser = {
  userId: string
  name: string
}

export const qcNorm = (v?: string) =>
  (v || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function quadrantConfirmTrim(value: unknown) {
  return String(value ?? '').trim()
}

function safeString(value: unknown) {
  return quadrantConfirmTrim(value)
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = safeString(value)
    if (text) return text
  }
  return ''
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = safeString(value).replace(',', '.')
    if (!text) continue
    const parsed = Number(text)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeTrainingGroups(doc: QuadrantConfirmDoc | null) {
  const groups = Array.isArray(doc?.groups) ? doc!.groups : []
  return groups
    .map((raw, index) => {
      const group = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const id = firstString(group.id, `group-${index + 1}`)
      return {
        id,
        serviceDate: firstString(group.serviceDate, group.date, doc?.startDate),
        dateLabel: firstString(group.dateLabel, group.label),
        meetingPoint: firstString(group.meetingPoint, doc?.meetingPoint, doc?.location),
        startTime: firstString(group.startTime, doc?.startTime),
        arrivalTime: firstString(group.arrivalTime, doc?.arrivalTime),
        endTime: firstString(group.endTime, doc?.endTime),
        workers: firstNumber(group.workers, group.totalWorkers),
        drivers: firstNumber(group.drivers, group.numDrivers),
        needsDriver: group.needsDriver === true,
        responsibleId: firstString(group.responsibleId),
        responsibleName: firstString(group.responsibleName),
        driverId: firstString(group.driverId),
        driverName: firstString(group.driverName),
      }
    })
    .filter((group) => group.id || group.serviceDate || group.startTime || group.workers !== null)
}

function hasProposalDiff(diff: ReturnType<typeof computeQuadrantProposalDiff>) {
  if (!diff) return false
  return Boolean(
    diff.responsibleChanged ||
      diff.drivers.added.length ||
      diff.drivers.removed.length ||
      diff.staff.added.length ||
      diff.staff.removed.length ||
      diff.moved.length
  )
}

function buildTrainingSamplePayload(ctx: {
  dept: string
  colName: string
  eventId: string
  confirmedAtIso: string
  confirmedBy: string
  firstPrev: QuadrantConfirmDoc | null
  stageData: Record<string, unknown> | null
  assigned: ReturnType<typeof extractAssignedNamesFromQuadrant>
  diff: ReturnType<typeof computeQuadrantProposalDiff>
}) {
  const st = ctx.stageData || {}
  const doc = ctx.firstPrev || {}
  const groups = normalizeTrainingGroups(ctx.firstPrev)
  const eventName = firstString(doc.eventName, st.eventName, st.Nom)
  const location = firstString(doc.location, st.Ubicacio, st.location, st.eventLocation)
  const serviceType = firstString(doc.service, st.Servei, st.servei, st.service, st.serviceType)
  const lineOfBusiness = firstString(doc.ln, st.LN, st.FincaLN, st.ln, st.lineOfBusiness)
  const totalWorkers = firstNumber(doc.totalWorkers)
  const numDrivers = firstNumber(doc.numDrivers)

  return {
    trainingVersion: 2,
    createdAt: Date.now(),
    department: ctx.dept,
    sourceCollection: ctx.colName,
    sourceDocId: String(ctx.eventId),
    eventId: String(ctx.eventId),
    code: firstString(doc.code, st.code, st.C_digo),
    eventName,
    location,
    serviceType,
    service: serviceType,
    lineOfBusiness,
    ln: lineOfBusiness,
    numPax: firstNumber(doc.numPax, st.NumPax, st.numPax, st.pax),
    startDate: firstString(doc.startDate),
    startTime: firstString(doc.startTime),
    endDate: firstString(doc.endDate),
    endTime: firstString(doc.endTime),
    arrivalTime: firstString(doc.arrivalTime),
    meetingPoint: firstString(doc.meetingPoint, location),
    phaseType: firstString(doc.phaseType),
    phaseLabel: firstString(doc.phaseLabel),
    phaseDate: firstString(doc.phaseDate),
    totalWorkers,
    numDrivers,
    assignedPeopleCount: ctx.assigned.all.length,
    groupCount: groups.length,
    groups,
    confirmedAt: ctx.confirmedAtIso,
    confirmedBy: ctx.confirmedBy,
    generationMode: ctx.firstPrev?.autoProposal?.generationMode ?? null,
    changedFromProposal: hasProposalDiff(ctx.diff),
    assigned: ctx.assigned,
    proposal: ctx.firstPrev?.autoProposal || null,
    diff: ctx.diff,
    snapshot: ctx.firstPrev || {},
  }
}

export function extractAssignedNamesFromQuadrant(doc: QuadrantConfirmDoc | null) {
  const responsible = safeString(doc?.responsable?.name)
  const drivers = Array.isArray(doc?.conductors)
    ? doc!.conductors!.map((p) => safeString(p?.name)).filter(Boolean)
    : []
  const staff = Array.isArray(doc?.treballadors)
    ? doc!.treballadors!.map((p) => safeString(p?.name)).filter(Boolean)
    : []
  const all = Array.from(new Set([responsible, ...drivers, ...staff].filter(Boolean)))
  return { responsible: responsible || null, drivers, staff, all }
}

export function computeQuadrantProposalDiff(params: {
  proposal?: QuadrantConfirmDoc['autoProposal'] | null
  finalAssigned: ReturnType<typeof extractAssignedNamesFromQuadrant>
}) {
  const proposal = params.proposal || null
  if (!proposal) return null

  const pResp = safeString(proposal.responsibleName || '')
  const pDrivers = Array.isArray(proposal.driverNames)
    ? proposal.driverNames.map((n) => safeString(n)).filter(Boolean)
    : []
  const pStaff = Array.isArray(proposal.staffNames)
    ? proposal.staffNames.map((n) => safeString(n)).filter(Boolean)
    : []

  const fResp = safeString(params.finalAssigned.responsible || '')
  const fDrivers = params.finalAssigned.drivers.map((n) => safeString(n)).filter(Boolean)
  const fStaff = params.finalAssigned.staff.map((n) => safeString(n)).filter(Boolean)

  const nm = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

  const setDiff = (a: string[], b: string[]) => {
    const A = new Set(a.map(nm))
    const B = new Set(b.map(nm))
    const removed = a.filter((x) => !B.has(nm(x)))
    const added = b.filter((x) => !A.has(nm(x)))
    return { added, removed }
  }

  const drivers = setDiff(pDrivers, fDrivers)
  const staff = setDiff(pStaff, fStaff)

  const roleMap = (resp: string, drv: string[], stf: string[]) => {
    const m = new Map<string, 'responsible' | 'driver' | 'staff'>()
    if (resp) m.set(nm(resp), 'responsible')
    drv.forEach((n) => n && m.set(nm(n), 'driver'))
    stf.forEach((n) => n && m.set(nm(n), 'staff'))
    return m
  }
  const before = roleMap(pResp, pDrivers, pStaff)
  const after = roleMap(fResp, fDrivers, fStaff)
  const moved: Array<{ name: string; from: string; to: string }> = []
  for (const [k, from] of before.entries()) {
    const to = after.get(k)
    if (to && to !== from) {
      const display =
        fDrivers.find((x) => nm(x) === k) ||
        fStaff.find((x) => nm(x) === k) ||
        (fResp && nm(fResp) === k ? fResp : '') ||
        ''
      moved.push({ name: display || k, from, to })
    }
  }

  return {
    responsibleChanged: nm(pResp) !== nm(fResp),
    before: { responsible: proposal.responsibleName || null, drivers: pDrivers, staff: pStaff },
    after: { responsible: params.finalAssigned.responsible, drivers: fDrivers, staff: fStaff },
    drivers,
    staff,
    moved,
  }
}

async function lookupUserDocByAssignedDisplayName(rawName: string): Promise<ValidUser | null> {
  const name = safeString(rawName)
  if (!name) return null

  let snap = await db.collection('users').where('name', '==', name).limit(1).get()
  if (!snap.empty) {
    const userDoc = snap.docs[0]
    const data = userDoc.data() as { name?: string }
    const dn = safeString(data.name || name)
    return { userId: userDoc.id, name: dn }
  }

  snap = await db.collection('personnel').where('name', '==', name).limit(1).get()
  if (!snap.empty) {
    const personId = snap.docs[0].id
    const userDoc = await db.collection('users').doc(personId).get()
    if (userDoc.exists) {
      const data = userDoc.data() as { name?: string }
      return { userId: userDoc.id, name: safeString(data.name || name) }
    }
  }

  return null
}

async function resolveValidUsersFromQuadrant(doc: QuadrantConfirmDoc | null): Promise<ValidUser[]> {
  if (!doc) return []

  const assignedNames = [
    doc.responsable?.name,
    ...(doc.conductors || []).map((person) => person.name),
    ...(doc.treballadors || []).map((person) => person.name),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  if (assignedNames.length === 0) return []

  const uniqueNames = Array.from(new Set(assignedNames))
  const matches = await Promise.all(uniqueNames.map((n) => lookupUserDocByAssignedDisplayName(n)))

  const wanted = new Set(assignedNames.map((value) => qcNorm(value)))
  const seenId = new Set<string>()
  const out: ValidUser[] = []

  for (const m of matches) {
    if (!m || seenId.has(m.userId)) continue
    if (!wanted.has(qcNorm(m.name))) continue
    seenId.add(m.userId)
    out.push(m)
  }

  return out
}

export async function commitQuadrantConfirmedFirestoreBatch(params: {
  colName: string
  docIds: string[]
  confirmPatch: {
    status: string
    confirmedAt: AdminTimestamp
    confirmedBy: string
    code: string
  }
}) {
  const batch = db.batch()
  const colRef = db.collection(params.colName)
  for (const docId of params.docIds) {
    batch.set(colRef.doc(docId), params.confirmPatch, { merge: true })
  }
  await batch.commit()
}

export async function deferQuadrantConfirmSideEffects(ctx: {
  requestOrigin: string
  dept: string
  colName: string
  eventId: string
  confirmedAtIso: string
  confirmedBy: string
  firstPrev: QuadrantConfirmDoc | null
  stageData: Record<string, unknown> | null
  assigned: ReturnType<typeof extractAssignedNamesFromQuadrant>
  diff: ReturnType<typeof computeQuadrantProposalDiff>
}) {
  try {
    revalidateQuadrantsListCache()
  } catch {
    /* ignore */
  }

    resolveValidUsersFromQuadrant(ctx.firstPrev),
    (async () => {
      try {
        await db.collection(QUADRANT_TRAINING_COLLECTION).doc().set(buildTrainingSamplePayload(ctx))
      } catch (err) {
        console.warn('[quadrantsConfirmDeferred] training sample write failed', err)
      }
    })(),
    (async () => {
      try {
        await ensureEventChatChannel(String(ctx.eventId))
      } catch {
        /* ignore chat creation errors */
      }
    })(),
  ])

  try {
    const doc = ctx.firstPrev || {}
    const eventName =
      resolveEventDisplayName(ctx.stageData, doc.eventName, doc.summary) ||
      'Nou esdeveniment'
    const pushTitle = 'Tens un nou torn assignat'
    const pushBody = formatTornNotificationLabel(eventName, ctx.firstPrev?.startDate)
    if (validUsers.length === 0) return

    const notifBatch = db.batch()
    const now = Date.now()
    for (const u of validUsers) {
      const notifRef = db
        .collection('users')
        .doc(u.userId)
        .collection('notifications')
        .doc()
      notifBatch.set(notifRef, {
        title: pushTitle,
        body: pushBody,
        createdAt: now,
        read: false,
        type: 'torn',
        eventId: String(ctx.eventId),
        eventDate: ctx.firstPrev?.startDate || null,
        eventName,
      })
    }
    await notifBatch.commit()

    await Promise.all(
      validUsers.map((u) =>
        fetch(`${ctx.requestOrigin}/api/push/send`, {
          method: 'POST',
          headers: internalApiHeaders(),
          body: JSON.stringify({
            userId: u.userId,
            title: pushTitle,
            body: pushBody,
            url: `/menu/torns?open=${ctx.eventId}`,
          }),
        }).catch(() => {})
      )
    )
  } catch (err) {
    console.warn('[quadrantsConfirmDeferred] notifications/push failed', err)
  }
}
