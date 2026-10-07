export type MenuTastingOccurrenceType = 'menu_tasting_1' | 'menu_tasting_2'

type MenuTastingConfig = {
  dateFields: readonly MenuTastingDateField[]
  timeFields: readonly MenuTastingTimeField[]
  paxField: 'Comensals' | 'Comensals_2a'
  idSuffix: 'pm1' | 'pm2'
  titlePrefix: 'PM_' | 'PM2_'
  occurrenceType: MenuTastingOccurrenceType
}

export type MenuTastingDateField =
  | 'Data_1_Prova_Men'
  | 'Auto_data_1a_part'
  | 'Data_2a_Part_Tast'
  | 'Auto_Data_2a_Part'

type MenuTastingTimeField = 'Data_1_Prova_Men' | 'Hora'

export const MENU_TASTING_CONFIGS: readonly MenuTastingConfig[] = [
  {
    dateFields: ['Data_1_Prova_Men', 'Auto_data_1a_part'],
    timeFields: ['Data_1_Prova_Men'],
    paxField: 'Comensals',
    idSuffix: 'pm1',
    titlePrefix: 'PM_',
    occurrenceType: 'menu_tasting_1',
  },
  {
    dateFields: ['Data_2a_Part_Tast', 'Auto_Data_2a_Part'],
    timeFields: ['Hora'],
    paxField: 'Comensals_2a',
    idSuffix: 'pm2',
    titlePrefix: 'PM2_',
    occurrenceType: 'menu_tasting_2',
  },
] as const

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function menuTastingIsoDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const day = raw.trim().slice(0, 10)
  return ISO_DAY.test(day) ? day : null
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

  return {
    ...sourceEvent,
    id: `${sourceEventId}::${config.idSuffix}`,
    sourceEventId,
    calendarOccurrenceType: config.occurrenceType,
    summary: tastingSummary({ prefix: config.titlePrefix, sourceEvent, pax }),
    start: `${day}T${time}:00`,
    end: `${day}T${time}:00`,
    day,
    numPax: pax,
    HoraInici: time,
    HoraFi: '',
  }
}
