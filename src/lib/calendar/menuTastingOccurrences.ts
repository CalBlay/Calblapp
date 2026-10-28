export type MenuTastingOccurrenceType =
  | 'menu_tasting_1'
  | 'menu_tasting_2'
  | 'menu_tasting_company'

type MenuTastingConfig = {
  dateFields: readonly MenuTastingDateField[]
  timeFields: readonly MenuTastingTimeField[]
  paxField: 'Comensals' | 'Comensals_2a' | 'Pax'
  idSuffix: 'pm1' | 'pm2' | 'pme'
  titlePrefix: 'PM_' | 'PM2_'
  occurrenceType: MenuTastingOccurrenceType
  locationFields?: readonly MenuTastingLocationField[]
  confirmationField?: 'confirmar_prova'
  includeCodeInTitle?: boolean
}

export type MenuTastingDateField =
  | 'MenuTasting1Date'
  | 'MenuTasting2Date'
  | 'MenuTastingCompanyDate'
  | 'Data_1_Prova_Men'
  | 'Auto_data_1a_part'
  | 'Data_2a_Part_Tast'
  | 'Auto_Data_2a_Part'
  | 'Data_i_hora'

type MenuTastingTimeField = 'Data_1_Prova_Men' | 'Hora' | 'Data_i_hora'
type MenuTastingLocationField =
  | 'Ubicaci_1a_Part'
  | 'Ubicaci_2a_part'
  | 'Ubicaci'
  | 'Ubiaci'

