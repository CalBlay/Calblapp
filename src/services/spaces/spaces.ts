import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { SPACES_MANUAL_RESERVES_COLLECTION } from '@/lib/spacesPermissions'
import { manualIdToCreatedAtIso } from '@/services/spaces/manualReserveZohoMatch'
import type { Timestamp } from 'firebase-admin/firestore'
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'

function normalizeText(value: unknown): string {
  return (value || '').toString().trim()
}

function toFilterArray(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .map((item) => normalizeText(item).toLowerCase())
    .filter((item) => item && item !== 'all')
}

function matchesAnyFilter(value: string, filters: string[]): boolean {
  if (filters.length === 0) return true
  const normalizedValue = normalizeText(value).toLowerCase()
  return filters.some((filter) => normalizedValue.includes(filter))
}

/** LN filter: empty/missing LN still passes (manual reserves, legacy rows). */
function matchesLnFilter(ln: string, filters: string[]): boolean {
  if (filters.length === 0) return true
  const normalizedValue = normalizeText(ln).toLowerCase()
  if (!normalizedValue) return true
  return filters.some(
    (filter) =>
      normalizedValue.includes(filter) || filter.includes(normalizedValue)
  )
}

function isWedding(ln?: string): boolean {
  const normalized = ln?.toLowerCase() || ''
  return normalized.includes('casament') || normalized.includes('casaments')
}

function isCorporateOrGroups(ln?: string): boolean {
  const normalized = ln?.toLowerCase() || ''
  return normalized.includes('empresa') || normalized.includes('grups')
}

function isRestaurant(ln?: string): boolean {
  return (ln?.toLowerCase() || '').includes('restaurant')
}

function parseHourToMinutes(hour?: string): number | null {
  if (!hour) return null
  const [hh, mm] = hour.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}

function diffHours(a: number, b: number) {
  return Math.abs(a - b) / 60
}

function toCreatedAtMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (value && typeof value === 'object' && 'toDate' in (value as object)) {
    const date = (value as { toDate?: () => Date }).toDate?.()
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
  }
  return 0
}

/** Milliseconds for ordering events in a cell (oldest first). */
function eventCreatedAtMs(
  data: Record<string, unknown>,
  docId: string,
  firestoreCreateTime?: Timestamp
): number {
  const mergedFromManualId = data.mergedFromManualId
    ? String(data.mergedFromManualId)
    : ''
  if (mergedFromManualId) {
    const fromManualId = manualIdToCreatedAtIso(mergedFromManualId)
    if (fromManualId) {
      const ms = new Date(fromManualId).getTime()
      if (!Number.isNaN(ms)) return ms
    }
    if (firestoreCreateTime) return firestoreCreateTime.toMillis()
    return Number.MAX_SAFE_INTEGER
  }

  const fromCreatedAt = toCreatedAtMs(data.createdAt)
  if (fromCreatedAt > 0) return fromCreatedAt

  const fromDataPeticio = toCreatedAtMs(data.DataPeticio)
  if (fromDataPeticio > 0) return fromDataPeticio

  if (firestoreCreateTime) return firestoreCreateTime.toMillis()

  const manualMatch = /^spaces_manual_(\d+)$/.exec(docId)
  if (manualMatch) return Number(manualMatch[1])

  const legacyManualMatch = /^manual_(\d+)$/.exec(docId)
  if (legacyManualMatch) return Number(legacyManualMatch[1])

  return Number.MAX_SAFE_INTEGER
}

interface RawEvent {
  id: string
  finca: string
  date: string
  dateEnd?: string
  ln?: string
  stage: 'verd' | 'taronja' | 'groc' | 'lila'
  isManual?: boolean
  eventName: string
  commercial: string
  numPax: number
  startTime?: string
  code?: string
  service?: string
  observacions?: string
  createdAtMs: number
  createdBy?: string
  createdAt?: string
  NomClient?: string
  Comercial?: string
  Comentari?: string
  Ubicacio?: string
  DataInici?: string
}

interface EventOut extends RawEvent {
  discarded?: boolean
  reason?: string
  warning?: boolean
}

interface DayOut {
  date: string
  events: EventOut[]
}

interface SpaceRow {
  fincaId?: string
  finca: string
  dies: DayOut[]
}

export interface SpacesResult {
  data: SpaceRow[]
  totalPaxPerDia: number[]
}

