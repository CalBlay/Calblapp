// src/app/api/quadrants/route.ts
import { after, NextResponse, type NextRequest } from 'next/server'
import { Timestamp, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import { findQuadrantOverlapConflicts } from '@/lib/quadrantOverlapGuard'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import {
  commitQuadrantConfirmedFirestoreBatch,
  deferQuadrantConfirmSideEffects,
  computeQuadrantProposalDiff,
  extractAssignedNamesFromQuadrant,
  quadrantConfirmTrim,
  type QuadrantConfirmDoc,
} from '@/lib/quadrantsConfirmDeferred'
import { autoAssign } from '@/services/autoAssign'
import { loadDepartmentPersonnel, loadPremises, type DriverCrewPremise } from '@/services/premises'
import { getSurveyPreferredCandidates } from '@/lib/quadrantSurveys'
import { buildLedger } from '@/services/workloadLedger'
import {
  getQuadrantLearningSuggestion,
  type QuadrantLearningSuggestion,
} from '@/lib/quadrantLearning'

export const runtime = 'nodejs'
const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())

/** Serveis, Cuina i Logística: mateix sistema de modes, training i confirmació inline en manual. */
const QUADRANT_CORE_DEPARTMENTS = new Set(['serveis', 'cuina', 'logistica'])
const isQuadrantCoreDepartment = (deptNorm: string) => QUADRANT_CORE_DEPARTMENTS.has(norm(deptNorm))
const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

/** Reparteix M elements en `phaseCount` trossos contigus (cap solapament); suma dels trossos = M. */
function partitionAssignmentsAcrossPhases<T>(items: T[], phaseCount: number): T[][] {
  if (phaseCount <= 0) return []
  const n = items.length
  const result: T[][] = []
  const base = Math.floor(n / phaseCount)
  let extra = n % phaseCount
  let offset = 0
  for (let i = 0; i < phaseCount; i++) {
    const size = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    result.push(items.slice(offset, offset + size))
    offset += size
  }
  return result
}

/**
 * Resol el nom real de col·leccio per departament (`quadrants{Dept}` o
 * `quadrant{Dept}`). Delega al modul `firestoreCollections` que
 * comparteix el cache de `listCollections()` entre tots els call sites.
 */
async function resolveWriteCollectionForDepartment(department: string) {
  return resolveQuadrantCollection(department, { prefer: 'singular' })
}


/* ================= Tipus ================= */
interface CuinaGroup {
  meetingPoint: string
  startTime: string
  arrivalTime?: string | null
  endTime: string
  workers: number
  drivers: number
  needsDriver?: boolean
  wantsResponsible?: boolean
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

interface QuadrantSave {
  code: string
  eventId: string
  eventName: string
  location: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  department: string
  status: string
  numDrivers: number
  totalWorkers: number
  numPax?: number | null
  responsableName: string | null
  responsable: { name: string; meetingPoint: string } | null
  conductors: Array<{ name: string; meetingPoint: string; plate: string; vehicleType: string }>
  treballadors: Array<{
    name: string
    meetingPoint: string
    startDate?: string
    endDate?: string
    startTime?: string
    endTime?: string
    arrivalTime?: string | null
    isExternal?: boolean
  }>
  needsReview: boolean
  violations: string[]
  attentionNotes: string[]
  updatedAt: string
  legacyBrigades?: Array<Record<string, unknown>>
  groups?: Array<{
    meetingPoint: string
    startTime: string
    arrivalTime?: string | null
    endTime: string
    workers: number
    drivers: number
    responsibleId?: string | null
    responsibleName?: string | null
  }>
  cuinaGroupCount?: number
  service?: string | null
  arrivalTime?: string | null
  distanceKm?: number | null
  distanceCalcAt?: string | null
  timetables?: Array<{ startTime: string; endTime: string }>
  ln?: string | null
  phaseType?: string | null
  phaseLabel?: string | null
  phaseDate?: string | null
  /** Model de vestimenta triat en crear el quadrant (Serveis). */
  vestimentModel?: string | null
  /**
   * Snapshot de l'assignació vigent al desament (auto, semi o manual).
   * Serveix per calcular diff en confirmar i per mostres d'entrenament (ML).
   */
  autoProposal?: {
    createdAt: string
    /** Com s'ha generat la fila desada: auto | semi | manual */
    generationMode?: 'auto' | 'semi' | 'manual'
    responsibleName: string | null
    driverNames: string[]
    staffNames: string[]
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
}

type ServeisGroupInput = Record<string, unknown> & {
  wantsResponsible?: boolean
  id?: string | null
  serviceDate?: string | null
  dateLabel?: string | null
  meetingPoint?: string
  startTime?: string
  endTime?: string
  workers?: number | string
  jamoneros?: number | string
  drivers?: number | string
  needsDriver?: boolean
  driverId?: string | null
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
  manualWorkers?: unknown
}

type ExternalWorkerInput = {
  name?: string
  meetingPoint?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string | null
  isExternal?: boolean
}

type InternalWorkerLine = {
  name: string
  meetingPoint: string
  isJamonero?: boolean
}

type ExternalWorkerLine = {
  name: string
  meetingPoint: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string | null
  isExternal?: boolean
}

/** Subset of POST body fields consumed by `buildToSave` */
type QuadrantSaveRequestBody = {
  code?: string
  eventId?: string
  eventName?: string
  location?: string
  meetingPoint?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  arrivalTime?: string | null
  numDrivers?: number | string
  totalWorkers?: number | string
  numPax?: number | null
  service?: string | null
  ln?: string | null
  phaseType?: string | null
  phaseLabel?: string | null
  phaseDate?: string | null
  manualResponsibleName?: string
  externalWorkers?: ExternalWorkerInput[]
  timetables?: Array<{ startTime?: unknown; endTime?: unknown }>
  vestimentModel?: unknown
  groups?: ServeisGroupInput[]
  jamoneroCount?: number | string
  cuinaGroupCount?: number | string
  mode?: 'auto' | 'semi' | 'manual'
  manualAssignment?: {
    responsibleName?: string | null
    driverNames?: string[]
    staffNames?: string[]
  }
}

type JamoneroAssignmentRaw = {
  id?: string
  mode?: string
  personnelId?: string
  personnelName?: string
}

type JamoneroAssignmentNormalized = {
  id: string
  mode: 'manual' | 'auto'
  personnelId: string | null
  personnelName: string | null
}

type SurveyPreferenceAugmentation = {
  preferredStaffNames: string[]
  preferredDriverNames: string[]
  preferredResponsibleName: string | null
}

type PhaseRequest = Record<string, unknown> & {
  groupId?: string | null
  label?: string
  phaseType?: string
  date?: string
  endDate?: string
  startTime?: string
  endTime?: string
  totalWorkers?: number
  jamoneroCount?: number
  numDrivers?: number
  wantsResp?: boolean
  responsableId?: string | null
  manualDriverId?: string | null
  meetingPoint?: string
  vehicles?: unknown[]
  groupsOverride?: ServeisGroupInput[]
  serviceJamoneroAssignmentsOverride?: JamoneroAssignmentNormalized[]
  partitionedServiceJamoneros?: JamoneroAssignmentNormalized[]
  timetables?: unknown
}

async function enrichWithSurveyPreferences<T extends Record<string, unknown>>(
  payload: T,
  department: string,
  surveyPreferred?: { yes: string[]; maybe: string[] }
): Promise<T & SurveyPreferenceAugmentation> {
  const eventId = normalizeEventId(String(payload?.eventId || ''))
  const serviceDate = String(payload?.phaseDate || payload?.startDate || '').slice(0, 10)
  if (!eventId || !serviceDate) {
    return {
      ...payload,
      preferredStaffNames: Array.isArray(payload?.preferredStaffNames)
        ? (payload.preferredStaffNames as string[])
        : [],
      preferredDriverNames: Array.isArray(payload?.preferredDriverNames)
        ? (payload.preferredDriverNames as string[])
        : [],
      preferredResponsibleName:
        typeof payload?.preferredResponsibleName === 'string'
          ? payload.preferredResponsibleName
          : null,
    }
  }

  const resolvedSurveyPreferred =
    surveyPreferred ||
    (await getSurveyPreferredCandidates({
      eventId,
      department,
      serviceDate,
    }))

  const mergedPreferredStaffNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredStaffNames) ? payload.preferredStaffNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const mergedPreferredDriverNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredDriverNames) ? payload.preferredDriverNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const preferredResponsibleName: string | null =
    (typeof payload?.preferredResponsibleName === 'string'
      ? payload.preferredResponsibleName
      : null) ||
    resolvedSurveyPreferred.yes[0] ||
    resolvedSurveyPreferred.maybe[0] ||
    null

  return {
    ...payload,
    preferredStaffNames: mergedPreferredStaffNames,
    preferredDriverNames: mergedPreferredDriverNames,
    preferredResponsibleName,
  }
}

const normalizeJamoneroAssignment = (
  assignment: JamoneroAssignmentRaw,
  index: number
): JamoneroAssignmentNormalized => ({
  id: String(assignment?.id || `jamonero-${index + 1}`),
  mode: assignment?.mode === 'manual' ? 'manual' : 'auto',
  personnelId: assignment?.personnelId ? String(assignment.personnelId) : null,
  personnelName: assignment?.personnelName ? String(assignment.personnelName) : null,
})

const getDateWindow = (startISODate: string) => {
  const d = new Date(`${startISODate}T00:00:00`)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - (day - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const [ws, we, ms, me] = [weekStart, weekEnd, monthStart, monthEnd].map((x) =>
    x.toISOString().slice(0, 10)
  )
  return { ws, we, ms, me }
}

type DepartmentPersonLite = {
  id?: string
  name?: string
  isJamonero?: boolean
  isDriver?: boolean
}

/** Cerca per id i nom normalitzat sense recórrer la llista a cada crida (manual fast path). */
function makeDepartmentPersonFinder(people: DepartmentPersonLite[]) {
  const byId = new Map<string, DepartmentPersonLite>()
  const byNormName = new Map<string, DepartmentPersonLite>()
  for (const person of people) {
    const idStr = String(person.id || '').trim()
    if (idStr && !byId.has(idStr)) byId.set(idStr, person)
    const nameKey = norm(String(person.name || ''))
    if (nameKey && !byNormName.has(nameKey)) byNormName.set(nameKey, person)
  }
  return (id?: string | null, nameHint?: string | null): DepartmentPersonLite | null => {
    const idStr = id ? String(id).trim() : ''
    if (idStr) {
      const hit = byId.get(idStr)
      if (hit?.name) return hit
    }
    if (nameHint) {
      const nh = norm(String(nameHint))
      if (!nh) return null
      return byNormName.get(nh) || null
    }
    return null
  }
}

/** Mode manual Serveis després d’autoAssign: sense treballadors “auto”, només triats manualment + auto jamoneros. */
function applyManualServeisStaffPolicy(
  assignment: {
    responsible?: { name: string } | null
    drivers?: Array<{
      name: string
      meetingPoint?: string
      plate?: string
      vehicleType?: string
      isJamonero?: boolean
    }>
    staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
  },
  groups: ServeisGroupInput[],
  departmentPeople: DepartmentPersonLite[],
  phaseServiceJamoneros: JamoneroAssignmentNormalized[],
  fallbackMeetingPoint: string
) {
  const meeting = fallbackMeetingPoint
  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  const isJamoneroPerson = (p: DepartmentPersonLite | null, displayName: string) => {
    if (p?.isJamonero === true) return true
    const nn = norm(displayName)
    return phaseServiceJamoneros.some(
      (j) =>
        j.mode === 'manual' &&
        ((j.personnelId && p?.id && String(j.personnelId) === String(p.id)) ||
          (j.personnelName && norm(String(j.personnelName)) === nn))
    )
  }

  const manualStaff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const seenManualNorm = new Set<string>()

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    const mw = g.manualWorkers
    if (!Array.isArray(mw)) continue
    for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
      const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
      const name = String((p?.name || w?.name || '').trim())
      if (!name) continue
      const nn = norm(name)
      if (seenManualNorm.has(nn)) continue
      seenManualNorm.add(nn)
      manualStaff.push({
        name,
        meetingPoint: String(w?.meetingPoint || gMp || meeting),
        isJamonero: isJamoneroPerson(p, name) || undefined,
      })
    }
  }

  const jamoneroAutoStaff = (assignment.staff || []).filter(
    (s) => s?.name && String(s.name).trim() && s.isJamonero === true
  )

  const merged: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = [...manualStaff]
  const seenNorm = new Set(seenManualNorm)
  for (const row of jamoneroAutoStaff) {
    const nn = norm(String(row.name))
    if (!nn || seenNorm.has(nn)) continue
    seenNorm.add(nn)
    merged.push(row)
  }

  return {
    ...assignment,
    staff: merged,
  }
}

