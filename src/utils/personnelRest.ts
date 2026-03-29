// ✅ filename: src/utils/personnelRest.ts
import fs from 'fs'
import path from 'path'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { readLegacyExternalWorkersFromDoc } from '@/lib/legacyExternalWorkers'



/* ================= Helpers ================= */
export const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const norm = (s?: string | null) =>
  unaccent((s || '').toLowerCase().trim())

export const capitalize = (s: string) =>
  s ? s[0].toUpperCase() + s.slice(1) : s

export const toISO = (d?: string, t?: string) =>
  `${d || ''}T${t || '00:00'}:00` // sense Z (local)

/* ================= Tipus ================= */
export interface WorkerRef {
  id?: string
  name?: string
}

export interface QuadrantDoc {
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  responsable?: WorkerRef
  responsableName?: string
  responsables?: Array<WorkerRef & { startDate?: string; startTime?: string; endDate?: string; endTime?: string }>
  conductors?: Array<WorkerRef & { startDate?: string; startTime?: string; endDate?: string; endTime?: string }>
  treballadors?: Array<WorkerRef & { startDate?: string; startTime?: string; endDate?: string; endTime?: string }>
  groups?: Array<{
    responsibleId?: string | null
    responsibleName?: string | null
    startDate?: string
    startTime?: string
    endDate?: string
    endTime?: string
  }>
  [key: string]: unknown
}

function readLegacyExternalWorkers(q: QuadrantDoc) {
  return readLegacyExternalWorkersFromDoc<WorkerRef & {
    startDate?: string
    startTime?: string
    endDate?: string
    endTime?: string
  }>(q)
}

export async function listQuadrantCollections(): Promise<string[]> {
  const cols = await firestoreAdmin.listCollections()
  return cols
    .map(c => c.id)
    .filter(id => {
      const n = norm(id)
      if (!n.startsWith('quadrant')) return false
      if (n.includes('draft')) return false
      return true
    })
}

/* =============== Resolució col·lecció per departament =============== */
function resolveQuadrantCollection(department: string): string {
  const d = norm(department)
  if (d.startsWith('serv')) return 'quadrantsServeis'
  if (d.startsWith('log')) return 'quadrantsLogistica'
  if (d.startsWith('cui')) return 'quadrantsCuina'
  if (d.startsWith('prod')) return 'quadrantsProduccio'

  console.warn(`[personnelRest] ⚠️ Departament desconegut: ${department}`)
  return 'quadrantsServeis' // valor per defecte
}

export async function fetchQuadrantDocsByEndDate(colId: string, endDate: string) {
  let snap = await firestoreAdmin
    .collection(colId)
    .where('startDate', '<=', endDate)
    .get()

  if (snap.empty) {
    const endAsDate = new Date(endDate)
    if (!Number.isNaN(endAsDate.getTime())) {
      snap = await firestoreAdmin
        .collection(colId)
        .where('startDate', '<=', endAsDate)
        .get()
    }
  }

  return snap.docs
}

/* =============== Premisses (JSON) =============== */
export async function loadMinRestHours(department: string): Promise<number> {
  const filePath = path.resolve(
    process.cwd(),
    `src/data/premises-${norm(department)}.json`
  )
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as { restHours?: number }
    const v = Number(data?.restHours)
    return Number.isFinite(v) && v > 0 ? v : 8
  } catch {
    return 8
  }
}

/* =============== Utils temps/solapament =============== */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart
}

function normalizeRange(start: Date, end: Date) {
  if (end <= start) {
    return { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) }
  }
  return { start, end }
}

type LineWithTime = {
  id?: string
  name?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
}

function toDateString(value?: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString().split('T')[0]
  const anyVal = value as { toDate?: () => Date; seconds?: number }
  if (typeof anyVal.toDate === 'function') {
    return anyVal.toDate().toISOString().split('T')[0]
  }
  if (typeof anyVal.seconds === 'number') {
    return new Date(anyVal.seconds * 1000).toISOString().split('T')[0]
  }
  return String(value)
}