export const MENU_TASTING_CONFIGS: readonly MenuTastingConfig[] = [
  {
    dateFields: ['MenuTasting1Date', 'Data_1_Prova_Men', 'Auto_data_1a_part'],
    timeFields: ['Data_1_Prova_Men'],
    paxField: 'Comensals',
    idSuffix: 'pm1',
    titlePrefix: 'PM_',
    occurrenceType: 'menu_tasting_1',
    locationFields: ['Ubicaci_1a_Part'],
  },
  {
    dateFields: ['MenuTasting2Date', 'Data_2a_Part_Tast', 'Auto_Data_2a_Part'],
    timeFields: ['Hora'],
    paxField: 'Comensals_2a',
    idSuffix: 'pm2',
    titlePrefix: 'PM2_',
    occurrenceType: 'menu_tasting_2',
    locationFields: ['Ubicaci_2a_part'],
  },
  {
    dateFields: ['MenuTastingCompanyDate', 'Data_i_hora'],
    timeFields: ['Data_i_hora'],
    paxField: 'Pax',
    idSuffix: 'pme',
    titlePrefix: 'PM_',
    occurrenceType: 'menu_tasting_company',
    locationFields: ['Ubicaci', 'Ubiaci'],
    confirmationField: 'confirmar_prova',
    includeCodeInTitle: false,
  },
] as const

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function validIsoDay(year: number, month: number, day: number): string | null {
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${candidate}T00:00:00.000Z`)
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
    ? candidate
    : null
}

export function menuTastingIsoDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  const iso = value.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?!\d)/)
  if (iso) return validIsoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  // Zoho retorna alguns camps de Casaments amb el text visible inclòs,
  // p. ex. "Dissabte (09.01.2027 - 12:30 h)".
  const localized = value.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/)
  if (localized) {
    return validIsoDay(
      Number(localized[3]),
      Number(localized[2]),
      Number(localized[1])
    )
  }

  return null
}

function tastingTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

function isConfirmed(raw: unknown): boolean {
  if (raw === true || raw === 1) return true
  if (typeof raw !== 'string') return false
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  return ['1', 'true', 'si', 'yes', 'confirmat', 'confirmada'].includes(normalized)
}

function tastingSummary({
  prefix,
  sourceEvent,
  pax,
}: {
  prefix: MenuTastingConfig['titlePrefix']
  sourceEvent: Record<string, unknown>
  pax: unknown
}): string {
  const eventName = String(sourceEvent.summary || '(Sense titol)').trim()
  const code = String(sourceEvent.code || '').trim()
  const location = String(sourceEvent.location || '').trim()
  const paxText = pax == null || String(pax).trim() === '' ? '' : `${String(pax).trim()} pax`

  return [
    `${prefix}${code ? `${code} · ` : ''}${eventName}`,
    location,
    paxText,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function buildMenuTastingOccurrence({
  sourceEvent,
  sourceData,
  sourceEventId,
  config,
  rangeStart,
  rangeEnd,
}: {
  sourceEvent: Record<string, unknown>
  sourceData: Record<string, unknown>
  sourceEventId: string
  config: MenuTastingConfig
  rangeStart: string
  rangeEnd: string
}): Record<string, unknown> | null {
  const day = config.dateFields
    .map((field) => menuTastingIsoDay(sourceData[field]))
    .find((value): value is string => value !== null) ?? null
  if (!day || day < rangeStart || day > rangeEnd) return null

  const time = config.timeFields
    .map((field) => tastingTime(sourceData[field]))
    .find((value): value is string => value !== null) ?? '12:00'
  const pax = sourceData[config.paxField] ?? null
  const configuredLocation = (config.locationFields || [])
    .map((field) => String(sourceData[field] ?? '').trim())
    .find(Boolean)
    ?.replace(/\s*\([^)]+\)\s*$/, '')
    .trim() || ''
  const occurrenceSourceEvent = configuredLocation
    ? { ...sourceEvent, location: configuredLocation }
    : sourceEvent
  const summarySourceEvent = config.includeCodeInTitle === false
    ? { ...occurrenceSourceEvent, code: '' }
    : occurrenceSourceEvent

  return {
    ...occurrenceSourceEvent,
    id: `${sourceEventId}::${config.idSuffix}`,
    sourceEventId,
    sourceEventName: String(sourceEvent.summary || '').trim(),
    menuTastingConfirmed: config.confirmationField
      ? isConfirmed(sourceData[config.confirmationField])
      : true,
    calendarOccurrenceType: config.occurrenceType,
    summary: tastingSummary({
      prefix: config.titlePrefix,
      sourceEvent: summarySourceEvent,
      pax,
    }),
    start: `${day}T${time}:00`,
    end: `${day}T${time}:00`,
    day,
    numPax: pax,
    HoraInici: time,
    HoraFi: '',
  }
}

type TastingFile = {
  key: string
  url: string
  name?: string
  source?: string
}

const weddingOccurrenceTypes = new Set<MenuTastingOccurrenceType>([
  'menu_tasting_1',
  'menu_tasting_2',
])

const tastingGroupKeyPart = (raw: unknown) =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const uniqueStrings = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))

const weddingTastingGroupId = (occurrence: Record<string, unknown>) => {
  const slot = String(occurrence.start || '').replace(/[^0-9]/g, '') || 'sense-data'
  const location = tastingGroupKeyPart(occurrence.location)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sense-ubicacio'
  return `pmw-${slot}-${location}`
}

const occurrenceFiles = (occurrence: Record<string, unknown>): TastingFile[] =>
  Array.isArray(occurrence.files)
    ? occurrence.files.filter(
        (file): file is TastingFile =>
          Boolean(
            file &&
              typeof file === 'object' &&
              typeof (file as TastingFile).key === 'string' &&
              typeof (file as TastingFile).url === 'string'
          )
      )
    : []

const occurrenceService = (occurrence: Record<string, unknown>) =>
  String(
    occurrence.Servei ?? occurrence.servei ?? occurrence.service ?? ''
  ).trim()

function groupedServiceBreakdown(items: Record<string, unknown>[]) {
  const byService = new Map<
    string,
    { service: string; pax: number; hasPax: boolean }
  >()

  for (const item of items) {
    const service = occurrenceService(item)
    if (!service) continue
    const key = tastingGroupKeyPart(service)
    const numericPax = Number(item.numPax)
    const hasPax = Number.isFinite(numericPax)
    const current = byService.get(key) || { service, pax: 0, hasPax: false }
    current.pax += hasPax ? numericPax : 0
    current.hasPax = current.hasPax || hasPax
    byService.set(key, current)
  }

  return Array.from(byService.values()).map(({ service, pax, hasPax }) => ({
    service,
    pax: hasPax ? pax : null,
  }))
}

/** Agrupa les proves de Casaments simultànies a la mateixa ubicació. */
export function groupWeddingMenuTastingOccurrences(
  occurrences: Record<string, unknown>[]
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>()
  const others: Record<string, unknown>[] = []

  for (const occurrence of occurrences) {
    const type = occurrence.calendarOccurrenceType as MenuTastingOccurrenceType | undefined
    if (!type || !weddingOccurrenceTypes.has(type)) {
      others.push(occurrence)
      continue
    }

    const key = [
      String(occurrence.start || ''),
      tastingGroupKeyPart(occurrence.location),
    ].join('::')
    const current = groups.get(key) || []
    current.push(occurrence)
    groups.set(key, current)
  }

  const grouped = Array.from(groups.values()).map((items) => {
    const first = items[0]
    const eventNames = uniqueStrings(items.map((item) => item.sourceEventName))
    const eventIds = uniqueStrings(items.map((item) => item.sourceEventId))
    const codes = uniqueStrings(items.map((item) => item.code))
    const serviceBreakdown = groupedServiceBreakdown(items)
    const combinedService = serviceBreakdown
      .map(({ service, pax }) => `${service}${pax === null ? '' : `: ${pax} pax`}`)
      .join(' / ')
    const sourceEvents = items.map((item) => ({
      id: String(item.sourceEventId || ''),
      name: String(item.sourceEventName || ''),
      code: String(item.code || ''),
    })).filter((event) => event.id)
    if (items.length === 1) {
      return {
        ...first,
        id: weddingTastingGroupId(first),
        sourceEventIds: eventIds,
        sourceEvents,
      }
    }

    const totalPax = items.reduce((sum, item) => {
      const value = Number(item.numPax)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const location = String(first.location || '').trim()
    const files = items.flatMap((item) => {
      const eventName = String(item.sourceEventName || '').trim()
      return occurrenceFiles(item).map((file) => ({
        ...file,
        name: [eventName, file.name || file.key].filter(Boolean).join(' · '),
      }))
    })
    const summary = [
      `PM_${eventNames.join(' + ') || 'Prova de menú'}`,
      location,
      `${totalPax} pax`,
    ]
      .filter(Boolean)
      .join(' · ')

    return {
      ...first,
      id: weddingTastingGroupId(first),
      sourceEventId: eventIds[0] || first.sourceEventId,
      sourceEventIds: eventIds,
      sourceEvents,
      sourceEventName: eventNames.join(' + '),
      code: codes.join(', '),
      Servei: combinedService,
      servei: combinedService,
      service: combinedService,
      serviceBreakdown,
      summary,
      numPax: totalPax,
      files,
      hasDocuments: items.some((item) => item.hasDocuments === true),
      hasInvalidZohoDocuments: items.some(
        (item) => item.hasInvalidZohoDocuments === true
      ),
      groupedMenuTasting: true,
    }
  })

  return [...others, ...grouped]
}