/** Sense autoAssign ni ledger: només camps del formulari per Serveis manual (sense slots jamonero auto). */
function buildServeisManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[],
  phaseServiceJamoneros: JamoneroAssignmentNormalized[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
    staff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')
  const skipResponsible = phaseAssignBody.skipResponsible === true

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  const isJamoneroPerson = (p: DepartmentPersonLite | null, displayName: string) => {
    if (p?.isJamonero === true) return true
    const nn = norm(displayName)
    return phaseServiceJamoneros.some(
      (j) =>
        j.mode === 'manual' &&
        ((j.personnelId && p?.id && String(j.personnelId) === String(p.id)) ||
          (j.personnelName && norm(String(j.personnelName)) === nn))
    )
  }

  let responsible: { name: string } | null = null
  const drivers: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const staff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const seenDriverNorm = new Set<string>()
  const seenStaffNorm = new Set<string>()
  const groups = Array.isArray(phaseAssignBody.groups)
    ? (phaseAssignBody.groups as ServeisGroupInput[])
    : []

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    if (!skipResponsible && g.wantsResponsible !== false && g.responsibleId) {
      const p = findPerson(
        String(g.responsibleId),
        typeof g.responsibleName === 'string' ? g.responsibleName : null
      )
      if (p?.name && !responsible) responsible = { name: String(p.name) }
    }
    if (g.needsDriver && g.driverId) {
      const p = findPerson(
        String(g.driverId),
        typeof g.driverName === 'string' ? g.driverName : null
      )
      if (p?.name) {
        const dn = norm(String(p.name))
        if (!seenDriverNorm.has(dn)) {
          seenDriverNorm.add(dn)
          drivers.push({
            name: String(p.name),
            meetingPoint: gMp,
            isJamonero: isJamoneroPerson(p, String(p.name)) || undefined,
          })
        }
      }
    }
    const mw = g.manualWorkers
    if (!Array.isArray(mw)) continue
    for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
      const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
      const name = String((p?.name || w?.name || '').trim())
      if (!name) continue
      const nn = norm(name)
      if (seenStaffNorm.has(nn)) continue
      seenStaffNorm.add(nn)
      staff.push({
        name,
        meetingPoint: String(w?.meetingPoint || gMp || meeting),
        isJamonero: isJamoneroPerson(p, name) || undefined,
      })
    }
  }

  const topRespId =
    typeof phaseAssignBody.manualResponsibleId === 'string'
      ? phaseAssignBody.manualResponsibleId.trim()
      : ''
  if (!skipResponsible && !responsible && topRespId) {
    const p = findPerson(topRespId, null)
    if (p?.name) responsible = { name: String(p.name) }
  }

  const manualDriverId =
    typeof phaseAssignBody.manualDriverId === 'string' ? String(phaseAssignBody.manualDriverId).trim() : ''
  if (manualDriverId) {
    const p = findPerson(manualDriverId, null)
    if (p?.name) {
      const dn = norm(String(p.name))
      if (!seenDriverNorm.has(dn)) {
        seenDriverNorm.add(dn)
        drivers.push({
          name: String(p.name),
          meetingPoint: meeting,
          isJamonero: isJamoneroPerson(p, String(p.name)) || undefined,
        })
      }
    }
  }

  for (const j of phaseServiceJamoneros) {
    if (j.mode !== 'manual') continue
    const p = j.personnelId
      ? findPerson(String(j.personnelId), j.personnelName ? String(j.personnelName) : null)
      : findPerson(null, j.personnelName ? String(j.personnelName) : null)
    const name = String((p?.name || j.personnelName || '').trim())
    if (!name) continue
    const nn = norm(name)

    const existingDriver = drivers.find((d) => norm(d.name) === nn)
    const existingStaff = staff.find((s) => norm(s.name) === nn)
    if (existingDriver) {
      existingDriver.isJamonero = true
      continue
    }
    if (existingStaff) {
      existingStaff.isJamonero = true
      continue
    }

    if (p?.isDriver === true) {
      if (!seenDriverNorm.has(nn)) {
        seenDriverNorm.add(nn)
        drivers.push({ name, meetingPoint: meeting, isJamonero: true })
      }
    } else {
      if (!seenStaffNorm.has(nn)) {
        seenStaffNorm.add(nn)
        staff.push({ name, meetingPoint: meeting, isJamonero: true })
      }
    }
  }

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: false, violations: [], notes: [] },
  }
}

/** Manual Cuina: IDs i noms dels grups → assignació sense autoAssign ni ledger. */
function buildCuinaManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  let responsible: { name: string } | null = null
  const drivers: Array<{ name: string; meetingPoint?: string }> = []
  const staff: Array<{ name: string; meetingPoint?: string }> = []
  const seenDriverNorm = new Set<string>()
  const seenStaffNorm = new Set<string>()
  const groups = Array.isArray(phaseAssignBody.groups)
    ? (phaseAssignBody.groups as ServeisGroupInput[])
    : []

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    if (g.wantsResponsible !== false) {
      const rid = String(g.responsibleId || '').trim()
      const p = findPerson(rid || null, typeof g.responsibleName === 'string' ? g.responsibleName : null)
      if (p?.name && !responsible) responsible = { name: String(p.name) }
    }
    const nd = Number(g.drivers || 0)
    const needsDriver = g.needsDriver === true || nd > 0
    if (needsDriver) {
      const did = String(g.driverId || '').trim()
      const p = findPerson(did || null, typeof g.driverName === 'string' ? g.driverName : null)
      if (p?.name) {
        const dn = norm(String(p.name))
        if (!seenDriverNorm.has(dn)) {
          seenDriverNorm.add(dn)
          drivers.push({ name: String(p.name), meetingPoint: gMp })
        }
      }
    }

    const mw = g.manualWorkers
    if (Array.isArray(mw)) {
      for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
        const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
        const name = String((p?.name || w?.name || '').trim())
        if (!name) continue
        const nn = norm(name)
        if (seenStaffNorm.has(nn)) continue
        seenStaffNorm.add(nn)
        staff.push({
          name,
          meetingPoint: String(w?.meetingPoint || gMp || meeting),
        })
      }
    }
  }

  const topRespId =
    typeof phaseAssignBody.manualResponsibleId === 'string'
      ? phaseAssignBody.manualResponsibleId.trim()
      : ''
  if (!responsible && topRespId) {
    const p = findPerson(topRespId, null)
    if (p?.name) responsible = { name: String(p.name) }
  }

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: false, violations: [], notes: [] },
  }
}

/** Manual Logística: responsable + conductors per vehicle; personal extra co omple amb buildToSave. */
function buildLogisticaManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')
  const skipResponsible = phaseAssignBody.skipResponsible === true

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  let responsible: { name: string } | null = null
  if (!skipResponsible) {
    const rid = String(phaseAssignBody.manualResponsibleId || '').trim()
    if (rid) {
      const p = findPerson(rid, null)
      if (p?.name) responsible = { name: String(p.name) }
    }
  }

  const drivers: Array<{
    name: string
    meetingPoint?: string
    plate?: string
    vehicleType?: string
  }> = []
  const seenDriverNorm = new Set<string>()
  const vehicles = Array.isArray(phaseAssignBody.vehicles)
    ? (phaseAssignBody.vehicles as Array<{
        conductorId?: string | null
        plate?: unknown
        vehicleType?: unknown
      }>)
    : []
  for (const v of vehicles) {
    const cid = v.conductorId ? String(v.conductorId).trim() : ''
    if (!cid) continue
    const p = findPerson(cid, null)
    if (!p?.name) continue
    const dn = norm(String(p.name))
    if (seenDriverNorm.has(dn)) continue
    seenDriverNorm.add(dn)
    drivers.push({
      name: String(p.name),
      meetingPoint: meeting,
      plate: String(v.plate || ''),
      vehicleType: String(v.vehicleType || ''),
    })
  }

  const manualDriverId = String(phaseAssignBody.manualDriverId || '').trim()
  if (manualDriverId) {
    const p = findPerson(manualDriverId, null)
    if (p?.name) {
      const dn = norm(String(p.name))
      if (!seenDriverNorm.has(dn)) {
        seenDriverNorm.add(dn)
        drivers.push({
          name: String(p.name),
          meetingPoint: meeting,
          plate: '',
          vehicleType: '',
        })
      }
    }
  }

  const tw = Number(phaseAssignBody.totalWorkers || 0)
  const nd = Number(phaseAssignBody.numDrivers || 0)
  const driverSlots = Math.max(nd, drivers.length)
  const respDeduction = !skipResponsible && responsible ? 1 : 0
  const staffCount = Math.max(tw - driverSlots - respDeduction, 0)

  const rawManualWorkers = Array.isArray(phaseAssignBody.manualWorkers)
    ? (
        phaseAssignBody.manualWorkers as Array<{
          id?: string
          name?: string
          meetingPoint?: string
        }>
      )
    : []

  const namedStaff: Array<{ name: string; meetingPoint?: string }> = []
  const namedNorm = new Set<string>()
  for (const w of rawManualWorkers) {
    if (namedStaff.length >= staffCount) break
    const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
    const name = String((p?.name || w?.name || '').trim())
    if (!name || name === 'Extra') continue
    const nn = norm(name)
    if (namedNorm.has(nn)) continue
    namedNorm.add(nn)
    namedStaff.push({
      name,
      meetingPoint: String(w?.meetingPoint || meeting),
    })
  }

  const extraSlots = Math.max(0, staffCount - namedStaff.length)
  const staff = [...namedStaff, ...Array.from({ length: extraSlots }, () => ({
    name: 'Extra',
    meetingPoint: meeting,
  }))]

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: false, violations: [], notes: [] },
  }
}