function getLineRange(line: LineWithTime | null, q: QuadrantDoc) {
  const sd = toDateString(line?.startDate) || toDateString(q.startDate)
  const ed = toDateString(line?.endDate) || toDateString(q.endDate)
  if (!sd || !ed) return null
  const st = line?.startTime || q.startTime || '00:00'
  const et = line?.endTime || q.endTime || '23:59'
  return { sd, ed, st, et }
}

function lineOverlaps(line: LineWithTime | null, q: QuadrantDoc, newStart: Date, newEnd: Date) {
  const range = getLineRange(line, q)
  if (!range) return false
  const lStartRaw = new Date(`${range.sd}T${range.st}:00Z`)
  const lEndRaw = new Date(`${range.ed}T${range.et}:00Z`)
  const lineNorm = normalizeRange(lStartRaw, lEndRaw)
  const reqNorm = normalizeRange(newStart, newEnd)
  return intervalsOverlap(lineNorm.start, lineNorm.end, reqNorm.start, reqNorm.end)
}

/* =============== Descans mínim per NOM =============== */
export function hasMinRestByName(
  personName: string,
  quadrants: QuadrantDoc[],
  newStart: Date,
  newEnd: Date,
  minRestH: number
): boolean {
  const msRest = (minRestH || 8) * 3600000
  const person = norm(personName)
  const reqNorm = normalizeRange(newStart, newEnd)

  for (const q of quadrants) {
    const involvedNames: string[] = [
      ...(Array.isArray(q.treballadors)
        ? q.treballadors.map(t => t?.name).filter(Boolean) as string[]
        : []),
      ...(Array.isArray(q.conductors)
        ? q.conductors.map(c => c?.name).filter(Boolean) as string[]
        : []),
      ...(Array.isArray(q.responsables)
        ? q.responsables.map(r => r?.name).filter(Boolean) as string[]
        : []),
      ...(q.responsable?.name ? [q.responsable.name] : []),
      ...(q.responsableName ? [q.responsableName] : []),
      ...(Array.isArray(q.groups)
        ? q.groups
            .map(g => g?.responsibleName)
            .filter(Boolean) as string[]
        : []),
    ].map(norm)

    if (!involvedNames.includes(person)) continue

    const prevStartRaw = new Date(toISO(toDateString(q.startDate), q.startTime))
    const prevEndRaw = new Date(toISO(toDateString(q.endDate), q.endTime))
    const prevNorm = normalizeRange(prevStartRaw, prevEndRaw)

    if (intervalsOverlap(prevNorm.start, prevNorm.end, reqNorm.start, reqNorm.end)) {
      console.log(`[hasMinRestByName] OVERLAP → ${personName}`)
      return false
    }

    const gapBefore = reqNorm.start.getTime() - prevNorm.end.getTime()
    const gapAfter = prevNorm.start.getTime() - reqNorm.end.getTime()

    if (gapBefore < msRest && gapAfter < msRest) {
      console.log(`[hasMinRestByName] REST FAIL → ${personName}`)
      return false
    }
  }
  return true
}

