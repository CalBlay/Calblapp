export type SpacesSearchEvent = Record<string, unknown>

export type SpacesSearchRow = {
  fincaId?: string
  isOwn?: boolean
  finca: string
  dies: Array<{
    date: string
    events: SpacesSearchEvent[]
  }>
}

export function normalizeSpacesSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const STAGE_SEARCH_LABELS: Record<string, string> = {
  verd: 'confirmat confirmats',
  taronja: 'prereserva calentet',
  groc: 'pressupost pressupost enviat',
  lila: 'manual reserva manual',
}

function eventSearchText(event: SpacesSearchEvent): string {
  const stage = normalizeSpacesSearchText(event.stage ?? event.StageGroup)
  const values = [
    event.NomEvent,
    event.eventName,
    event.NomClient,
    event.Comercial,
    event.commercial,
    event.code,
    event.Code,
    event.service,
    event.Servei,
    event.ln,
    event.LN,
    event.observacions,
    event.Observacions,
    event.ObservacionsZoho,
    event.Comentari,
    event.Ubicacio,
    event.DataInici,
    event.date,
    event.dateEnd,
    event.startTime,
    event.HoraInici,
    event.NumPax,
    event.numPax,
    event.cancelled === true ? 'cancel lat cancel lada cancel·lat cancel·lada' : '',
    stage,
    STAGE_SEARCH_LABELS[stage],
  ]

  return normalizeSpacesSearchText(values.filter(Boolean).join(' '))
}

/** Cerca transversal, sense accents i per paraules, dins la setmana carregada. */
export function filterSpacesRows<T extends SpacesSearchRow>(rows: T[], query: string): T[] {
  const normalizedQuery = normalizeSpacesSearchText(query)
  if (!normalizedQuery) return rows

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  return rows.flatMap((row) => {
    const fincaText = normalizeSpacesSearchText(row.finca)
    const dies = row.dies.map((day) => ({
      ...day,
      events: day.events.filter((event) => {
        const haystack = `${fincaText} ${eventSearchText(event)}`
        return tokens.every((token) => haystack.includes(token))
      }),
    }))

    if (!dies.some((day) => day.events.length > 0)) return []
    return [{ ...row, dies }]
  }) as T[]
}

export function countSpacesSearchEvents(rows: SpacesSearchRow[]): number {
  return rows.reduce(
    (rowTotal, row) =>
      rowTotal + row.dies.reduce((dayTotal, day) => dayTotal + day.events.length, 0),
    0
  )
}
