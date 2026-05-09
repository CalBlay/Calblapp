import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

const normHhMm = (raw: unknown): string => {
  if (raw == null || typeof raw !== 'string') return ''
  const s = raw.trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(s) ? s : ''
}

export type QuadrantCalendarEvent = {
  id: string
  summary: string
  location: string
  lnKey: string
  lnLabel: string
  service: string
  commercial: string
  numPax: string
  code: string
  horaInici: string
  horaFi: string
  status: 'confirmed' | 'draft' | 'pending'
  start: string
  end: string
  originalStart: string
  originalEnd: string
  day: string
}

export async function listQuadrantEventsInRange(
  start: string,
  end: string
): Promise<QuadrantCalendarEvent[]> {
  let snap: FirebaseFirestore.QuerySnapshot

  try {
    snap = await db
      .collection('stage_verd')
      .where('DataInici', '<=', end)
      .where('DataFi', '>=', start)
      .get()
  } catch (error) {
    console.warn(
      '[quadrantEvents] Query per rang no disponible, fallback a lectura completa',
      error
    )
    snap = await db.collection('stage_verd').get()
  }

  return (snap.docs || [])
    .flatMap((doc) => {
      const d = doc.data() as Record<string, unknown>
      const startDateRaw =
        typeof d?.DataInici === 'string' ? d.DataInici.slice(0, 10) : ''
      const endDateRaw =
        typeof d?.DataFi === 'string' && d.DataFi.trim()
          ? d.DataFi.slice(0, 10)
          : startDateRaw

      const rawLocation =
        typeof d?.Ubicacio === 'string' ? d.Ubicacio : String(d?.Ubicacio ?? '')
      const location = rawLocation
        .split('(')[0]
        .split('/')[0]
        .replace(/^ZZRestaurant\s*/i, '')
        .replace(/^ZZ\s*/i, '')
        .trim()
      const rawSummary = typeof d?.NomEvent === 'string' ? d.NomEvent : ''
      const summary = rawSummary ? rawSummary.split('/')[0].trim() : '(Sense titol)'
      const rawHora = d?.HoraInici ?? d?.horaInici ?? d?.Hora ?? d?.hora ?? ''
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

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return []
      }

      const daySpan = Math.max(0, differenceInCalendarDays(endDate, startDate))
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
        status: stageGroup.includes('confirmat')
          ? ('confirmed' as const)
          : stageGroup.includes('proposta')
          ? ('draft' as const)
          : ('pending' as const),
      }

      if (!base.code || !String(base.code).trim()) return []

      return Array.from({ length: daySpan + 1 }, (_, i) => {
        const current = addDays(startDate, i)
        const dayIso = format(current, 'yyyy-MM-dd')
        const isFirst = i === 0
        const isLast = i === daySpan
        const startT = isFirst ? horaInici || '00:00' : '00:00'
        const endT = isLast && horaFi ? horaFi : '23:59'

        return {
          ...base,
          start: `${dayIso}T${startT}:00`,
          end: `${dayIso}T${endT}:00`,
          originalStart: startDateRaw,
          originalEnd: endDateRaw || startDateRaw,
          day: dayIso,
        }
      })
    })
    .filter((ev) => ev.start && ev.day && ev.day >= start && ev.day <= end)
}
