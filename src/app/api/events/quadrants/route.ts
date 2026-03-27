// file: src/app/api/events/quadrants/route.ts
import { NextRequest, NextResponse } from 'next/server'
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

    const snap = await db.collection('stage_verd').get()

    const events = (snap.docs || [])
      .map((doc) => {
        const d = doc.data() as Record<string, any>

        console.log(
          `[events/quadrants] CODE → ${d?.code || d?.C_digo || '(sense codi)'} | NomEvent: ${d?.NomEvent}`
        )

        // 📅 Dates
        const startISO = d?.DataInici ? `${d.DataInici}T00:00:00.000Z` : null
        const endISO = d?.DataFi ? `${d.DataFi}T00:00:00.000Z` : startISO
        const day = startISO ? startISO.slice(0, 10) : ''

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

        return {
          id: doc.id,
          summary,
          start: startISO,
          end: endISO,
          day,
          location,
          lnKey: (d?.LN || 'Altres').toLowerCase(),
          lnLabel: d?.LN || 'Altres',
          service: d?.Servei || '',
          commercial: d?.Comercial || '',
          numPax: d?.NumPax || '',
          code: d?.code || d?.C_digo || '',

          horaInici,
          status: d?.StageGroup?.toLowerCase().includes('confirmat')
            ? 'confirmed'
            : d?.StageGroup?.toLowerCase().includes('proposta')
            ? 'draft'
            : 'pending',
        }
      })
      .filter((ev) => {
        // 🎯 Ha de tenir codi
        if (!ev.code || !ev.code.trim()) return false
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


