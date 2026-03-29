// file: src/app/api/reports/personal/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { readLegacyExternalWorkersFromDoc } from '@/lib/legacyExternalWorkers'

const norm = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

type RoleKey = 'responsable' | 'conductor' | 'treballador'

const isIndexError = (err: any) =>
  err?.code === 9 || String(err?.message || '').toLowerCase().includes('requires an index')

function parseTimeToMinutes(t?: any): number | null {
  if (!t) return null
  if (t instanceof Date) return t.getHours() * 60 + t.getMinutes()
  const str = String(t).trim()
  const m = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}

interface AggPerson {
  id: string
  name: string
  department: string
  roles: Record<RoleKey, number>
  events: Set<string>
  minutes: number
}

async function listQuadrantCollections(filterDepts?: string[]) {
  const cols = await db.listCollections()
  const wanted = filterDepts?.map(d => norm(d))
  return cols
    .map(c => c.id)
    .filter(id => id.toLowerCase().startsWith('quadrants'))
    .filter(id => {
      if (!wanted || wanted.length === 0) return true
      const suf = norm(id.replace(/^quadrants?/i, ''))
      return wanted.includes(suf)
    })
}

function extractLines(d: any) {
  const entries: Array<{ role: RoleKey; row: any }> = []
  if (d.responsable) entries.push({ role: 'responsable', row: d.responsable })
  if (Array.isArray(d.responsables)) d.responsables.forEach((r: any) => entries.push({ role: 'responsable', row: r }))
  if (Array.isArray(d.conductors)) d.conductors.forEach((r: any) => entries.push({ role: 'conductor', row: r }))
  if (Array.isArray(d.treballadors)) d.treballadors.forEach((r: any) => entries.push({ role: 'treballador', row: r }))
  readLegacyExternalWorkersFromDoc(d).forEach((r: any) => entries.push({ role: 'treballador', row: r }))
  return entries
}

function getPersonKey(row: any) {
  return (
    row?.id ||
    row?.workerId ||
    row?.personId ||
    row?.userId ||
    row?.uid ||
    row?.email ||
    row?.name ||
    'unknown'
  )
}

function getPersonName(row: any) {
  return row?.name || row?.fullName || row?.email || 'Sense nom'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const eventFilter = (searchParams.get('event') || '').trim().toLowerCase()

    if (!start || !end) {
      return NextResponse.json({ success: false, error: 'Falten start/end (YYYY-MM-DD)' }, { status: 400 })
    }

    const deptParam = searchParams.get('departments') || ''
    const departments = deptParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const colNames = await listQuadrantCollections(departments)

    const persons = new Map<string, AggPerson>()
    const events = new Set<string>()
    const eventOptions = new Map<string, string>()
    const deptOptions = new Set<string>()
    const lineOptions = new Set<string>()
    const warnings: string[] = []

    for (const colName of colNames) {
      const ref = db.collection(colName)
      let snap
      try {
        snap = await ref.where('startDate', '<=', end).where('endDate', '>=', start).get()
      } catch (err: any) {
        if (isIndexError(err)) {
          const msg = String(err?.message || '')
          const link = msg.match(/https?:\/\/\S+/)?.[0]
          warnings.push(
            `Falta un index startDate/endDate per a la colleccio ${colName}. ${
              link ? `Crea'l o revisa'l: ${link}` : 'Revisa la consola de Firestore.'
            }`
          )
          console.warn(`[reports/personal] missing index for ${colName}:`, msg)
          continue
        }
        throw err
      }

      if (snap.empty) {
        const startDate = new Date(start)
        const endDate = new Date(end)
        try {
          snap = await ref.where('startDate', '<=', endDate).where('endDate', '>=', startDate).get()
        } catch (err: any) {
          if (isIndexError(err)) {
            const msg = String(err?.message || '')
            const link = msg.match(/https?:\/\/\S+/)?.[0]
            warnings.push(
              `Falta un index startDate/endDate per a la colleccio ${colName}. ${
                link ? `Crea'l o revisa'l: ${link}` : 'Revisa la consola de Firestore.'
              }`
            )
            console.warn(`[reports/personal] missing index (Date) for ${colName}:`, msg)
            continue
          }
          throw err
        }
      }

      if (snap.empty) continue

      snap.forEach(doc => {
        const d = doc.data() as any
        const eventId = d.code || d.eventCode || d.eventId || doc.id
        const eventName = d.eventName || d.name || d.title || d.summary || ''
        const line = d.LN || d.ln || d.line || d.lineaNegoci || ''

        events.add(String(eventId))
        if (eventId) eventOptions.set(String(eventId), eventName || String(eventId))
        if (line) lineOptions.add(String(line))

        const matchesEvent =
          !eventFilter ||
          String(eventId).toLowerCase().includes(eventFilter) ||
          String(d?.eventName || '').toLowerCase().includes(eventFilter)
        if (!matchesEvent) return

        extractLines(d).forEach(({ role, row }) => {
          const pid = String(getPersonKey(row))
          const name = getPersonName(row)
          const department = d.department || row?.department || colName.replace(/^quadrants?/i, '').toLowerCase() || ''
          if (department) deptOptions.add(String(department))

          const startMin = parseTimeToMinutes(row?.startTime ?? d.startTime)
          const endMin = parseTimeToMinutes(row?.endTime ?? d.endTime)
          const minutes = startMin !== null && endMin !== null && endMin > startMin ? endMin - startMin : 0

          const current = persons.get(pid) || {
            id: pid,
            name,
            department,
            roles: { responsable: 0, conductor: 0, treballador: 0 },
            events: new Set<string>(),
            minutes: 0,
          }

          current.roles[role] += 1
          current.events.add(String(eventId))
          current.minutes += minutes
          current.name = current.name || name
          current.department = current.department || department

          persons.set(pid, current)
        })
      })
    }

    const data = Array.from(persons.values()).map(p => ({
      ...p,
      events: Array.from(p.events).length,
      hours: +(p.minutes / 60).toFixed(2),
    }))

    const totalHours = data.reduce((acc, p) => acc + p.hours, 0)
    const totalEvents = events.size

    const roleTotals = data.reduce(
      (acc, p) => {
        ;(['responsable', 'conductor', 'treballador'] as RoleKey[]).forEach(r => {
          acc[r] += p.roles[r]
        })
        return acc
      },
      { responsable: 0, conductor: 0, treballador: 0 }
    )

    return NextResponse.json({
      success: true,
      summary: {
        people: data.length,
        events: totalEvents,
        hours: +totalHours.toFixed(2),
        roles: roleTotals,
      },
      data,
      options: {
        events: Array.from(eventOptions.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        departments: Array.from(deptOptions).sort(),
        persons: Array.from(new Set(data.map(p => p.name || p.id))).sort(),
        lines: Array.from(lineOptions).sort(),
      },
      warnings,
    })
  } catch (e: unknown) {
    console.error('[reports/personal] error:', e)
    const msg = e instanceof Error ? e.message : 'Error intern'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
