export type MenuTastingOccurrenceType = 'menu_tasting_1' | 'menu_tasting_2'

type MenuTastingConfig = {
  dateField: 'Data_1_Prova_Men' | 'Data_2a_Part_Tast'
  paxField: 'Comensals' | 'Comensals_2a'
  idSuffix: 'pm1' | 'pm2'
  titlePrefix: 'PM_' | 'PM2_'
  occurrenceType: MenuTastingOccurrenceType
}

export const MENU_TASTING_CONFIGS: readonly MenuTastingConfig[] = [
  {
    dateField: 'Data_1_Prova_Men',
    paxField: 'Comensals',
    idSuffix: 'pm1',
    titlePrefix: 'PM_',
    occurrenceType: 'menu_tasting_1',
  },
  {
    dateField: 'Data_2a_Part_Tast',
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

function tastingTime(raw: unknown): string {
  if (typeof raw !== 'string') return '12:00'
  const match = raw.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return '12:00'
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return '12:00'
  return `${String(hour).padStart(2, '0')}:${match[2]}`
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
  const day = menuTastingIsoDay(sourceData[config.dateField])
  if (!day || day < rangeStart || day > rangeEnd) return null

  const time = tastingTime(sourceData.Hora)
  const baseTitle = String(sourceEvent.summary || '(Sense titol)').trim()

  return {
    ...sourceEvent,
    id: `${sourceEventId}::${config.idSuffix}`,
    sourceEventId,
    calendarOccurrenceType: config.occurrenceType,
    summary: `${config.titlePrefix}${baseTitle}`,
    start: `${day}T${time}:00`,
    end: `${day}T${time}:00`,
    day,
    numPax: sourceData[config.paxField] ?? null,
    HoraInici: time,
    HoraFi: '',
  }
}
