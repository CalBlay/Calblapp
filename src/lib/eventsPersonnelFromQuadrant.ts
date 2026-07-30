/**
 * Extract personnel lines from a quadrant doc for Event Personnel / Closing.
 * After multiquadrants, responsables may live on responsables[], groups[].responsibleName,
 * or groups[].roleLines — not only top-level responsableName.
 */

export type QuadrantPersonLine = {
  name?: string
  meetingPoint?: string
  time?: string
  hour?: string
  endTime?: string
  endTimeReal?: string
  sortidaNotes?: string
  noShow?: boolean
  leftEarly?: boolean
  plate?: string
  matricula?: string
  vehiclePlate?: string
}

export type QuadrantGroupLine = {
  responsibleName?: string | null
  meetingPoint?: string | null
  startTime?: string | null
  endTime?: string | null
  responsibleEndTimeReal?: string | null
  responsibleNoShow?: boolean | null
  responsibleLeftEarly?: boolean | null
  responsibleSortidaNotes?: string | null
  roleLines?: Array<{
    role?: string | null
    personName?: string | null
    name?: string | null
    meetingPoint?: string | null
    startTime?: string | null
    endTime?: string | null
    endTimeReal?: string | null
    sortidaNotes?: string | null
    noShow?: boolean | null
    leftEarly?: boolean | null
  }>
}

export type QuadrantPersonnelSource = {
  department?: string
  meetingPoint?: string
  startTime?: string
  endTime?: string
  hour?: string
  convocatoria?: string
  responsableName?: string
  responsable?: QuadrantPersonLine | QuadrantPersonLine[] | null
  responsables?: QuadrantPersonLine[]
  conductors?: QuadrantPersonLine[]
  treballadors?: QuadrantPersonLine[]
  workers?: QuadrantPersonLine[]
  groups?: QuadrantGroupLine[]
  updatedAt?: unknown
  confirmedAt?: unknown
  createdAt?: unknown
}

export type ExtractedPersonnelLine = {
  name: string
  role: string
  department?: string
  meetingPoint?: string
  time?: string
  endTime?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
  plate?: string
}

const trimName = (value?: string | null) => String(value || '').trim()

export function extractPersonnelLinesFromQuadrant(
  q: QuadrantPersonnelSource
): ExtractedPersonnelLine[] {
  const people: ExtractedPersonnelLine[] = []
  const dept = q.department
  const qMeeting = q.meetingPoint
  const qTime = q.startTime || q.hour || q.convocatoria
  const qEnd = q.endTime || ''

  const rawTopResponsable = q.responsable
  const topResponsableRows: QuadrantPersonLine[] = Array.isArray(rawTopResponsable)
    ? rawTopResponsable
    : rawTopResponsable && typeof rawTopResponsable === 'object'
      ? [rawTopResponsable]
      : []
  const topResponsableByName = new Map<string, QuadrantPersonLine>()
  topResponsableRows.forEach((row) => {
    const key = trimName(row?.name).toLowerCase()
    if (key) topResponsableByName.set(key, row)
  })

  if (q.responsableName) {
    const name = String(q.responsableName).trim()
    const closingMeta = topResponsableByName.get(name.toLowerCase())
    people.push({
      name,
      role: 'responsable',
      department: dept,
      meetingPoint: closingMeta?.meetingPoint || qMeeting,
      time: closingMeta?.time || closingMeta?.hour || qTime,
      endTime: closingMeta?.endTime || qEnd,
      endTimeReal: closingMeta?.endTimeReal || '',
      notes: closingMeta?.sortidaNotes || '',
      noShow: !!closingMeta?.noShow,
      leftEarly: !!closingMeta?.leftEarly,
    })
  }

  const each = (arr: QuadrantPersonLine[] | undefined, role: string) => {
    if (!Array.isArray(arr)) return
    for (const p of arr) {
      const name = trimName(p?.name)
      if (!name) continue
      const plate =
        role === 'conductor'
          ? String(p.plate || p.matricula || p.vehiclePlate || '')
          : ''
      people.push({
        name,
        role,
        department: dept,
        meetingPoint: p.meetingPoint || qMeeting,
        time: p.time || p.hour || qTime,
        endTime: p.endTime || qEnd,
        endTimeReal: p.endTimeReal || '',
        notes: p.sortidaNotes || '',
        noShow: !!p.noShow,
        leftEarly: !!p.leftEarly,
        ...(plate ? { plate: String(plate) } : {}),
      })
    }
  }

  each(q.responsables, 'responsable')
  each(q.conductors, 'conductor')
  each(q.treballadors, 'treballador')
  each(q.workers, 'treballador')

  if (Array.isArray(q.groups)) {
    for (const group of q.groups) {
      const groupMeeting = String(group?.meetingPoint || '').trim() || qMeeting
      const groupStart = String(group?.startTime || '').trim() || qTime
      const groupEnd = String(group?.endTime || '').trim() || qEnd

      const responsibleName = trimName(group?.responsibleName)
      if (responsibleName) {
        people.push({
          name: responsibleName,
          role: 'responsable',
          department: dept,
          meetingPoint: groupMeeting,
          time: groupStart,
          endTime: groupEnd,
          endTimeReal: String(group?.responsibleEndTimeReal || ''),
          notes: String(group?.responsibleSortidaNotes || ''),
          noShow: !!group?.responsibleNoShow,
          leftEarly: !!group?.responsibleLeftEarly,
        })
      }

      if (!Array.isArray(group?.roleLines)) continue
      for (const line of group.roleLines) {
        const role = String(line?.role || '').trim().toLowerCase()
        if (role !== 'responsable') continue
        const name = trimName(line?.personName || line?.name)
        if (!name) continue
        people.push({
          name,
          role: 'responsable',
          department: dept,
          meetingPoint: String(line?.meetingPoint || '').trim() || groupMeeting,
          time: String(line?.startTime || '').trim() || groupStart,
          endTime: String(line?.endTime || '').trim() || groupEnd,
          endTimeReal: String(line?.endTimeReal || ''),
          notes: String(line?.sortidaNotes || ''),
          noShow: !!line?.noShow,
          leftEarly: !!line?.leftEarly,
        })
      }
    }
  }

  return coalescePersonnelLines(
    people.filter((person) => Boolean(trimName(person.name)))
  )
}

