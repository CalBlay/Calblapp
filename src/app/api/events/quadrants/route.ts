// file: src/app/api/events/quadrants/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const normHhMm = (raw: unknown): string => {
  if (raw == null || typeof raw !== 'string') return ''
  const s = raw.trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(s) ? s : ''
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten start i end' }, { status: 400 })
    }

    console.log(`[events/quadrants] 🔍 Llegint Firestore: stage_verd`, { start, end })

    let snap: FirebaseFirestore.QuerySnapshot
    try {
      snap = await db
        .collection('stage_verd')
        .where('DataInici', '<=', `${end}T23:59:59`)
        .where('DataFi', '>=', `${start}T00:00:00`)
        .get()
    } catch (error) {
      console.warn('[events/quadrants] Query per rang no disponible, fallback a lectura completa', error)
      snap = await db.collection('stage_verd').get()
    }

    const events = (snap.docs || [])
      .flatMap((doc) => {
        const d = doc.data() as Record<string, unknown>

        // 📅 Dates d'inici/fi (YYYY-MM-DD)
        const startDateRaw = typeof d?.DataInici === 'string' ? d.DataInici.slice(0, 10) : ''
        const endDateRaw =
          typeof d?.DataFi === 'string' && d.DataFi.trim()
            ? d.DataFi.slice(0, 10)
            : startDateRaw

        // 📍 Ubicació neta
        const rawLocation = typeof d?.Ubicacio === 'string' ? d.Ubicacio : String(d?.Ubicacio ?? '')
        const location = rawLocation
          .split('(')[0]
          .split('/')[0]
          .replace(/^ZZRestaurant\s*/i, '')
          .replace(/^ZZ\s*/i, '')
          .trim()
        const rawSummary =
          typeof d?.NomEvent === 'string' ? d.NomEvent : ''
        const summary = rawSummary
          ? rawSummary.split('/')[0].trim()
          : '(Sense titol)'
        const rawHora =
          d?.HoraInici ?? d?.horaInici ?? d?.Hora ?? d?.hora ?? ''
        const horaInici = normHhMm(rawHora)
        const horaFi = normHhMm(d?.HoraFi ?? d?.horaFi ?? '')

        if (!startDateRaw) return []
        if (startDateRaw > end || endDateRaw < start) return []

        let startDate: Date
        let endDate: Date

        try {
          startDate = parseISO(startDateRaw)
          endDate = parseISO(endDateRaw || startDateRaw)
        } catch {
          return []
        }

        if (
          Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime())
        ) {
          return []
        }

        const daySpan = Math.max(
          0,
          differenceInCalendarDays(endDate, startDate)
        )

        const lnRaw = d?.LN != null && d.LN !== '' ? String(d.LN) : 'Altres'
        const stageGroup =
          typeof d?.StageGroup === 'string' ? d.StageGroup.toLowerCase() : ''
        const base = {
          id: doc.id,
          summary,
          location,
          lnKey: lnRaw.toLowerCase(),
          lnLabel: lnRaw,
          service: String(d?.Servei ?? ''),
          commercial: String(d?.Comercial ?? ''),
          numPax: String(d?.NumPax ?? ''),
          code: String(d?.code ?? d?.C_digo ?? ''),
          horaInici,
          horaFi,
          // estat simplificat
          status: stageGroup.includes('confirmat')
            ? 'confirmed'
            : stageGroup.includes('proposta')
            ? 'draft'
            : 'pending',
        }

        if (!base.code || !String(base.code).trim()) return []

        // 🔁 Generem una entrada per cada dia que dura l'esdeveniment
        return Array.from({ length: daySpan + 1 }, (_, i) => {
          const current = addDays(startDate, i)
          const dayIso = format(current, 'yyyy-MM-dd')
          const isFirst = i === 0
          const isLast = i === daySpan
          const startT = isFirst ? horaInici || '00:00' : '00:00'
          const endT = isLast && horaFi ? horaFi : '23:59'
          const startISO = `${dayIso}T${startT}:00`
          const endISO = `${dayIso}T${endT}:00`

          return {
            ...base,
            start: startISO,
            end: endISO,
            originalStart: startDateRaw,
            originalEnd: endDateRaw || startDateRaw,
            day: dayIso,
          }
        })
      })
      .filter((ev) => {
        // 🎯 Ha de tenir data d'inici
        if (!ev.start || !ev.day) return false

        // 🎯 Filtre pel rang [start, end] (YYYY-MM-DD)
        return ev.day >= start && ev.day <= end
      })

    console.log(`[events/quadrants] 📦 Total trobats dins rang: ${events.length}`)

    return NextResponse.json({ events }, { status: 200 })
  } catch (err: unknown) {
    console.error('[events/quadrants] ❌ Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