/* =============== IDs/NOMS ocupats =============== */
export async function getBusyPersonnelIds(
  department: string,
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string
): Promise<string[]> {
  const ids: string[] = []
  const push = (label: string, v?: string) => {
    const n = norm(v)
    if (n) {
      ids.push(n)
      console.log(`[getBusyPersonnelIds] PUSH ${label}:`, v, '→', n)
    }
  }

  const newStart = new Date(`${startDate}T${startTime || '00:00'}:00Z`)
  const newEnd = new Date(`${endDate}T${endTime || '23:59'}:00Z`)

  const colId = resolveQuadrantCollection(department)
  const docs = await fetchQuadrantDocsByEndDate(colId, endDate)

  console.log(`[getBusyPersonnelIds] scanning col: ${colId} → ${docs.length} docs`)

  docs.forEach(d => {
    const q = d.data() as QuadrantDoc

    const addIfOverlap = (label: string, line: LineWithTime | null, v?: string) => {
      if (!v) return
      if (lineOverlaps(line, q, newStart, newEnd)) push(label, v)
    }

    addIfOverlap('responsable', q.responsable || null, q.responsable?.id || q.responsable?.name)
    addIfOverlap('responsable', { name: q.responsableName } as LineWithTime, q.responsableName || undefined)

    if (Array.isArray(q.responsables)) {
      q.responsables.forEach(r => {
        addIfOverlap('responsable', r, r?.id || r?.name)
      })
    }

    if (Array.isArray(q.conductors)) {
      q.conductors.forEach(c => addIfOverlap('conductor', c, c?.id || c?.name))
    }
    if (Array.isArray(q.treballadors)) {
      q.treballadors.forEach(t => addIfOverlap('treballador', t, t?.id || t?.name))
    }

    readLegacyExternalWorkers(q).forEach((line) =>
      addIfOverlap('treballador', line, line?.id || line?.name)
    )

    if (Array.isArray(q.groups)) {
      q.groups.forEach(g => {
        const line: LineWithTime = {
          startDate: g.startDate || q.startDate,
          startTime: g.startTime || q.startTime,
          endDate: g.endDate || q.endDate,
          endTime: g.endTime || q.endTime,
        }
        addIfOverlap(
          'responsable',
          line,
          g.responsibleId || g.responsibleName || undefined
        )
      })
    }
  })

  console.log('[getBusyPersonnelIds] returning', ids.length, 'idsOrNames →', ids)

  return Array.from(new Set(ids))
}

export async function getBusyPersonnelIdsAnyDepartment(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
  excludeEventId?: string | null
): Promise<string[]> {
  const ids: string[] = []
  const push = (label: string, v?: string) => {
    const n = norm(v)
    if (n) ids.push(n)
  }

  const newStart = new Date(`${startDate}T${startTime || '00:00'}:00Z`)
  const newEnd = new Date(`${endDate}T${endTime || '23:59'}:00Z`)

  const colIds = await listQuadrantCollections()
  for (const colId of colIds) {
    const docs = await fetchQuadrantDocsByEndDate(colId, endDate)

    if (docs.length) {
      docs.forEach(d => {
        if (excludeEventId && d.id === excludeEventId) return
        const q = d.data() as QuadrantDoc & { eventId?: string }
        if (excludeEventId && q?.eventId === excludeEventId) return

        const addIfOverlap = (label: string, line: LineWithTime | null, v?: string) => {
          if (!v) return
          if (lineOverlaps(line, q, newStart, newEnd)) push(label, v)
        }

        addIfOverlap('responsable', q.responsable || null, q.responsable?.id || q.responsable?.name)
        addIfOverlap('responsable', { name: q.responsableName } as LineWithTime, q.responsableName || undefined)

        if (Array.isArray(q.responsables)) {
          q.responsables.forEach(r => {
            addIfOverlap('responsable', r, r?.id || r?.name)
          })
        }

        if (Array.isArray(q.conductors)) {
          q.conductors.forEach(c => addIfOverlap('conductor', c, c?.id || c?.name))
        }
        if (Array.isArray(q.treballadors)) {
          q.treballadors.forEach(t => addIfOverlap('treballador', t, t?.id || t?.name))
        }

        readLegacyExternalWorkers(q).forEach((line) =>
          addIfOverlap('treballador', line, line?.id || line?.name)
        )

        if (Array.isArray(q.groups)) {
          q.groups.forEach(g => {
            const line: LineWithTime = {
              startDate: g.startDate || q.startDate,
              startTime: g.startTime || q.startTime,
              endDate: g.endDate || q.endDate,
              endTime: g.endTime || q.endTime,
            }
            addIfOverlap(
              'responsable',
              line,
              g.responsibleId || g.responsibleName || undefined
            )
          })
        }
      })
    }
  }

  return Array.from(new Set(ids))
}