export async function getSpacesByWeek(
  month: number,
  year: number,
  fincaFilter: string | string[] = '',
  comercialFilter: string | string[] = '',
  baseDate?: string,
  stage: string | string[] = 'all',
  lnFilter: string | string[] = ''
): Promise<SpacesResult> {
  try {
    const fincaFilters = toFilterArray(fincaFilter)
    const comercialFilters = toFilterArray(comercialFilter)
    const stageFilters = toFilterArray(stage)
    const lnFilters = toFilterArray(lnFilter)

    const base = baseDate ? new Date(baseDate) : new Date(year, month)
    const startRange = startOfWeek(base, { weekStartsOn: 1 })
    const endRange = endOfWeek(base, { weekStartsOn: 1 })
    const startStr = format(startRange, 'yyyy-MM-dd')
    const endStr = format(endRange, 'yyyy-MM-dd')

    const collections =
      stageFilters.length === 0
        ? ['stage_verd', 'stage_taronja', 'stage_groc']
        : Array.from(
            new Set(
              stageFilters
                .map((value) => {
                  switch (value) {
                    case 'confirmat':
                      return 'stage_verd'
                    case 'pressupost':
                      return 'stage_groc'
                    case 'calentet':
                      return 'stage_taronja'
                    default:
                      return null
                  }
                })
                .filter(Boolean)
            )
          ) as string[]

    const finquesSnap = await db.collection('finques').get()
    const fincaIdMap = new Map<string, string>()

    finquesSnap.forEach((doc) => {
      const data = doc.data() as { nom?: string }
      const name = normalizeText(data.nom || doc.id)
      if (!name) return
      fincaIdMap.set(name.toLowerCase(), doc.id)
    })

    const rawEvents: RawEvent[] = []

    for (const collection of collections) {
      const snap = await db
        .collection(collection)
        .where('DataInici', '<=', endStr)
        .where('DataFi', '>=', startStr)
        .get()

      snap.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>
        const createdAtMs = eventCreatedAtMs(data, doc.id, doc.createTime)
        let start = data.DataInici
        const endRaw = data.DataFinal || data.DataFi || data.DataInici

        if (start?.toDate) start = start.toDate()
        else if (typeof start === 'string') start = new Date(start)

        let end = endRaw
        if (endRaw?.toDate) end = endRaw.toDate()
        else if (typeof endRaw === 'string') end = new Date(endRaw)

        if (!(start instanceof Date) || Number.isNaN(start.getTime())) return
        if (!(end instanceof Date) || Number.isNaN(end.getTime())) return

        const finca = normalizeText((data.Ubicacio || '').split('(')[0])
        const commercial = normalizeText(data.Comercial)
        const ln = normalizeText(data.LN)

        if (
          !matchesAnyFilter(finca, fincaFilters) ||
          !matchesAnyFilter(commercial, comercialFilters) ||
          !matchesLnFilter(ln, lnFilters)
        ) {
          return
        }

        rawEvents.push({
          id: doc.id,
          finca,
          date: format(start, 'yyyy-MM-dd'),
          dateEnd: format(end, 'yyyy-MM-dd'),
          ln,
          stage: collection.replace('stage_', '') as RawEvent['stage'],
          eventName: normalizeText(data.NomEvent),
          commercial,
          numPax: Number(data.NumPax) || 0,
          startTime: normalizeText(data.HoraInici),
          code: data.code
            ? normalizeText(data.code)
            : data.Code
              ? normalizeText(data.Code)
              : '',
          service: normalizeText(data.Servei || data.service || ''),
          observacions: normalizeText(
            data.ObservacionsZoho ||
              data.observacionsZoho ||
              data.Observacions ||
              data.observacions ||
              ''
          ),
          createdAtMs,
        })
      })
    }

    if (shouldIncludeManualReserves(stageFilters)) {
      try {
        const manualSnap = await db
          .collection(SPACES_MANUAL_RESERVES_COLLECTION)
          .where('DataInici', '<=', endStr)
          .where('DataFi', '>=', startStr)
          .get()

        manualSnap.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>
          const createdAtMs = eventCreatedAtMs(data, doc.id, doc.createTime)
          const dataInici = normalizeText(data.DataInici)
          const dataFi = normalizeText(data.DataFi || data.DataInici)
          if (!dataInici) return

          const finca = normalizeText((data.Ubicacio || '').toString().split('(')[0])
          const commercial = normalizeText(data.Comercial)
          const clientName = normalizeText(data.NomClient)

          if (
            !matchesAnyFilter(finca, fincaFilters) ||
            !matchesAnyFilter(commercial, comercialFilters)
          ) {
            return
          }

          const comentari = normalizeText(data.Comentari || data.comentari)
          const ubicacioRaw = normalizeText(data.Ubicacio)

          rawEvents.push({
            id: doc.id,
            finca,
            date: dataInici,
            dateEnd: dataFi || dataInici,
            ln: '',
            stage: 'lila',
            isManual: true,
            eventName: clientName,
            NomEvent: clientName,
            NomClient: clientName,
            commercial,
            Comercial: commercial,
            numPax: 0,
            code: '',
            service: '',
            observacions: comentari,
            Comentari: comentari,
            Ubicacio: ubicacioRaw,
            DataInici: dataInici,
            createdBy: normalizeText(data.createdBy),
            createdAt:
              typeof data.createdAt === 'string'
                ? data.createdAt
                : data.createdAt && typeof data.createdAt === 'object' && 'toDate' in (data.createdAt as object)
                  ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
                  : undefined,
            createdAtMs,
          })
        })
      } catch (manualErr) {
        console.error('[getSpacesByWeek] manual reserves query failed', manualErr)
      }
    }

    const expanded: RawEvent[] = []
    for (const event of rawEvents) {
      const start = parseISO(event.date)
      const end = parseISO(event.dateEnd || event.date)
      for (let day = start; day <= end; day = addDays(day, 1)) {
        if (day < startRange || day > endRange) continue
        expanded.push({ ...event, date: format(day, 'yyyy-MM-dd') })
      }
    }

    const byFinca = new Map<string, Map<string, RawEvent[]>>()
    for (const event of expanded) {
      if (!byFinca.has(event.finca)) byFinca.set(event.finca, new Map())
      const byDay = byFinca.get(event.finca)!
      if (!byDay.has(event.date)) byDay.set(event.date, [])
      byDay.get(event.date)!.push(event)
    }

    const result: SpaceRow[] = []
    const totalPaxPerDia = Array(7).fill(0)

    for (const finca of byFinca.keys()) {
      if (!matchesAnyFilter(finca, fincaFilters)) continue
      const days = byFinca.get(finca) || new Map<string, RawEvent[]>()
      const dies: DayOut[] = Array.from({ length: 7 }, (_, index) => ({
        date: format(addDays(startRange, index), 'yyyy-MM-dd'),
        events: [],
      }))

      for (let index = 0; index < 7; index += 1) {
        const dateISO = dies[index].date
        const events = days.get(dateISO) || []
        if (events.length === 0) continue

        const eventsOut: EventOut[] = []

        for (const event of events) {
          let warning = false
          let reason = ''

          const weddingGreen = events.find(
            (candidate) => candidate.stage === 'verd' && isWedding(candidate.ln)
          )

          if (weddingGreen && event.id !== weddingGreen.id) {
            warning = true
            reason = 'Casament verd en el mateix dia i finca'
          }

          if (event.stage === 'verd' && isRestaurant(event.ln)) {
            const totalPax = events
              .filter(
                (candidate) =>
                  candidate.stage === 'verd' && isRestaurant(candidate.ln)
              )
              .reduce((sum, candidate) => sum + (candidate.numPax || 0), 0)

            if (totalPax > 1000) {
              warning = true
              reason = 'Possible sobrepas de 1000 pax Restaurant verd'
            }
          }

          if (event.stage === 'verd' && isCorporateOrGroups(event.ln)) {
            const eventMinutes = parseHourToMinutes(event.startTime)
            if (eventMinutes != null) {
              const other = events.find((candidate) => {
                if (candidate.id === event.id) return false
                const candidateMinutes = parseHourToMinutes(candidate.startTime)
                return (
                  candidate.stage === 'verd' &&
                  isCorporateOrGroups(candidate.ln) &&
                  candidateMinutes != null &&
                  diffHours(candidateMinutes, eventMinutes) <= 8
                )
              })

              if (other) {
                warning = true
                reason = 'Solapament horari <=8h amb un altre verd Empresa/Grups'
              }
            }
          }

          eventsOut.push({
            ...event,
            warning: event.stage === 'lila' ? false : warning,
            reason: event.stage === 'lila' ? '' : reason,
          })
          if (event.stage !== 'lila') {
            totalPaxPerDia[index] += event.numPax || 0
          }
        }

        eventsOut.sort((a, b) => {
          const byCreated = a.createdAtMs - b.createdAtMs
          if (byCreated !== 0) return byCreated
          return a.id.localeCompare(b.id)
        })
        dies[index].events = eventsOut
      }

      result.push({
        finca,
        fincaId: fincaIdMap.get(finca.toLowerCase()),
        dies,
      })
    }

    result.sort((a, b) => a.finca.localeCompare(b.finca, 'ca', { sensitivity: 'base' }))

    return { data: result, totalPaxPerDia }
  } catch (error) {
    console.error('[getSpacesByWeek]', error)
    return { data: [], totalPaxPerDia: Array(7).fill(0) }
  }
}

export type Stage = 'verd' | 'taronja' | 'groc' | 'lila'

function shouldIncludeManualReserves(stageFilters: string[]): boolean {
  if (stageFilters.length === 0) return true
  return stageFilters.includes('manual') || stageFilters.includes('reserva_manual')
}
