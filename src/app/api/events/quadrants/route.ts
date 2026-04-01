// file: src/app/api/events/quadrants/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

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
        const d = doc.data() as Record<string, any>

        // 📅 Dates d'inici/fi (YYYY-MM-DD)
        const startDateRaw = typeof d?.DataInici === 'string' ? d.DataInici.slice(0, 10) : ''
        const endDateRaw =
          typeof d?.DataFi === 'string' && d.DataFi.trim()
            ? d.DataFi.slice(0, 10)
            : startDateRaw

        // 📍 Ubicació neta
        const rawLocation = d?.Ubicacio || ''
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
        const horaInici =
          typeof rawHora === 'string' ? rawHora.trim().slice(0, 5) : ''

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

        const base = {
          id: doc.id,
          summary,
          location,
          lnKey: (d?.LN || 'Altres').toLowerCase(),
          lnLabel: d?.LN || 'Altres',
          service: d?.Servei || '',
          commercial: d?.Comercial || '',
          numPax: d?.NumPax || '',
          code: d?.code || d?.C_digo || '',
          horaInici,
          // estat simplificat
          status: d?.StageGroup?.toLowerCase().includes('confirmat')
            ? 'confirmed'
            : d?.StageGroup?.toLowerCase().includes('proposta')
            ? 'draft'
            : 'pending',
        }

        if (!base.code || !String(base.code).trim()) return []

        // 🔁 Generem una entrada per cada dia que dura l'esdeveniment
        return Array.from({ length: daySpan + 1 }, (_, i) => {
          const current = addDays(startDate, i)
          const dayIso = format(current, 'yyyy-MM-dd')
          const startISO = `${dayIso}T00:00:00.000Z`
          const endISO = `${dayIso}T00:00:00.000Z`

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