/** Same person may appear from responsableName, responsables[], and groups — keep richest closing fields. */
function coalescePersonnelLines(people: ExtractedPersonnelLine[]): ExtractedPersonnelLine[] {
  const merged = new Map<string, ExtractedPersonnelLine>()

  people.forEach((person) => {
    const key = `${String(person.role || '')
      .trim()
      .toLowerCase()}|${trimName(person.name).toLowerCase()}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, person)
      return
    }

    merged.set(key, {
      ...existing,
      ...person,
      meetingPoint: person.meetingPoint || existing.meetingPoint,
      time: person.time || existing.time,
      endTime: person.endTime || existing.endTime,
      endTimeReal: person.endTimeReal || existing.endTimeReal,
      notes: person.notes || existing.notes,
      noShow: person.noShow || existing.noShow,
      leftEarly: person.leftEarly || existing.leftEarly,
      plate: person.plate || existing.plate,
    })
  })

  return Array.from(merged.values())
}

export type ClosingPersonUpdate = {
  name: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

type ClosingRow = Record<string, unknown>

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normName = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())

function matchByName(a?: string, b?: string) {
  return normName(a) === normName(b) && normName(a) !== ''
}

export function applyClosingUpdatesToPersonArray(
  arr: ClosingRow[] | undefined,
  updates: ClosingPersonUpdate[],
  meta: { userId: string; ts: string }
): ClosingRow[] | undefined {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) => {
    const itemName = typeof item.name === 'string' ? item.name : undefined
    const upd = updates.find((u) => matchByName(u.name, itemName))
    if (!upd) return item
    return {
      ...item,
      endTimeReal: upd.endTimeReal || null,
      sortidaNotes: upd.notes || '',
      noShow: !!upd.noShow,
      leftEarly: !!upd.leftEarly,
      sortidaSetBy: { userId: meta.userId, ts: meta.ts },
    }
  })
}

export function applyClosingUpdatesToGroups(
  groups: unknown,
  updates: ClosingPersonUpdate[],
  meta: { userId: string; ts: string }
): unknown {
  if (!Array.isArray(groups)) return groups

  return groups.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const group = { ...(raw as Record<string, unknown>) }
    const responsibleName =
      typeof group.responsibleName === 'string' ? group.responsibleName : undefined
    const respUpdate = updates.find((u) => matchByName(u.name, responsibleName))
    if (respUpdate) {
      group.responsibleEndTimeReal = respUpdate.endTimeReal || null
      group.responsibleNoShow = !!respUpdate.noShow
      group.responsibleLeftEarly = !!respUpdate.leftEarly
      group.responsibleSortidaNotes = respUpdate.notes || ''
      group.responsibleSortidaSetBy = { userId: meta.userId, ts: meta.ts }
    }

    if (Array.isArray(group.roleLines)) {
      group.roleLines = (group.roleLines as ClosingRow[]).map((line) => {
        const personName =
          typeof line.personName === 'string'
            ? line.personName
            : typeof line.name === 'string'
              ? line.name
              : undefined
        const upd = updates.find((u) => matchByName(u.name, personName))
        if (!upd) return line
        return {
          ...line,
          endTimeReal: upd.endTimeReal || null,
          sortidaNotes: upd.notes || '',
          noShow: !!upd.noShow,
          leftEarly: !!upd.leftEarly,
          sortidaSetBy: { userId: meta.userId, ts: meta.ts },
        }
      })
    }

    return group
  })
}
