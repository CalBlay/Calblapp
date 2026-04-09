// file: src/lib/quadrantDoubleBooking.ts
import type { BusyAssignment } from '@/services/workloadLedger'

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export const normName = (s?: string | null) => unaccent((s || '').toLowerCase().trim())

const toISO = (d: string, t?: string) => {
  const time = (t || '00:00').trim()
  const hhmm = time.length >= 5 ? time.slice(0, 5) : '00:00'
  return `${d}T${hhmm}:00`
}

const normalizeRange = (start: Date, end: Date) =>
  end <= start ? { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) } : { start, end }

const getRangeStart = (item: Partial<BusyAssignment>) =>
  String(item.startDate || item.phaseDate || '').trim()

const getRangeEnd = (item: Partial<BusyAssignment>) =>
  String(item.endDate || item.phaseDate || item.startDate || '').trim()

function busyTimeRange(q: BusyAssignment): { start: Date; end: Date } | null {
  const ds = getRangeStart(q)
  const de = getRangeEnd(q)
  if (!ds || !de) return null
  const start = new Date(toISO(ds, q.startTime))
  const end = new Date(toISO(de, q.endTime))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return normalizeRange(start, end)
}

function requestTimeRange(startISO: string, endISO: string): { start: Date; end: Date } {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return normalizeRange(start, end)
}

function collectPersonKeys(q: BusyAssignment): Set<string> {
  const keys = new Set<string>()
  const add = (n?: string | null) => {
    const k = normName(n)
    if (k) keys.add(k)
  }
  for (const x of q.treballadors || []) add(x?.name)
  for (const x of q.conductors || []) add(x?.name)
  for (const x of q.responsables || []) add(x?.name)
  add(q.responsable?.name)
  add(q.responsableName)
  for (const g of q.groups || []) add(g?.responsibleName)
  return keys
}

function isActiveQuadrant(q: BusyAssignment) {
  const s = String(q.status || 'draft').toLowerCase().trim()
  return s === 'draft' || s === 'confirmed'
}

export type CrossQuadrantConflict = {
  personDisplay: string
  otherEventName: string
  otherLocation: string
  otherPhaseLabel: string
  otherDocId: string
}

/**
 * Detecta si alguna persona assignada ja apareix en un altre quadrant (mateix departament o altres,
 * segons la llista `busy`) amb franja horària solapada.
 */
export function findCrossQuadrantConflicts(params: {
  startISO: string
  endISO: string
  assignedNames: string[]
  busyAssignments: BusyAssignment[]
  ignoreDocIds?: Set<string>
}): CrossQuadrantConflict[] {
  const { startISO, endISO, busyAssignments } = params
  const ignore = params.ignoreDocIds ?? new Set<string>()
  const req = requestTimeRange(startISO, endISO)

  const byNorm = new Map<string, string>()
  for (const raw of params.assignedNames) {
    const n = String(raw || '').trim()
    if (!n || n === 'Extra') continue
    const k = normName(n)
    if (!k) continue
    if (!byNorm.has(k)) byNorm.set(k, n)
  }
  const people = [...byNorm.entries()]

  const out: CrossQuadrantConflict[] = []
  const seenPair = new Set<string>()

  for (const [personKey, personDisplay] of people) {
    for (const q of busyAssignments) {
      if (!q?.id || ignore.has(q.id)) continue
      if (!isActiveQuadrant(q)) continue

      const keys = collectPersonKeys(q)
      if (!keys.has(personKey)) continue

      const busy = busyTimeRange(q)
      if (!busy) continue

      const overlap = req.start < busy.end && req.end > busy.start
      if (!overlap) continue

      const dedupe = `${personKey}__${q.id}`
      if (seenPair.has(dedupe)) continue
      seenPair.add(dedupe)

      const d = q as BusyAssignment & {
        eventName?: string
        location?: string
        phaseLabel?: string | null
      }
      out.push({
        personDisplay,
        otherEventName: String(d.eventName || '').trim() || '(sense nom)',
        otherLocation: String(d.location || '').trim() || '(ubicació desconeguda)',
        otherPhaseLabel: String(d.phaseLabel || '').trim(),
        otherDocId: q.id,
      })
    }
  }

  return out
}

export function conflictsToAttentionNotes(conflicts: CrossQuadrantConflict[]): string[] {
  return conflicts.map((c) => {
    const phase = c.otherPhaseLabel ? ` — ${c.otherPhaseLabel}` : ''
    return `${c.personDisplay} ja està assignat/da a «${c.otherEventName}» (${c.otherLocation})${phase} en el mateix horari. Revisa els dos quadrants.`
  })
}
