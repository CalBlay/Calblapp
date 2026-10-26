import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { eventRecordHasAttachedDocuments } from '@/lib/events/eventDocumentPresence'
import { queryStageCollectionDocsByDateFieldInRange } from '@/lib/firestoreStageRangeQuery'
import {
  buildMenuTastingOccurrence,
  groupWeddingMenuTastingOccurrences,
  MENU_TASTING_CONFIGS,
} from '@/lib/calendar/menuTastingOccurrences'

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
  hasDocuments: boolean
  start: string
  end: string
  originalStart: string
  originalEnd: string
  day: string
  sourceEventIds?: string[]
  sourceEvents?: Array<{ id: string; name: string; code: string }>
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

  const regularEvents = (snap.docs || [])
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
        hasDocuments: eventRecordHasAttachedDocuments(d),
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

  const tastingDocsByConfig = await Promise.all(
    MENU_TASTING_CONFIGS.map(async (config) => {
      const docsByField = await Promise.all(
        config.dateFields.map((field) =>
          queryStageCollectionDocsByDateFieldInRange(
            db,
            'stage_verd',
            field,
            start,
            end
          )
        )
      )
      return Array.from(
        new Map(docsByField.flat().map((doc) => [doc.id, doc] as const)).values()
      )
    })
  )

  const tastingOccurrences: Record<string, unknown>[] = []
  tastingDocsByConfig.forEach((docs, configIndex) => {
    const config = MENU_TASTING_CONFIGS[configIndex]
    if (!config) return

    docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const rawLocation = String(data.Ubicacio || '')
      const location = rawLocation
        .split('(')[0]
        .split('/')[0]
        .replace(/^ZZRestaurant\s*/i, '')
        .replace(/^ZZ\s*/i, '')
        .trim()
      const rawSummary = String(data.NomEvent || '')
      const summary = rawSummary ? rawSummary.split('/')[0].trim() : '(Sense titol)'
      const lnLabel = String(data.LN || 'Altres')
      const occurrence = buildMenuTastingOccurrence({
        sourceEvent: {
          summary,
          location,
          lnKey: lnLabel.toLowerCase(),
          lnLabel,
          code: String(data.code || data.C_digo || ''),
          service: String(data.Servei || ''),
          commercial: String(data.Comercial || ''),
          hasDocuments: eventRecordHasAttachedDocuments(data),
        },
        sourceData: data,
        sourceEventId: doc.id,
        config,
        rangeStart: start,
        rangeEnd: end,
      })
      if (occurrence) tastingOccurrences.push(occurrence)
    })
  })

  const menuTastings = groupWeddingMenuTastingOccurrences(tastingOccurrences)
    .map((occurrence): QuadrantCalendarEvent | null => {
      const startIso = String(occurrence.start || '')
      const day = String(occurrence.day || startIso.slice(0, 10))
      if (!startIso || !day) return null
      const endIso = String(occurrence.end || startIso)
      const lnLabel = String(occurrence.lnLabel || 'Altres')
      const sourceEventIds = Array.isArray(occurrence.sourceEventIds)
        ? occurrence.sourceEventIds.map(String).filter(Boolean)
        : [String(occurrence.sourceEventId || '')].filter(Boolean)
      const sourceEvents = Array.isArray(occurrence.sourceEvents)
        ? occurrence.sourceEvents
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
              const row = item as Record<string, unknown>
              return {
                id: String(row.id || ''),
                name: String(row.name || ''),
                code: String(row.code || ''),
              }
            })
            .filter((item) => item.id)
        : undefined
      const tastingName = String(occurrence.sourceEventName || '').trim()

      return {
        id: String(occurrence.id || ''),
        summary: `PM_${tastingName || 'Prova de menú'}`,
        location: String(occurrence.location || ''),
        lnKey: String(occurrence.lnKey || lnLabel.toLowerCase()),
        lnLabel,
        service: String(
          occurrence.service || occurrence.servei || occurrence.Servei || 'Prova de menú'
        ),
        commercial: String(occurrence.commercial || ''),
        numPax: String(occurrence.numPax ?? ''),
        code: String(occurrence.code || ''),
        horaInici: String(occurrence.HoraInici || startIso.slice(11, 16)),
        horaFi: String(occurrence.HoraFi || ''),
        status: 'confirmed',
        hasDocuments: occurrence.hasDocuments === true,
        start: startIso,
        end: endIso,
        originalStart: day,
        originalEnd: day,
        day,
        sourceEventIds,
        sourceEvents,
      }
    })
    .filter((event): event is QuadrantCalendarEvent => event !== null)

  return [...regularEvents, ...menuTastings]
}