/* ================= Handler ================= */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
    if (!canView) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const canonicalEventId = normalizeEventId(String(body?.eventId || ''))
    let cachedDepartmentPeople:
      | Awaited<ReturnType<typeof loadDepartmentPersonnel>>
      | null = null
    let cachedPremisesData:
      | Awaited<ReturnType<typeof loadPremises>>
      | null = null
    const surveyPreferredCache = new Map<string, Awaited<ReturnType<typeof getSurveyPreferredCandidates>>>()
    const ledgerCache = new Map<string, Awaited<ReturnType<typeof buildLedger>>>()

    /** Una sola lectura Firestore per esdeveniment (abans era per cada fase). */
    const stageVerdPayloadCache = new Map<string, Record<string, unknown> | null>()
    const getStageVerdCached = async (stageDocId: string): Promise<Record<string, unknown> | null> => {
      const id = String(stageDocId || '').trim()
      if (!id) return null
      if (stageVerdPayloadCache.has(id)) {
        return stageVerdPayloadCache.get(id) ?? null
      }
      const snap = await db.collection('stage_verd').doc(id).get()
      const payload = snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : null
      stageVerdPayloadCache.set(id, payload)
      return payload
    }

    const required = ['eventId', 'department', 'startDate', 'endDate']
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ success: false, error: `Missing ${k}` }, { status: 400 })
      }
    }

    const deptNorm = norm(String(body.department || ''))
    const collectionName = await resolveWriteCollectionForDepartment(deptNorm)
    console.log('[quadrants/route] Escriurà a col·lecció:', collectionName)

    const mode: 'auto' | 'semi' | 'manual' =
      body?.mode === 'auto' || body?.mode === 'semi' || body?.mode === 'manual'
        ? body.mode
        : 'semi'

    const confirmImmediatelyRequested = Boolean(body?.confirmImmediately === true)
    let jwtSessionForInlineConfirm: { user?: { email?: string }; email?: string } | null = null

    const canSave = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/quadrants', 'save'),
    })
    if (canSave !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    if (confirmImmediatelyRequested) {
      const canConfirm = await isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'confirm'),
      })
      if (canConfirm !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    if (confirmImmediatelyRequested && (mode !== 'manual' || !isQuadrantCoreDepartment(deptNorm))) {
      return NextResponse.json(
        {
          success: false,
          error:
            'confirmImmediately només és vàlid en mode manual per a departaments Serveis, Cuina o Logística',
        },
        { status: 400 }
      )
    }
    if (confirmImmediatelyRequested && mode === 'manual' && isQuadrantCoreDepartment(deptNorm)) {
      jwtSessionForInlineConfirm = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as {
        user?: { email?: string }
        email?: string
      } | null
      if (!jwtSessionForInlineConfirm) {
        return NextResponse.json(
          { success: false, error: 'Cal sessió per confirmar en el mateix desament' },
          { status: 401 }
        )
      }
    }

    /**
     * Mode `auto`: motor d'aprenentatge.
     * Llegeix mostres confirmades de `quadrantTrainingSamples` i, si hi ha
     * prou casos semblants, injecta noms preferits perque `autoAssign` els
     * tingui en compte. Sempre retornem un `learningStatus` perque la UI
     * pugui avisar si encara no hi ha prou dades.
     */
    let learningStatus: QuadrantLearningSuggestion | null = null
    if (mode === 'auto' && isQuadrantCoreDepartment(deptNorm)) {
      try {
        learningStatus = await getQuadrantLearningSuggestion({
          department: deptNorm,
          eventId: canonicalEventId,
          ln: typeof body?.ln === 'string' ? body.ln : null,
          service: typeof body?.service === 'string' ? body.service : null,
          location: typeof body?.location === 'string' ? body.location : null,
          numPax:
            typeof body?.numPax === 'number'
              ? body.numPax
              : Number.isFinite(Number(body?.numPax))
                ? Number(body.numPax)
                : null,
          startDate: typeof body?.startDate === 'string' ? body.startDate : null,
          startTime: typeof body?.startTime === 'string' ? body.startTime : null,
          phaseType: typeof body?.phaseType === 'string' ? body.phaseType : null,
        })

        if (learningStatus.hasNameSuggestions) {
          if (
            !body.preferredResponsibleName &&
            learningStatus.preferredNames.responsible
          ) {
            body.preferredResponsibleName = learningStatus.preferredNames.responsible
          }
          if (
            (!Array.isArray(body.preferredDriverNames) ||
              body.preferredDriverNames.length === 0) &&
            learningStatus.preferredNames.drivers.length > 0
          ) {
            body.preferredDriverNames = [...learningStatus.preferredNames.drivers]
          }
          if (
            (!Array.isArray(body.preferredStaffNames) ||
              body.preferredStaffNames.length === 0) &&
            learningStatus.preferredNames.staff.length > 0
          ) {
            body.preferredStaffNames = [...learningStatus.preferredNames.staff]
          }
        }
      } catch (err) {
        console.warn('[quadrants/route] learning suggestion failed', err)
        learningStatus = null
      }
    }

    const getDepartmentPeople = async () => {
      if (!cachedDepartmentPeople) {
        cachedDepartmentPeople = await loadDepartmentPersonnel(deptNorm)
      }
      return cachedDepartmentPeople
    }

    const getPremisesData = async () => {
      if (!cachedPremisesData) {
        cachedPremisesData = await loadPremises(deptNorm, await getDepartmentPeople())
      }
      return cachedPremisesData
    }

    const getSurveyPreferred = async (serviceDate: string) => {
      const key = `${canonicalEventId}__${deptNorm}__${String(serviceDate || '').slice(0, 10)}`
      if (!surveyPreferredCache.has(key)) {
        surveyPreferredCache.set(
          key,
          await getSurveyPreferredCandidates({
            eventId: canonicalEventId,
            department: deptNorm,
            serviceDate: String(serviceDate || '').slice(0, 10),
          })
        )
      }
      return surveyPreferredCache.get(key) || { yes: [], maybe: [] }
    }

    const getLedgerForDate = async (serviceDate: string) => {
      const { ws, we, ms, me } = getDateWindow(serviceDate)
      const key = `${deptNorm}__${ws}__${we}__${ms}__${me}`
      if (!ledgerCache.has(key)) {
        ledgerCache.set(
          key,
          await buildLedger(deptNorm, ws, we, ms, me, {
            includeAllDepartmentsForBusy: true,
          })
        )
      }
      return ledgerCache.get(key) as Awaited<ReturnType<typeof buildLedger>>
    }

    const assignBody =
      deptNorm === 'serveis' &&
      Array.isArray(body.groups) &&
      body.groups.length > 0
        ? {
            ...body,
            startDate: body.groups[0]?.serviceDate || body.startDate,
            endDate: body.groups[0]?.serviceDate || body.endDate,
            startTime: body.groups[0]?.startTime || body.startTime,
            endTime: body.groups[0]?.endTime || body.endTime,
          }
        : body

    const logisticaPhasesIn = Array.isArray(body.logisticaPhases)
      ? body.logisticaPhases
      : []

    const buildToSave = (
      bodyForSave: QuadrantSaveRequestBody,
      assignmentForSave: {
        responsible?: { name: string } | null
        drivers?: Array<{
          name: string
          meetingPoint?: string
          plate?: string
          vehicleType?: string
          isJamonero?: boolean
        }>
        staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
      },
      metaForSave: { needsReview?: boolean; violations?: string[]; notes?: string[] }
    ) => {
      const normalizeTimeField = (value: unknown) =>
        typeof value === 'string' ? value.trim() : ''

      const toTimetableEntry = ({
        startTime,
        endTime,
      }: { startTime?: unknown; endTime?: unknown }) => {
        const start = normalizeTimeField(startTime)
        const end = normalizeTimeField(endTime)
        return start && end ? { startTime: start, endTime: end } : null
      }

      const rawTimetables = Array.isArray(bodyForSave.timetables)
        ? bodyForSave.timetables
        : []
      const normalizedTimetables = rawTimetables
        .map((entry) => toTimetableEntry(entry as { startTime?: unknown; endTime?: unknown }))
        .filter((entry): entry is { startTime: string; endTime: string } => Boolean(entry))

      const staffRaw = (assignmentForSave.staff || []).filter((s) => s?.name)
      const externalWorkersRaw = Array.isArray(bodyForSave.externalWorkers)
        ? bodyForSave.externalWorkers.filter((s) => s?.name)
        : []
      const staffClean = staffRaw.filter((s) => s.name !== 'Extra')
      const internalWorkerLines: InternalWorkerLine[] = staffClean.map((s) => ({
        name: s.name,
        meetingPoint: s.meetingPoint || bodyForSave.meetingPoint || '',
        isJamonero: s.isJamonero === true,
      }))
      const externalWorkerLines: ExternalWorkerLine[] = externalWorkersRaw.map((worker) => ({
        name: worker.name || '',
        meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
        startDate: worker.startDate || bodyForSave.startDate || '',
        endDate: worker.endDate || bodyForSave.endDate || '',
        startTime: worker.startTime || bodyForSave.startTime || '00:00',
        endTime: worker.endTime || bodyForSave.endTime || '00:00',
        arrivalTime: worker.arrivalTime || bodyForSave.arrivalTime || null,
        isExternal: worker.isExternal === true,
      }))

      const bodyRecord = bodyForSave as Record<string, unknown>
      const toSave: QuadrantSave = {
        code: bodyForSave.code || '',
        eventId: normalizeEventId(bodyForSave.eventId),
        eventName: bodyForSave.eventName || '',
        location: bodyForSave.location || '',
        meetingPoint: bodyForSave.meetingPoint || '',
        startDate: bodyForSave.startDate || '',
        startTime: bodyForSave.startTime || '00:00',
        endDate: bodyForSave.endDate || '',
        endTime: bodyForSave.endTime || '00:00',
        arrivalTime: bodyForSave.arrivalTime || null,
        department: deptNorm,
        status: 'draft',
        numDrivers: Number(bodyForSave.numDrivers || 0),
        totalWorkers: Number(bodyForSave.totalWorkers || 0),
        numPax: bodyForSave.numPax ?? null,
        service: bodyForSave.service || null,
        ln: String(bodyRecord.ln || bodyRecord.LN || bodyRecord.lineOfBusiness || '').trim() || null,
        phaseType: bodyForSave.phaseType || (deptNorm === 'cuina' ? 'event' : null),
        phaseLabel: bodyForSave.phaseLabel || (deptNorm === 'cuina' ? 'Event' : null),
        phaseDate: bodyForSave.phaseDate || null,

        responsableName: assignmentForSave.responsible?.name || null,
        responsable: assignmentForSave.responsible
          ? { name: assignmentForSave.responsible.name, meetingPoint: bodyForSave.meetingPoint || '' }
          : null,

        conductors: (assignmentForSave.drivers || []).map((d) => ({
          name: d.name,
          meetingPoint: d.meetingPoint || bodyForSave.meetingPoint || '',
          plate: d.plate || '',
          vehicleType: d.vehicleType || '',
          isJamonero: d.isJamonero === true,
        })),

        treballadors: [...internalWorkerLines, ...externalWorkerLines],

        needsReview: !!metaForSave.needsReview,
        violations: metaForSave.violations || [],
        attentionNotes: metaForSave.notes || [],
        updatedAt: new Date().toISOString(),
        timetables: normalizedTimetables,
        vestimentModel:
          deptNorm === 'serveis'
            ? (typeof bodyForSave.vestimentModel === 'string'
                ? bodyForSave.vestimentModel.trim() || null
                : null)
            : null,
        autoProposal: {
          createdAt: new Date().toISOString(),
          generationMode: mode,
          responsibleName: assignmentForSave.responsible?.name || null,
          driverNames: (assignmentForSave.drivers || [])
            .map((d) => String(d?.name || '').trim())
            .filter((n) => Boolean(n) && n !== 'Extra'),
          staffNames: (assignmentForSave.staff || [])
            .map((s) => String(s?.name || '').trim())
            .filter((n) => Boolean(n) && n !== 'Extra'),
          needsReview: !!metaForSave.needsReview,
          violations: metaForSave.violations || [],
          notes: metaForSave.notes || [],
        },
      }

      if (!toSave.responsableName && bodyForSave.manualResponsibleName) {
        toSave.responsableName = String(bodyForSave.manualResponsibleName)
        toSave.responsable = {
          name: String(bodyForSave.manualResponsibleName),
          meetingPoint: bodyForSave.meetingPoint || '',
        }
      }

      if (Array.isArray(bodyForSave.groups)) {
        if (deptNorm === 'serveis') {
          toSave.groups = bodyForSave.groups.map((g) => ({
            wantsResponsible: g.wantsResponsible !== false,
            id: g.id || null,
            serviceDate: g.serviceDate || null,
            dateLabel: g.dateLabel || null,
            meetingPoint: g.meetingPoint || '',
            startTime: g.startTime || '',
            endTime: g.endTime || '',
            workers: Number(g.workers || 0),
            jamoneros: Number(g.jamoneros || bodyForSave.jamoneroCount || 0),
            drivers: Number(g.drivers || 0),
            needsDriver: !!g.needsDriver,
            driverId: g.driverId || null,
            driverName:
              g.driverName ||
              assignmentForSave.drivers?.find((driver, idx) =>
                idx < Math.max(1, Number(g.drivers || 0))
              )?.name ||
              null,
            ...(Array.isArray((g as { manualWorkers?: unknown })?.manualWorkers)
              ? { manualWorkers: (g as { manualWorkers?: unknown }).manualWorkers }
              : {}),
            responsibleId: g.responsibleId || null,
            responsibleName:
              (g.wantsResponsible !== false
                ? g.responsibleName ||
                  assignmentForSave.responsible?.name ||
                  g.driverName ||
                  assignmentForSave.drivers?.find((driver, idx) =>
                    idx < Math.max(1, Number(g.drivers || 0))
                  )?.name ||
                  null
                : null),
          }))
        } else {
          const normalizePerson = (value?: string | null) =>
            (value || '').toString().trim().toLowerCase()
          const remainingDrivers = [...(assignmentForSave.drivers || [])]
          let workerIdx = 0
          const usedNames = new Set<string>()
          const computedGroups = (bodyForSave.groups as CuinaGroup[]).map((group) => {
            const needsDriver = group.needsDriver ?? Number(group.drivers || 0) > 0
            const driversNeeded = needsDriver ? Math.max(1, Number(group.drivers || 0)) : 0
            const preferredDriverName = normalizePerson(group.driverName)
            const driversSlice: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }> = []

            if (driversNeeded > 0 && preferredDriverName) {
              const preferredIdx = remainingDrivers.findIndex(
                (driver) => normalizePerson(driver?.name) === preferredDriverName
              )
              if (preferredIdx >= 0) {
                const [preferred] = remainingDrivers.splice(preferredIdx, 1)
                if (preferred) driversSlice.push(preferred)
              }
            }

            while (driversSlice.length < driversNeeded && remainingDrivers.length > 0) {
              const next = remainingDrivers.shift()
              if (!next) break
              driversSlice.push(next)
            }

            const wantsResponsible = group.wantsResponsible !== false
            let responsibleName = wantsResponsible ? group.responsibleName || null : null
            if (responsibleName && usedNames.has(responsibleName.toLowerCase().trim())) {
              responsibleName = null
            }

            const workersNeeded = Math.max(
              Number(group.workers || 0) - driversNeeded,
              0
            )

            const workersSlice: Array<{ name: string; meetingPoint?: string }> = []
            while (workersSlice.length < workersNeeded) {
              const next = (assignmentForSave.staff || [])[workerIdx]
              workerIdx += 1
              if (!next) {
                workersSlice.push({ name: 'Extra' })
                continue
              }
              const normName = next.name?.toLowerCase().trim()
              if (normName && usedNames.has(normName)) continue
              workersSlice.push(next)
            }

            if (wantsResponsible && !responsibleName && deptNorm === 'cuina') {
              // A cuina prioritzem conductor com a responsable quan el grup en necessita.
              const candidateDriver = driversSlice.find((p) => p?.name && p.name !== 'Extra')
              const candidateWorker = workersSlice.find((p) => p?.name && p.name !== 'Extra')
              responsibleName = candidateDriver?.name || candidateWorker?.name || null
            }

            const groupNames = [
              responsibleName,
              ...driversSlice.map((d) => d?.name),
              ...workersSlice.map((w) => w?.name),
            ]
              .filter((name) => typeof name === 'string' && name && name !== 'Extra')
              .map((name) => (name as string).toLowerCase().trim())
            groupNames.forEach((name) => usedNames.add(name))

            return { ...group, needsDriver, drivers: driversNeeded, wantsResponsible, responsibleName }
          })

          toSave.groups = computedGroups

          if (deptNorm === 'cuina' && !toSave.responsableName) {
            const firstGroupResponsible = computedGroups.find(
              (group) => group.wantsResponsible !== false && group.responsibleName
            )
            const fallbackName =
              firstGroupResponsible?.responsibleName ||
              [...toSave.conductors, ...toSave.treballadors].find((person) => {
                if (!person?.name || person.name === 'Extra') return false
                if ('isExternal' in person && person.isExternal === true) return false
                return !String(person.name).toLowerCase().startsWith('ett')
              })?.name ||
              null

            if (fallbackName) {
              toSave.responsableName = fallbackName
              toSave.responsable = {
                name: fallbackName,
                meetingPoint:
                  firstGroupResponsible?.meetingPoint ||
                  computedGroups[0]?.meetingPoint ||
                  bodyForSave.meetingPoint ||
                  '',
              }
            }
          }

          if (deptNorm === 'cuina') {
            const responsibleNames = new Set<string>()
            const topResponsible = normalizePerson(toSave.responsableName)
            if (topResponsible) responsibleNames.add(topResponsible)
            computedGroups.forEach((group) => {
              if (group.wantsResponsible === false) return
              const groupResponsible = normalizePerson(group.responsibleName)
              if (groupResponsible) responsibleNames.add(groupResponsible)
            })

            const driverNames = new Set<string>()
            toSave.conductors = toSave.conductors.filter((driver) => {
              const normalized = normalizePerson(driver?.name)
              if (!normalized) return false
              if (driverNames.has(normalized)) return false
              driverNames.add(normalized)
              return true
            })

            const reservedNames = new Set<string>([...responsibleNames, ...driverNames])
            const uniqueWorkers: Array<{ name: string; meetingPoint: string }> = []
            const seenWorkers = new Set<string>()
            staffClean.forEach((worker) => {
              const normalized = normalizePerson(worker.name)
              if (!normalized || normalized === 'extra') return
              if (reservedNames.has(normalized)) return
              if (seenWorkers.has(normalized)) return
              seenWorkers.add(normalized)
              uniqueWorkers.push({
                name: worker.name,
                meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
              })
            })

            const targetWorkers = Math.max(
              Number(bodyForSave.totalWorkers || 0) -
                Number(bodyForSave.numDrivers || 0) -
                responsibleNames.size,
              0
            )

            while (uniqueWorkers.length < targetWorkers) {
              uniqueWorkers.push({
                name: 'Extra',
                meetingPoint: bodyForSave.meetingPoint || '',
              })
            }

            toSave.treballadors = [...uniqueWorkers, ...externalWorkerLines]
          }
        }
      }

      if (bodyForSave.cuinaGroupCount) {
        toSave.cuinaGroupCount = Number(bodyForSave.cuinaGroupCount)
      }

      toSave.totalWorkers =
        Math.max(Number(toSave.totalWorkers || 0), 0) + Number(externalWorkersRaw.length || 0)

      return { toSave }
    }

    const applyStageData = async (toSave: QuadrantSave) => {
      const baseEventId = normalizeEventId(String(body.eventId || ''))
      const stageDocId = baseEventId || canonicalEventId
      const stageData = await getStageVerdCached(stageDocId)
      const stageText = (...keys: string[]) => {
        for (const key of keys) {
          const value = stageData?.[key]
          const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
          if (text) return text
        }
        return ''
      }
      const stageNumber = (...keys: string[]) => {
        const text = stageText(...keys)
        if (!text) return null
        const parsed = Number(String(text).replace(',', '.'))
        return Number.isFinite(parsed) ? parsed : null
      }

      if (!toSave.code) {
        toSave.code = String(stageData?.code || stageData?.C_digo || '')
      }
      if (!toSave.location) {
        toSave.location = stageText('Ubicacio', 'location', 'eventLocation')
      }
      if (!toSave.service) {
        toSave.service = stageText('Servei', 'servei', 'service', 'serviceType') || null
      }
      if (!toSave.ln) {
        toSave.ln = stageText('LN', 'FincaLN', 'ln', 'lineOfBusiness') || null
      }
      if (toSave.numPax === null || toSave.numPax === undefined) {
        toSave.numPax = stageNumber('NumPax', 'numPax', 'pax')
      }
      if (baseEventId) {
        toSave.eventId = baseEventId
      }
    }

    const normalizePerson = (value?: string | null) =>
      (value || '').toString().trim().toLowerCase()

    const extractOverlapAssignmentsFromQuadrantSave = (doc: QuadrantSave) => {
      const assignments: Array<{
        id?: string | null
        name?: string | null
        startDate: string
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }> = []
      const push = (entry: {
        id?: string | null
        name?: string | null
        startDate?: string | null
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }) => {
        const id = String(entry.id || '').trim()
        const name = String(entry.name || '').trim()
        const startDate = String(entry.startDate || doc.startDate || '').trim()
        const endDate = String(entry.endDate || doc.endDate || startDate).trim()
        const startTime = String(entry.startTime || doc.startTime || '00:00').trim() || '00:00'
        const endTime = String(entry.endTime || doc.endTime || '23:59').trim() || '23:59'
        if ((!id && !name) || !startDate || !endDate) return
        assignments.push({ id: id || null, name: name || null, startDate, endDate, startTime, endTime })
      }

      push({
        name: doc.responsableName || doc.responsable?.name || null,
        startDate: doc.startDate,
        endDate: doc.endDate,
        startTime: doc.startTime,
        endTime: doc.endTime,
      })
      ;(doc.conductors || []).forEach((line) => push(line))
      ;(doc.treballadors || []).forEach((line) => push(line))
      ;(doc.groups || []).forEach((group) =>
        push({
          id: group.responsibleId || null,
          name: group.responsibleName || null,
          startDate: (group as { serviceDate?: string | null }).serviceDate || doc.startDate,
          endDate: (group as { serviceDate?: string | null }).serviceDate || doc.endDate || doc.startDate,
          startTime: group.startTime || doc.startTime,
          endTime: group.endTime || doc.endTime,
        })
      )

      return assignments
    }

    const ensureNoOverlapForQuadrantSave = async (doc: QuadrantSave, excludeDocIds: string[] = []) => {
      const conflicts = await findQuadrantOverlapConflicts({
        assignments: extractOverlapAssignmentsFromQuadrantSave(doc),
        excludeEventId: String(doc.eventId || '').trim(),
        excludeDocIds,
      })
      if (conflicts.length === 0) return

      const first = conflicts[0]
      const message = `Solapament de personal no permès: ${first.personLabel} ja està assignat a ${first.source.eventId || first.source.docId} (${first.busy.startDate} ${first.busy.startTime}-${first.busy.endTime}).`
      const error = new Error(message)
      ;(error as Error & { status?: number; conflicts?: unknown }).status = 409
      ;(error as Error & { status?: number; conflicts?: unknown }).conflicts = conflicts
      throw error
    }

    let phaseRequests: PhaseRequest[] = []
    const createdDocIds: string[] = []
    /** Snapshot del darrer `toSave` per docId; evita un `get()` de Firestore abans de confirmar inline. */
    const savedDraftSnapshotByDocId = new Map<string, QuadrantSave>()
    let confirmInlineApplied = false
    let remainingServiceJamoneroAssignments: JamoneroAssignmentNormalized[] = Array.isArray(
      body.serviceJamoneroAssignments
    )
      ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
      : []
    let remainingServiceEventGroups = 0

    const normalizedBodyJamForFirestoreBatch = Array.isArray(body.serviceJamoneroAssignments)
      ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
      : []
    /** Amb slots jamonero auto cal mantenir escritures per fase (ordre in-memory dels jameners). */
    const jamAssignmentsAllowServeisFirestoreBatch =
      normalizedBodyJamForFirestoreBatch.length === 0 ||
      !normalizedBodyJamForFirestoreBatch.some((j) => j.mode === 'auto')

    const consumeServiceJamoneros = (
      assignment: {
        responsible?: { name: string } | null
        drivers?: Array<{ name?: string; isJamonero?: boolean }>
        staff?: Array<{ name?: string; isJamonero?: boolean }>
      }
    ) => {
      if (!remainingServiceJamoneroAssignments.length) return

      const usedNames = [
        ...(assignment.drivers || [])
          .filter((person) => person?.isJamonero === true && person.name && person.name !== assignment.responsible?.name)
          .map((person) => String(person.name)),
        ...(assignment.staff || [])
          .filter((person) => person?.isJamonero === true && person.name)
          .map((person) => String(person.name)),
      ]

      if (!usedNames.length) return

      const normalizedUsed = usedNames.map((name) => normalizePerson(name))
      const matchedManualIds = new Set<string>()
      normalizedUsed.forEach((usedName) => {
        const manual = remainingServiceJamoneroAssignments.find(
          (assignment) =>
            assignment.mode === 'manual' &&
            assignment.personnelName &&
            normalizePerson(assignment.personnelName) === usedName
        )
        if (manual) matchedManualIds.add(manual.id)
      })

      let remainingAutoToConsume = Math.max(normalizedUsed.length - matchedManualIds.size, 0)
      remainingServiceJamoneroAssignments = remainingServiceJamoneroAssignments.filter((assignment) => {
        if (matchedManualIds.has(assignment.id)) return false
        if (assignment.mode === 'auto' && remainingAutoToConsume > 0) {
          remainingAutoToConsume -= 1
          return false
        }
        return true
      })
    }

    if (deptNorm === 'logistica' && logisticaPhasesIn.length > 0) {
      let phaseIndex = 0
      for (const p of logisticaPhasesIn) {
        phaseIndex += 1
        const rawLabel = (p.label || p.key || '').toString().trim()
        const label = rawLabel || `Fase ${phaseIndex}`
        const phaseType = norm(label)
        phaseRequests.push({
          label,
          phaseType,
          date: p.date || body.startDate,
          endDate: p.endDate || p.date || body.endDate,
          startTime: p.startTime || body.startTime,
          endTime: p.endTime || body.endTime,
          totalWorkers: Number(p.totalWorkers || 0),
          numDrivers: Number(p.numDrivers || 0),
          wantsResp: !!p.wantsResp,
          responsableId: p.responsableId || null,
          meetingPoint: p.meetingPoint || body.meetingPoint || '',
          vehicles: Array.isArray(p.vehicles) ? p.vehicles : [],
          ...(Array.isArray((p as { manualWorkers?: unknown }).manualWorkers) &&
          ((p as { manualWorkers: unknown[] }).manualWorkers ?? []).length > 0
            ? { manualWorkers: (p as { manualWorkers: unknown[] }).manualWorkers }
            : {}),
        })
      }
    } else if (deptNorm === 'serveis' && Array.isArray(body.groups) && body.groups.length > 0) {
      const eventDate = body.startDate
      const serviceAssignments: JamoneroAssignmentNormalized[] = Array.isArray(body.serviceJamoneroAssignments)
        ? (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(normalizeJamoneroAssignment)
        : []
      const manualServiceJamonero = serviceAssignments.find(
        (assignment) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
      )
      const hasAutoServiceJamonero = serviceAssignments.some((assignment) => assignment?.mode !== 'manual')
      /** Mode manual: no es resolen jameners “auto” ni es fan splits per equip (estalvia premises + recorreguts). */
      const effectiveHasAutoServiceJamonero = hasAutoServiceJamonero && mode !== 'manual'
      const departmentPeople =
        manualServiceJamonero || effectiveHasAutoServiceJamonero ? await getDepartmentPeople() : []
      const premisesData =
        manualServiceJamonero || effectiveHasAutoServiceJamonero
          ? await getPremisesData()
          : { premises: { driverCrews: [] as DriverCrewPremise[] } }
      const driverCrews = Array.isArray(premisesData?.premises?.driverCrews)
        ? premisesData.premises.driverCrews
        : []
      const findPerson = (ref?: { id?: string | null; name?: string | null }) =>
        departmentPeople.find((person) => {
          if (ref?.id && person.id === ref.id) return true
          if (ref?.name && norm(person.name) === norm(ref.name)) return true
          return false
        }) || null
      const findCrewByDriver = (ref?: { id?: string | null; name?: string | null }) =>
        driverCrews.find((crew) => {
          const driver = findPerson({ id: crew.driverId, name: crew.driverName })
          if (!driver) return false
          if (ref?.id && driver.id === ref.id) return true
          if (ref?.name && norm(driver.name) === norm(ref.name)) return true
          return false
        }) || null
      const findCrewByCompanion = (ref?: { id?: string | null; name?: string | null }) =>
        driverCrews.find((crew) =>
          crew.companions.some((companion) => {
            const companionPerson = findPerson({ id: companion.id, name: companion.name })
            if (!companionPerson) return false
            if (ref?.id && companionPerson.id === ref.id) return true
            if (ref?.name && norm(companionPerson.name) === norm(ref.name)) return true
            return false
          })
        ) || null
      const crewContainsPerson = (crew: DriverCrewPremise | null, person: { id?: string | null; name?: string | null } | null) => {
        if (!crew || !person) return false
        const driver = findPerson({ id: crew.driverId, name: crew.driverName })
        if (driver) {
          if (person.id && driver.id === person.id) return true
          if (person.name && norm(driver.name) === norm(person.name)) return true
        }
        return crew.companions.some((companion) => {
          const companionPerson = findPerson({ id: companion.id, name: companion.name })
          if (!companionPerson) return false
          if (person.id && companionPerson.id === person.id) return true
          if (person.name && norm(companionPerson.name) === norm(person.name)) return true
          return false
        })
      }
      const existingGroupMatchesCrew = (
        groups: ServeisGroupInput[],
        currentIndex: number,
        driverId?: string | null,
        serviceDate?: string
      ) =>
        groups.some((candidate, candidateIndex) => {
          if (candidateIndex === currentIndex) return false
          const candidateDate = candidate?.serviceDate || body.startDate
          if (serviceDate && candidateDate !== serviceDate) return false
          const candidateLabel =
            (candidate?.dateLabel || '').toString().trim() ||
            (candidateDate === eventDate ? 'Event' : 'Muntatge')
          if (norm(candidateLabel) !== 'event') return false
          return Boolean(driverId) && String(candidate?.driverId || '').trim() === String(driverId || '').trim()
        })
      const existingEventGroupsCount = body.groups.filter((candidate) => {
        const candidateDate = candidate?.serviceDate || body.startDate
        if (candidateDate !== eventDate) return false
        const candidateLabel =
          (candidate?.dateLabel || '').toString().trim() ||
          (candidateDate === eventDate ? 'Event' : 'Muntatge')
        return norm(candidateLabel) === 'event'
      }).length
      const canAutoCreateExtraEventGroup =
        existingEventGroupsCount <= 1 && Array.isArray(body.groups) && body.groups.length === 1

      body.groups.forEach((g, groupIndex: number) => {
        const serviceDate = g.serviceDate || body.startDate
        const label =
          (g.dateLabel || '').toString().trim() ||
          (serviceDate === eventDate ? 'Event' : 'Muntatge')
        const wantsResp =
          typeof g.wantsResponsible === 'boolean'
            ? g.wantsResponsible
            : body.skipResponsible
            ? false
            : true
        const isPrimaryResponsibleEventGroup =
          groupIndex === 0 &&
          serviceDate === eventDate &&
          Boolean(body.manualResponsibleId)
        const responsableId =
          wantsResp && (g.responsibleId || (isPrimaryResponsibleEventGroup ? body.manualResponsibleId : null))
            ? g.responsibleId || (isPrimaryResponsibleEventGroup ? body.manualResponsibleId : null)
            : null

        const responsiblePerson =
          isPrimaryResponsibleEventGroup
            ? findPerson({ id: body.manualResponsibleId })
            : null
        const jamoneroPerson =
          groupIndex === 0 && serviceDate === eventDate && manualServiceJamonero
            ? findPerson({
                id: manualServiceJamonero.personnelId || null,
                name: manualServiceJamonero.personnelName || null,
              })
            : null
        const responsibleCrew = responsiblePerson
          ? responsiblePerson.isDriver
            ? findCrewByDriver({ id: responsiblePerson.id, name: responsiblePerson.name })
            : findCrewByCompanion({ id: responsiblePerson.id, name: responsiblePerson.name })
          : null
        const jamoneroCrew = jamoneroPerson
          ? jamoneroPerson.isDriver
            ? findCrewByDriver({ id: jamoneroPerson.id, name: jamoneroPerson.name })
            : findCrewByCompanion({ id: jamoneroPerson.id, name: jamoneroPerson.name })
          : null
        // 1) Preferir jamonero dins del mateix equip que el responsable/conductor (mateix cotxe).
        // 2) Si no n’hi ha, cercar jamonero d’un altre equip (només es parteix en 2 fases si no és «compacte»).
        let autoJamoneroPerson: (typeof departmentPeople)[number] | null = null
        if (
          !jamoneroPerson &&
          groupIndex === 0 &&
          serviceDate === eventDate &&
          responsibleCrew &&
          effectiveHasAutoServiceJamonero
        ) {
          const inResponsibleCrew = departmentPeople.find((person) => {
            if (person.isJamonero !== true) return false
            if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
            if (!crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
            const crewDriver = findPerson({
              id: responsibleCrew.driverId,
              name: responsibleCrew.driverName,
            })
            if (
              crewDriver &&
              responsiblePerson &&
              person.isDriver &&
              person.id === responsiblePerson.id
            ) {
              return false
            }
            return true
          })
          const fromOtherCrew =
            !inResponsibleCrew &&
            departmentPeople.find((person) => {
              if (person.isJamonero !== true) return false
              if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
              const personCrew = person.isDriver
                ? findCrewByDriver({ id: person.id, name: person.name })
                : findCrewByCompanion({ id: person.id, name: person.name })
              if (!personCrew) return false
              if (personCrew.id === responsibleCrew.id) return false
              if (crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
              return true
            })
          autoJamoneroPerson = inResponsibleCrew || fromOtherCrew || null
        }
        const autoJamoneroCrew = autoJamoneroPerson
          ? autoJamoneroPerson.isDriver
            ? findCrewByDriver({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
            : findCrewByCompanion({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
          : null
        // Esdeveniments petits (treballadors + conductors demanats < 5): un sol vehicle amb el conductor principal.
        const serveisCompactHeadcount =
          Number(g.workers || 0) + Number(g.drivers || 0)
        const compactServeisSingleVehicle = serveisCompactHeadcount < 5

        const splitForManualJamonero =
          !compactServeisSingleVehicle &&
          label.toLowerCase() === 'event' &&
          canAutoCreateExtraEventGroup &&
          groupIndex === 0 &&
          jamoneroPerson &&
          responsibleCrew &&
          jamoneroCrew &&
          jamoneroCrew.id !== responsibleCrew.id &&
          !existingGroupMatchesCrew(body.groups, groupIndex, jamoneroCrew.driverId, serviceDate)
        const splitForAutoJamonero =
          !compactServeisSingleVehicle &&
          label.toLowerCase() === 'event' &&
          canAutoCreateExtraEventGroup &&
          groupIndex === 0 &&
          !manualServiceJamonero &&
          autoJamoneroPerson &&
          responsibleCrew &&
          autoJamoneroCrew &&
          autoJamoneroCrew.id !== responsibleCrew.id &&
          !existingGroupMatchesCrew(body.groups, groupIndex, autoJamoneroCrew.driverId, serviceDate)

        if (splitForManualJamonero || splitForAutoJamonero) {
          const selectedJamoneroPerson = jamoneroPerson || autoJamoneroPerson
          const selectedJamoneroCrew = jamoneroCrew || autoJamoneroCrew
          const selectedJamoneroAssignment: JamoneroAssignmentNormalized | null = jamoneroPerson
            ? manualServiceJamonero || null
            : autoJamoneroPerson
            ? {
                id: `auto-jamonero-${autoJamoneroPerson.id}`,
                mode: 'manual' as const,
                personnelId: autoJamoneroPerson.id,
                personnelName: autoJamoneroPerson.name,
              }
            : null

          if (!selectedJamoneroPerson || !selectedJamoneroCrew || !selectedJamoneroAssignment) {
            return
          }

          const secondGroupWorkers = selectedJamoneroPerson.isDriver ? 1 : 2
          const firstGroupWorkers = Math.max(Number(g.workers || 0) - secondGroupWorkers, 0)
          const secondGroupDriver = selectedJamoneroPerson.isDriver
            ? selectedJamoneroPerson
            : findPerson({ id: selectedJamoneroCrew?.driverId, name: selectedJamoneroCrew?.driverName })

          phaseRequests.push({
            groupId: `${g.id || 'group'}__g1`,
            label,
            phaseType: norm(label),
            date: serviceDate,
            endDate: serviceDate,
            startTime: g.startTime || body.startTime,
            endTime: g.endTime || body.endTime,
            totalWorkers: firstGroupWorkers,
            jamoneroCount: 0,
            numDrivers: 1,
            wantsResp: true,
            responsableId: body.manualResponsibleId,
            manualDriverId:
              responsiblePerson?.isDriver
                ? responsiblePerson.id
                : responsibleCrew?.driverId || null,
            meetingPoint: g.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...g,
                id: `${g.id || 'group'}__g1`,
                workers: firstGroupWorkers,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: true,
                responsibleId: body.manualResponsibleId,
                driverId:
                  responsiblePerson?.isDriver
                    ? responsiblePerson.id
                    : responsibleCrew?.driverId || '',
              },
            ],
            serviceJamoneroAssignmentsOverride: [],
          })

          phaseRequests.push({
            groupId: `${g.id || 'group'}__g2`,
            label,
            phaseType: norm(label),
            date: serviceDate,
            endDate: serviceDate,
            startTime: g.startTime || body.startTime,
            endTime: g.endTime || body.endTime,
            totalWorkers: secondGroupWorkers,
            jamoneroCount: 1,
            numDrivers: 1,
            wantsResp: false,
            responsableId: null,
            manualDriverId: secondGroupDriver?.id || null,
            meetingPoint: g.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...g,
                id: `${g.id || 'group'}__g2`,
                workers: secondGroupWorkers,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: false,
                responsibleId: '',
                driverId: secondGroupDriver?.id || '',
              },
            ],
            serviceJamoneroAssignmentsOverride: [selectedJamoneroAssignment],
          })
          remainingServiceEventGroups += 2
          return
        }

        phaseRequests.push({
          groupId: g.id || null,
          label,
          phaseType: norm(label),
          date: serviceDate,
          endDate: serviceDate,
          startTime: g.startTime || body.startTime,
          endTime: g.endTime || body.endTime,
          totalWorkers: Number(g.workers || 0),
          jamoneroCount: 0,
          numDrivers: Number(g.drivers || 0),
          wantsResp,
          responsableId,
          manualDriverId: g.driverId || null,
          meetingPoint: g.meetingPoint || body.meetingPoint || '',
          groupsOverride: [g],
        })
        if (norm(label) === 'event') remainingServiceEventGroups += 1
      })

      if (existingEventGroupsCount > 1 && serviceAssignments.length > 0 && mode !== 'manual') {
        let remainingManualAssignments = serviceAssignments.filter(
          (assignment) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
        )
        let remainingAutoAssignments = serviceAssignments.filter((assignment) => assignment?.mode !== 'manual')

        const crewForPhase = (phase: PhaseRequest) => {
          const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
          if (!group) return null
          const driverId = String(group.driverId || phase.manualDriverId || '').trim()
          if (driverId) return findCrewByDriver({ id: driverId })
          if (
            phase.phaseType === 'event' &&
            body.manualResponsibleId &&
            (!phase.responsableId || String(phase.responsableId).trim() === '') &&
            group?.id === body.groups?.[0]?.id
          ) {
            const topResponsible = findPerson({ id: body.manualResponsibleId })
            if (!topResponsible) return null
            return topResponsible.isDriver
              ? findCrewByDriver({ id: topResponsible.id, name: topResponsible.name })
              : findCrewByCompanion({ id: topResponsible.id, name: topResponsible.name })
          }
          if (phase.responsableId) {
            const responsible = findPerson({ id: phase.responsableId })
            if (!responsible) return null
            return responsible.isDriver
              ? findCrewByDriver({ id: responsible.id, name: responsible.name })
              : findCrewByCompanion({ id: responsible.id, name: responsible.name })
          }
          return null
        }

        const assignmentMatchesCrew = (
          assignment: JamoneroAssignmentNormalized,
          crew: DriverCrewPremise | null
        ) => {
          if (!assignment || !crew) return false
          const person = findPerson({
            id: assignment.personnelId || null,
            name: assignment.personnelName || null,
          })
          if (!person) return false
          if (person.isDriver) return false
          return crewContainsPerson(crew, { id: person.id, name: person.name })
        }

        const phaseAlreadyRepresentsPerson = (assignment: JamoneroAssignmentNormalized) => {
          const person = findPerson({
            id: assignment?.personnelId || null,
            name: assignment?.personnelName || null,
          })
          if (!person) return false

          return phaseRequests.some((phase) => {
            if (phase.phaseType !== 'event') return false
            const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
            const driverId = String(group?.driverId || phase.manualDriverId || '').trim()
            if (driverId && person.id && driverId === String(person.id)) return true
            const crew = crewForPhase(phase)
            return crewContainsPerson(crew, { id: person.id, name: person.name })
          })
        }

        const createExtraDriverPhase = (assignment: JamoneroAssignmentNormalized) => {
          const person = findPerson({
            id: assignment?.personnelId || null,
            name: assignment?.personnelName || null,
          })
          if (!person?.isDriver) return false

          const donorCandidates = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .filter(({ phase }) => Number(phase.totalWorkers || 0) > 1)
            .sort((a, b) => {
              const aIsResponsibleGroup = Boolean(String(a.phase.responsableId || '').trim())
              const bIsResponsibleGroup = Boolean(String(b.phase.responsableId || '').trim())
              if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? 1 : -1
              return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
            })

          const donor = donorCandidates[0]
          if (!donor) return false

          const donorGroup = Array.isArray(donor.phase.groupsOverride) ? donor.phase.groupsOverride[0] : null
          if (!donorGroup) return false

          const nextWorkers = Math.max(Number(donor.phase.totalWorkers || 0) - 1, 1)
          phaseRequests[donor.index] = {
            ...donor.phase,
            totalWorkers: nextWorkers,
            groupsOverride: [
              {
                ...donorGroup,
                workers: nextWorkers,
              },
            ],
          }

          const baseId = String(donor.phase.groupId || donorGroup.id || 'group')
          phaseRequests.push({
            groupId: `${baseId}__extra_${String(person.id || 'driver')}`,
            label: donor.phase.label,
            phaseType: donor.phase.phaseType,
            date: donor.phase.date,
            endDate: donor.phase.endDate,
            startTime: donor.phase.startTime,
            endTime: donor.phase.endTime,
            totalWorkers: 1,
            jamoneroCount: 1,
            numDrivers: 1,
            wantsResp: false,
            responsableId: null,
            manualDriverId: person.id,
            meetingPoint: donor.phase.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...donorGroup,
                id: `${baseId}__extra_${String(person.id || 'driver')}`,
                workers: 1,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: false,
                responsibleId: '',
                driverId: person.id,
              },
            ],
            serviceJamoneroAssignmentsOverride: [assignment],
          })
          remainingServiceEventGroups += 1
          return true
        }

        const driverManualAssignments = remainingManualAssignments.filter((assignment) =>
          Boolean(
              findPerson({
                id: assignment?.personnelId || null,
                name: assignment?.personnelName || null,
              })?.isDriver
            )
          ).filter((assignment) => !phaseAlreadyRepresentsPerson(assignment))
        driverManualAssignments.forEach((assignment) => {
          if (createExtraDriverPhase(assignment)) {
            remainingManualAssignments = remainingManualAssignments.filter((candidate) => candidate !== assignment)
          }
        })

        phaseRequests = phaseRequests.map((phase) => {
          if (phase.phaseType !== 'event') return phase
          const crew = crewForPhase(phase)
          const currentOverrides = Array.isArray(phase.serviceJamoneroAssignmentsOverride)
            ? phase.serviceJamoneroAssignmentsOverride
            : []

          const matchedManual = remainingManualAssignments.find((assignment) =>
            assignmentMatchesCrew(assignment, crew)
          )
          if (matchedManual) {
            remainingManualAssignments = remainingManualAssignments.filter(
              (assignment) => assignment !== matchedManual
            )
            return {
              ...phase,
              serviceJamoneroAssignmentsOverride: [...currentOverrides, matchedManual],
            }
          }

          return {
            ...phase,
            serviceJamoneroAssignmentsOverride: currentOverrides,
          }
        })

        if (remainingManualAssignments.length > 0) {
          const eventPhaseIndexes = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .sort((a, b) => {
              const aHasDriver = Boolean(String(a.phase.manualDriverId || a.phase.groupsOverride?.[0]?.driverId || '').trim())
              const bHasDriver = Boolean(String(b.phase.manualDriverId || b.phase.groupsOverride?.[0]?.driverId || '').trim())
              if (aHasDriver !== bHasDriver) return aHasDriver ? -1 : 1
              const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
                ? a.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
                ? b.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              return aOverrides - bOverrides
            })

          remainingManualAssignments.forEach((assignment, idx) => {
            const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
            if (!target) return
            const targetPhase = phaseRequests[target.index]
            const current: JamoneroAssignmentNormalized[] = Array.isArray(
              targetPhase?.serviceJamoneroAssignmentsOverride
            )
              ? targetPhase.serviceJamoneroAssignmentsOverride
              : []
            phaseRequests[target.index] = {
              ...targetPhase,
              serviceJamoneroAssignmentsOverride: [...current, assignment],
            }
          })
          remainingManualAssignments = []
        }

        if (remainingAutoAssignments.length > 0) {
          const eventPhaseIndexes = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .sort((a, b) => {
              const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
                ? a.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
                ? b.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              if (aOverrides !== bOverrides) return aOverrides - bOverrides
              return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
            })

          remainingAutoAssignments.forEach((assignment, idx) => {
            const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
            if (!target) return
            const targetPhase = phaseRequests[target.index]
            const current: JamoneroAssignmentNormalized[] = Array.isArray(
              targetPhase?.serviceJamoneroAssignmentsOverride
            )
              ? targetPhase.serviceJamoneroAssignmentsOverride
              : []
            phaseRequests[target.index] = {
              ...targetPhase,
              serviceJamoneroAssignmentsOverride: [...current, assignment],
            }
          })
          remainingAutoAssignments = []
        }
      }
    }

    const writePhaseDoc = async (
      phase: PhaseRequest,
      blockedNames: string[] = [],
      phaseFirestoreQueue?: Array<{ docId: string; toSave: QuadrantSave }>
    ) => {
      const isPrimaryResponsibleEventGroup =
        deptNorm === 'serveis' &&
        phase.phaseType === 'event' &&
        Boolean(body.manualResponsibleId) &&
        String(phase.groupId || phase.groupsOverride?.[0]?.id || '') ===
          String(body.groups?.[0]?.id || '')
      const phaseServiceJamoneros =
        deptNorm === 'serveis' && phase.phaseType === 'event'
          ? Array.isArray(phase.serviceJamoneroAssignmentsOverride)
            ? phase.serviceJamoneroAssignmentsOverride
            : Array.isArray(phase.partitionedServiceJamoneros)
              ? phase.partitionedServiceJamoneros
              : remainingServiceJamoneroAssignments.slice(
                  0,
                  Math.max(
                    remainingServiceJamoneroAssignments.length -
                      Math.max(remainingServiceEventGroups - 1, 0),
                    remainingServiceJamoneroAssignments.length > 0 ? 1 : 0
                  )
                )
          : []
      const phaseNumDrivers =
        deptNorm === 'serveis' && phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
          ? Math.max(Number(phase.numDrivers || 0), 1)
          : Number(phase.numDrivers || 0)
      const phaseGroupsOverride =
        deptNorm === 'serveis' && Array.isArray(phase.groupsOverride)
          ? phase.groupsOverride.map((group) => ({
              ...group,
              drivers:
                phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                  ? Math.max(Number(group.drivers || 0), 1)
                  : Number(group.drivers || 0),
              needsDriver:
                phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                  ? true
                  : !!group.needsDriver,
            }))
          : phase.groupsOverride
      const phaseTimetables = Array.isArray(phase.timetables)
        ? phase.timetables
        : body.timetables
      const phaseBody = {
        ...body,
        startDate: phase.date || body.startDate,
        endDate: phase.endDate || phase.date || body.endDate,
        startTime: phase.startTime || body.startTime,
        endTime: phase.endTime || body.endTime,
        meetingPoint: phase.meetingPoint || body.meetingPoint || '',
        totalWorkers: Number(phase.totalWorkers || 0),
        jamoneroCount:
          deptNorm === 'serveis' && phase.phaseType === 'event'
            ? phaseServiceJamoneros.length
            : Number(phase.jamoneroCount || 0),
        numDrivers: phaseNumDrivers,
        manualResponsibleId: isPrimaryResponsibleEventGroup
          ? body.manualResponsibleId
          : phase.wantsResp
          ? phase.responsableId || null
          : null,
        manualDriverId: phase.manualDriverId || null,
        skipResponsible: isPrimaryResponsibleEventGroup ? false : phase.wantsResp === false,
        vehicles: Array.isArray(phase.vehicles) ? phase.vehicles : [],
        blockedNames,
        groups: phaseGroupsOverride || body.groups,
        phaseType: phase.phaseType || null,
        phaseLabel: phase.label || null,
        phaseDate: phase.date || null,
        timetables: phaseTimetables,
        serviceJamoneroAssignments: phaseServiceJamoneros,
        manualWorkers:
          Array.isArray((phase as { manualWorkers?: unknown[] }).manualWorkers) &&
          ((phase as { manualWorkers: unknown[] }).manualWorkers ?? []).length > 0
            ? (phase as { manualWorkers: unknown[] }).manualWorkers
            : undefined,
      }
      /** Manual Serveis / Logística: sense autoAssign, ledger ni enriquiments de quota per fase. */
      const phaseManualServeis = mode === 'manual' && deptNorm === 'serveis'
      const phaseManualLogistica = mode === 'manual' && deptNorm === 'logistica'
      const phaseSkipHeavyPipeline = phaseManualServeis || phaseManualLogistica

      let phaseAssignBody: Record<string, unknown>
      if (phaseSkipHeavyPipeline) {
        phaseAssignBody = {
          ...phaseBody,
          preferredStaffNames: Array.isArray(phaseBody.preferredStaffNames)
            ? (phaseBody.preferredStaffNames as string[])
            : [],
          preferredDriverNames: Array.isArray(phaseBody.preferredDriverNames)
            ? (phaseBody.preferredDriverNames as string[])
            : [],
          preferredResponsibleName:
            typeof phaseBody.preferredResponsibleName === 'string'
              ? phaseBody.preferredResponsibleName
              : null,
        }
      } else {
        const phaseSurveyPreferred = await getSurveyPreferred(
          String(phase.date || body.startDate || '').slice(0, 10)
        )
        phaseAssignBody = (await enrichWithSurveyPreferences(
          phaseBody,
          deptNorm,
          phaseSurveyPreferred
        )) as Record<string, unknown>
      }
      const departmentPeople = await getDepartmentPeople()
      const groupsForManual = Array.isArray(phaseAssignBody.groups)
        ? (phaseAssignBody.groups as ServeisGroupInput[])
        : []

      type PhaseAssignResult = {
        assignment: {
          responsible?: { name: string } | null
          drivers?: Array<{
            name: string
            meetingPoint?: string
            plate?: string
            vehicleType?: string
            isJamonero?: boolean
          }>
          staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
        }
        meta: {
          needsReview?: boolean
          violations?: string[]
          notes?: string[]
        }
      }

      let res: PhaseAssignResult
      if (phaseManualServeis) {
        const built = buildServeisManualAssignmentOnly(
          phaseAssignBody,
          departmentPeople as DepartmentPersonLite[],
          phaseServiceJamoneros
        )
        res = built
      } else if (phaseManualLogistica) {
        const built = buildLogisticaManualAssignmentOnly(
          phaseAssignBody,
          departmentPeople as DepartmentPersonLite[]
        )
        res = built
      } else {
        const premisesData = await getPremisesData()
        const ledger = await getLedgerForDate(String(phase.date || body.startDate || '').slice(0, 10))
        const phaseKeyForBusy = norm(phase.label || phase.phaseType || 'fase')
        const phaseDateForBusy = String(phase.date || body.startDate)
        const groupKeyForBusy = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '')
        const phaseDocIdForBusy = `${canonicalEventId}__${phaseKeyForBusy}__${phaseDateForBusy}__${
          groupKeyForBusy || 'group'
        }`
        type AutoAssignPayload = Parameters<typeof autoAssign>[0]
        res = (await autoAssign({
          ...(phaseAssignBody as unknown as AutoAssignPayload),
          departmentPeople,
          premises: premisesData?.premises,
          premisesWarnings: premisesData?.warnings || [],
          ledger,
          ignoreBusyQuadrantDocIds: [phaseDocIdForBusy],
        })) as PhaseAssignResult
      }

      if (mode === 'manual' && deptNorm === 'serveis' && !phaseManualServeis) {
        const meetingForStaff = String(phaseAssignBody.meetingPoint || body.meetingPoint || '')
        res = {
          ...res,
          assignment: applyManualServeisStaffPolicy(
            res.assignment,
            groupsForManual,
            departmentPeople as DepartmentPersonLite[],
            phaseServiceJamoneros,
            meetingForStaff
          ),
        }
      }
      if (deptNorm === 'serveis' && phase.phaseType === 'event') {
        consumeServiceJamoneros(res.assignment)
        remainingServiceEventGroups = Math.max(remainingServiceEventGroups - 1, 0)
      }
      const { toSave } = buildToSave(
        phaseAssignBody as unknown as QuadrantSaveRequestBody,
        res.assignment,
        res.meta
      )
      await applyStageData(toSave)
      const phaseKey = norm(phase.label || phase.phaseType || 'fase')
      const phaseDate = String(phase.date || body.startDate)
      const groupKey = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
      const docId = `${canonicalEventId}__${phaseKey}__${phaseDate}__${groupKey || 'group'}`
      await ensureNoOverlapForQuadrantSave(toSave, [docId])
      savedDraftSnapshotByDocId.set(docId, toSave)
      if (phaseFirestoreQueue && phaseSkipHeavyPipeline) {
        phaseFirestoreQueue.push({ docId, toSave })
      } else {
        await db.collection(collectionName).doc(docId).set(toSave, { merge: true })
      }
      createdDocIds.push(docId)
      return res
    }

    if (phaseRequests.length > 0) {
      type PreferredPhaseResult = {
        assignment: {
          responsible: { name: string } | null
          drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
          staff: Array<{ name: string; meetingPoint?: string }>
        }
        meta: {
          needsReview: boolean
          violations: string[]
          notes: string[]
        }
      }

      const emptyPreferredResult: PreferredPhaseResult = {
        assignment: {
          responsible: null,
          drivers: [],
          staff: [],
        },
        meta: {
          needsReview: false,
          violations: [],
          notes: [],
        },
      }

      const blockedNamesInBatch = new Set<string>()
      let preferredResult = emptyPreferredResult
      let hasPreferredResult = false
      const orderedPhaseRequests =
        deptNorm === 'serveis'
          ? [
              ...phaseRequests
                .filter((phase) => phase.phaseType === 'event')
                .sort((a, b) => {
                  const aIsResponsibleGroup =
                    Boolean(String(a.responsableId || '').trim()) ||
                    (Boolean(body.manualResponsibleId) &&
                      String(a.groupId || a.groupsOverride?.[0]?.id || '') ===
                        String(body.groups?.[0]?.id || ''))
                  const bIsResponsibleGroup =
                    Boolean(String(b.responsableId || '').trim()) ||
                    (Boolean(body.manualResponsibleId) &&
                      String(b.groupId || b.groupsOverride?.[0]?.id || '') ===
                        String(body.groups?.[0]?.id || ''))
                  if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? -1 : 1

                  const aHasManualDriver = Boolean(String(a.manualDriverId || '').trim())
                  const bHasManualDriver = Boolean(String(b.manualDriverId || '').trim())
                  if (aHasManualDriver !== bHasManualDriver) return aHasManualDriver ? -1 : 1
                  return 0
                }),
              ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
            ]
          : deptNorm === 'logistica'
          ? [
              ...phaseRequests.filter((phase) => phase.phaseType === 'event'),
              ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
            ]
          : phaseRequests

      if (deptNorm === 'serveis' && orderedPhaseRequests.length > 0) {
        const serveisEventPhasesInOrder = orderedPhaseRequests.filter((p) => p.phaseType === 'event')
        if (
          serveisEventPhasesInOrder.length > 0 &&
          Array.isArray(body.serviceJamoneroAssignments) &&
          body.serviceJamoneroAssignments.length > 0
        ) {
          const normalizedServeisJamoneros = (body.serviceJamoneroAssignments as JamoneroAssignmentRaw[]).map(
            normalizeJamoneroAssignment
          )
          const jamoneroChunks = partitionAssignmentsAcrossPhases(
            normalizedServeisJamoneros,
            serveisEventPhasesInOrder.length
          )
          serveisEventPhasesInOrder.forEach((phase, idx) => {
            phase.partitionedServiceJamoneros = jamoneroChunks[idx] || []
          })
        }
      }

      const manualPhasesFirestoreQueue =
        mode === 'manual' &&
        (deptNorm === 'logistica' ||
          (deptNorm === 'serveis' && jamAssignmentsAllowServeisFirestoreBatch))
          ? ([] as Array<{ docId: string; toSave: QuadrantSave }>)
          : undefined

      if (mode === 'manual' && (deptNorm === 'serveis' || deptNorm === 'logistica')) {
        /** Personal + stage_verd en paral·lel: warmup abans del bucle de fases (menys espera seqüencial). */
        await Promise.all([getDepartmentPeople(), getStageVerdCached(canonicalEventId)])
      }

      const manualLogParallel =
        mode === 'manual' && deptNorm === 'logistica' && Boolean(manualPhasesFirestoreQueue)

      const applyPhaseWriteResult = (phase: PhaseRequest, result: Awaited<ReturnType<typeof writePhaseDoc>>) => {
        const normalizedResult: PreferredPhaseResult = {
          assignment: {
            responsible: result.assignment?.responsible || null,
            drivers: Array.isArray(result.assignment?.drivers)
              ? result.assignment.drivers.map((driver) => ({
                  name: driver.name,
                  meetingPoint: driver.meetingPoint,
                  plate: driver.plate,
                  vehicleType: driver.vehicleType,
                }))
              : [],
            staff: Array.isArray(result.assignment?.staff)
              ? result.assignment.staff.map((person) => ({
                  name: person.name,
                  meetingPoint: person.meetingPoint,
                }))
              : [],
          },
          meta: {
            needsReview: Boolean(result.meta?.needsReview),
            violations: Array.isArray(result.meta?.violations) ? result.meta.violations : [],
            notes: Array.isArray(result.meta?.notes) ? result.meta.notes : [],
          },
        }
        if (!hasPreferredResult && phase.phaseType === 'event') {
          preferredResult = normalizedResult
          hasPreferredResult = true
        }
        if (!hasPreferredResult) {
          preferredResult = normalizedResult
          hasPreferredResult = true
        }
        const assignedNames = [
          result?.assignment?.responsible?.name || null,
          ...(Array.isArray(result?.assignment?.drivers)
            ? result.assignment.drivers.map((driver) => driver?.name || null)
            : []),
          ...(Array.isArray(result?.assignment?.staff)
            ? result.assignment.staff.map((person) => person?.name || null)
            : []),
        ]
        assignedNames
          .filter((name): name is string => Boolean(name) && String(name).trim() !== '' && String(name) !== 'Extra')
          .forEach((name) => blockedNamesInBatch.add(String(name)))
      }

      if (manualLogParallel) {
        /** Manual logística: buildLogisticaManualAssignmentOnly no usa `blockedNames`; escriure les fases en paral·lel. */
        const tuples = await Promise.all(
          orderedPhaseRequests.map((phase, index) =>
            writePhaseDoc(phase, [], manualPhasesFirestoreQueue).then((result) => ({
              index,
              phase,
              result,
            }))
          )
        )
        tuples.sort((a, b) => a.index - b.index)
        tuples.forEach(({ phase, result }) => applyPhaseWriteResult(phase, result))
      } else {
        for (const phase of orderedPhaseRequests) {
          const result = await writePhaseDoc(
            phase,
            Array.from(blockedNamesInBatch),
            manualPhasesFirestoreQueue
          )
          applyPhaseWriteResult(phase, result)
        }
      }

      if (manualPhasesFirestoreQueue && manualPhasesFirestoreQueue.length > 0) {
        let fwBatch = db.batch()
        let fwCount = 0
        const fwCol = db.collection(collectionName)
        const flushFw = async () => {
          if (fwCount === 0) return
          await fwBatch.commit()
          fwBatch = db.batch()
          fwCount = 0
        }
        for (const row of manualPhasesFirestoreQueue) {
          fwBatch.set(fwCol.doc(row.docId), row.toSave as DocumentData, { merge: true })
          fwCount++
          if (fwCount >= 480) await flushFw()
        }
        await flushFw()
      }

      if (
        confirmImmediatelyRequested &&
        createdDocIds.length > 0 &&
        mode === 'manual' &&
        isQuadrantCoreDepartment(deptNorm)
      ) {
        if (!jwtSessionForInlineConfirm) {
          return NextResponse.json(
            { success: false, error: 'Sessió caducada mentre es desava' },
            { status: 401 }
          )
        }
        const uniqIds = Array.from(new Set(createdDocIds))
        const firstDocId = uniqIds[0]
        const firstDraftRef = db.collection(collectionName).doc(firstDocId)
        const reuseDraftSnapshot = savedDraftSnapshotByDocId.has(firstDocId)
        const [stagePayload, fetchedSnapMaybe] = await Promise.all([
          getStageVerdCached(canonicalEventId),
          reuseDraftSnapshot
            ? Promise.resolve<DocumentSnapshot | undefined>(undefined)
            : firstDraftRef.get(),
        ])
        const firstPrevInline: QuadrantConfirmDoc | null = reuseDraftSnapshot
          ? (savedDraftSnapshotByDocId.get(firstDocId)! as unknown as QuadrantConfirmDoc)
          : fetchedSnapMaybe?.exists
            ? (fetchedSnapMaybe.data() as QuadrantConfirmDoc)
            : null
        const sdInline = stagePayload
        const confirmedAtIc = Timestamp.fromDate(new Date())
        const confirmedByIc =
          jwtSessionForInlineConfirm.user?.email || jwtSessionForInlineConfirm.email || 'system'
        await commitQuadrantConfirmedFirestoreBatch({
          colName: collectionName,
          docIds: uniqIds,
          confirmPatch: {
            status: 'confirmed',
            confirmedAt: confirmedAtIc,
            confirmedBy: confirmedByIc,
            code: quadrantConfirmTrim(sdInline?.code ?? sdInline?.C_digo ?? ''),
          },
        })
        const assignedIc = extractAssignedNamesFromQuadrant(firstPrevInline)
        const diffIc = computeQuadrantProposalDiff({
          proposal: firstPrevInline?.autoProposal || null,
          finalAssigned: assignedIc,
        })
        after(async () => {
          await deferQuadrantConfirmSideEffects({
            requestOrigin: req.nextUrl.origin,
            dept: deptNorm,
            colName: collectionName,
            eventId: String(canonicalEventId),
            confirmedAtIso: confirmedAtIc.toDate().toISOString(),
            confirmedBy: confirmedByIc,
            firstPrev: firstPrevInline,
            stageData: sdInline,
            assigned: assignedIc,
            diff: diffIc,
          })
        })
        confirmInlineApplied = true
      }

      after(() => {
        try {
          revalidateQuadrantsListCache()
        } catch {
          /* ignore */
        }
      })

      return NextResponse.json({
        success: true,
        docIds: Array.from(new Set(createdDocIds)),
        confirmInlineApplied,
        proposal: {
          responsible: preferredResult.assignment.responsible,
          drivers: preferredResult.assignment.drivers,
          staff: preferredResult.assignment.staff,
        },
        meta: preferredResult.meta,
        learningStatus,
      })
    }

    const cuinaManualFast =
      mode === 'manual' &&
      deptNorm === 'cuina' &&
      Array.isArray(assignBody.groups) &&
      assignBody.groups.length > 0

    type SingleFlowAssignResult = {
      assignment: {
        responsible?: { name: string } | null
        drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
        staff: Array<{ name: string; meetingPoint?: string }>
      }
      meta: {
        needsReview: boolean
        violations: string[]
        notes: string[]
      }
    }

    let finalAssignBody: QuadrantSaveRequestBody
    let res: SingleFlowAssignResult

    if (cuinaManualFast) {
      finalAssignBody = assignBody as QuadrantSaveRequestBody
      const departmentPeopleCu = await getDepartmentPeople()
      res = buildCuinaManualAssignmentOnly(
        assignBody as unknown as Record<string, unknown>,
        departmentPeopleCu as DepartmentPersonLite[]
      )
    } else {
      const finalSurveyPreferred = await getSurveyPreferred(
        String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
      )
      finalAssignBody = await enrichWithSurveyPreferences(assignBody, deptNorm, finalSurveyPreferred)
      const departmentPeople = await getDepartmentPeople()
      const premisesData = await getPremisesData()
      const ledger = await getLedgerForDate(
        String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
      )
      const normEvIdForBusy =
        typeof finalAssignBody.eventId === 'string' && String(finalAssignBody.eventId).trim()
          ? normalizeEventId(String(finalAssignBody.eventId))
          : canonicalEventId
      const singleFlowPhaseDateForBusy = String(
        finalAssignBody.phaseDate || body.phaseDate || finalAssignBody.startDate || ''
      ).trim()
      const shouldIgnoreSelfSingleFlow =
        String(body.generationScope || '').trim().toLowerCase() === 'event' &&
        Boolean(singleFlowPhaseDateForBusy)
      const singleFlowDocIdForBusy = shouldIgnoreSelfSingleFlow
        ? `${normEvIdForBusy}__event__${singleFlowPhaseDateForBusy}__event`
        : normEvIdForBusy
      const manualAssignment = body?.manualAssignment as
        | { responsibleName?: string | null; driverNames?: string[]; staffNames?: string[] }
        | undefined

      res =
        mode === 'manual'
          ? {
              assignment: {
                responsible: manualAssignment?.responsibleName
                  ? { name: String(manualAssignment.responsibleName) }
                  : null,
                drivers: Array.isArray(manualAssignment?.driverNames)
                  ? manualAssignment.driverNames
                      .map((name) => ({ name: String(name || '').trim() }))
                      .filter((d) => d.name)
                  : [],
                staff: Array.isArray(manualAssignment?.staffNames)
                  ? manualAssignment.staffNames
                      .map((name) => ({ name: String(name || '').trim() }))
                      .filter((s) => s.name)
                  : [],
              },
              meta: { needsReview: false, violations: [] as string[], notes: [] as string[] },
            }
          : ((await autoAssign({
              ...(finalAssignBody as unknown as Parameters<typeof autoAssign>[0]),
              departmentPeople,
              premises: premisesData?.premises,
              premisesWarnings: premisesData?.warnings || [],
              ledger,
              ignoreBusyQuadrantDocIds: [singleFlowDocIdForBusy],
            })) as SingleFlowAssignResult)
    }

    const { toSave } = buildToSave(finalAssignBody, res.assignment, res.meta)
    await applyStageData(toSave)

    const normalizedEventId =
      typeof toSave.eventId === 'string' && toSave.eventId.trim()
        ? normalizeEventId(toSave.eventId)
        : canonicalEventId
    const singleFlowPhaseDate = String(body.phaseDate || toSave.phaseDate || toSave.startDate || '').trim()
    const shouldPersistSingleFlowPerDay =
      String(body.generationScope || '').trim().toLowerCase() === 'event' &&
      Boolean(singleFlowPhaseDate)
    const docIdForSingleFlow = shouldPersistSingleFlowPerDay
      ? `${normalizedEventId}__event__${singleFlowPhaseDate}__event`
      : normalizedEventId

    await ensureNoOverlapForQuadrantSave(toSave, [docIdForSingleFlow])
    await db.collection(collectionName).doc(docIdForSingleFlow).set(toSave, { merge: true })
    createdDocIds.push(docIdForSingleFlow)

    if (
      confirmImmediatelyRequested &&
      mode === 'manual' &&
      isQuadrantCoreDepartment(deptNorm) &&
      createdDocIds.length > 0
    ) {
      if (!jwtSessionForInlineConfirm) {
        return NextResponse.json(
          { success: false, error: 'Sessió caducada mentre es desava' },
          { status: 401 }
        )
      }
      const uniqSf = Array.from(new Set(createdDocIds))
      const stagePayloadSf = await getStageVerdCached(canonicalEventId)
      const firstPrevSf = toSave as unknown as QuadrantConfirmDoc
      const confirmedAtSf = Timestamp.fromDate(new Date())
      const confirmedBySf =
        jwtSessionForInlineConfirm.user?.email || jwtSessionForInlineConfirm.email || 'system'
      await commitQuadrantConfirmedFirestoreBatch({
        colName: collectionName,
        docIds: uniqSf,
        confirmPatch: {
          status: 'confirmed',
          confirmedAt: confirmedAtSf,
          confirmedBy: confirmedBySf,
          code: quadrantConfirmTrim(stagePayloadSf?.code ?? stagePayloadSf?.C_digo ?? ''),
        },
      })
      const assignedSf = extractAssignedNamesFromQuadrant(firstPrevSf)
      const diffSf = computeQuadrantProposalDiff({
        proposal: firstPrevSf?.autoProposal || null,
        finalAssigned: assignedSf,
      })
      after(async () => {
        await deferQuadrantConfirmSideEffects({
          requestOrigin: req.nextUrl.origin,
          dept: deptNorm,
          colName: collectionName,
          eventId: String(canonicalEventId),
          confirmedAtIso: confirmedAtSf.toDate().toISOString(),
          confirmedBy: confirmedBySf,
          firstPrev: firstPrevSf,
          stageData: stagePayloadSf,
          assigned: assignedSf,
          diff: diffSf,
        })
      })
      confirmInlineApplied = true
    }

    after(() => {
      try {
        revalidateQuadrantsListCache()
      } catch {
        /* ignore */
      }
    })

    return NextResponse.json({
      success: true,
      docIds: Array.from(new Set(createdDocIds)),
      confirmInlineApplied,
      proposal: {
        responsible: res.assignment.responsible,
        drivers: res.assignment.drivers,
        staff: res.assignment.staff,
      },
      meta: res.meta,
      learningStatus,
    })
  } catch (e: unknown) {
    console.error('[quadrants/route] error:', e)
    if (e instanceof Error) {
      const status =
        typeof (e as Error & { status?: unknown }).status === 'number'
          ? Number((e as Error & { status?: number }).status)
          : 500
      return NextResponse.json(
        {
          success: false,
          error: e.message,
          conflicts:
            status === 409
              ? (e as Error & { conflicts?: unknown }).conflicts || []
              : [],
        },
        { status }
      )
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
