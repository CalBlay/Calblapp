// file: src/app/api/reports/financial/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { readLegacyExternalWorkersFromDoc } from '@/lib/legacyExternalWorkers'

const COST_PER_HOUR = 18 // €/h — es pot fer configurable si cal

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

function extractLines(d: any) {
  const entries: Array<{ role: RoleKey; row: any }> = []
  if (d.responsable) entries.push({ role: 'responsable', row: d.responsable })
  if (Array.isArray(d.responsables)) d.responsables.forEach((r: any) => entries.push({ role: 'responsable', row: r }))
  if (Array.isArray(d.conductors)) d.conductors.forEach((r: any) => entries.push({ role: 'conductor', row: r }))
  if (Array.isArray(d.treballadors)) d.treballadors.forEach((r: any) => entries.push({ role: 'treballador', row: r }))
  readLegacyExternalWorkersFromDoc(d).forEach((r: any) => entries.push({ role: 'treballador', row: r }))
  return entries
}

async function listQuadrantCollections() {
  const cols = await db.listCollections()
  return cols.map(c => c.id).filter(id => id.toLowerCase().startsWith('quadrants'))
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const eventFilter = (searchParams.get('event') || '').trim().toLowerCase()
    const lineFilter = (searchParams.get('line') || '').trim().toLowerCase()

    if (!start || !end) {
      return NextResponse.json({ success: false, error: 'Falten start/end (YYYY-MM-DD)' }, { status: 400 })
    }

    const colNames = await listQuadrantCollections()

    const warnings: string[] = []
    const events = new Map<
      string,
      {
        id: string
        name: string
        ln: string
        importTotal: number
        pax: number
        hours: number
      }
    >()
    const lineOptions = new Set<string>()
    const eventOptions = new Map<string, string>()

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
            `Falta un index startDate/endDate per a la col·leccio ${colName}. ${
              link ? `Crea'l o revisa'l: ${link}` : 'Revisa la consola de Firestore.'
            }`
          )
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
              `Falta un index startDate/endDate per a la col·leccio ${colName}. ${
                link ? `Crea'l o revisa'l: ${link}` : 'Revisa la consola de Firestore.'
              }`
            )
            continue
          }
          throw err
        }
      }

      if (snap.empty) continue

      snap.forEach(doc => {
        const d = doc.data() as any
        const eventId = d.code || d.eventCode || d.eventId || doc.id
        const name = d.eventName || d.name || d.title || d.summary || String(eventId)
        const ln = (d.LN || d.ln || d.line || d.lineaNegoci || '').toString()
        const importTotal = Number(d.Import || d.import || d.factura || 0)
        const pax = Number(d.NumPax || d.pax || d.assistents || d.numPersones || 0)

        if (!eventId) return
        if (lineFilter && ln.toLowerCase() !== lineFilter) return
        if (
          eventFilter &&
          !String(eventId).toLowerCase().includes(eventFilter) &&
          !String(name).toLowerCase().includes(eventFilter)
        )
          return

        if (ln) lineOptions.add(ln)
        eventOptions.set(String(eventId), name || String(eventId))

        // acumular hores de totes les línies
        let hours = 0
        extractLines(d).forEach(({ row }) => {
          const startMin = parseTimeToMinutes(row?.startTime ?? d.startTime)
          const endMin = parseTimeToMinutes(row?.endTime ?? d.endTime)
          if (startMin !== null && endMin !== null && endMin > startMin) {
            hours += (endMin - startMin) / 60
          }
        })

        const current = events.get(String(eventId)) || {
          id: String(eventId),
          name,
          ln,
          importTotal: 0,
          pax: 0,
          hours: 0,
        }

        current.importTotal += Number.isFinite(importTotal) ? importTotal : 0
        current.pax += Number.isFinite(pax) ? pax : 0
        current.hours += Number.isFinite(hours) ? hours : 0
        current.name = current.name || name
        current.ln = current.ln || ln

        events.set(String(eventId), current)
      })
    }

    const data = Array.from(events.values())

    return NextResponse.json({
      success: true,
      data,
      options: {
        events: Array.from(eventOptions.entries()).map(([id, name]) => ({ id, name })),
        lines: Array.from(lineOptions).sort(),
      },
      warnings,
    })
  } catch (e: unknown) {
    console.error('[reports/financial] error:', e)
    const msg = e instanceof Error ? e.message : 'Error intern'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
