import { menuTastingIsoDay } from '@/lib/calendar/menuTastingOccurrences'

export type AdaMatchEvent = {
  codigo?: string
  descripcion?: string
  fechaInicio?: string
  codigoCliente?: string
  nombreCliente?: string
  codigoComercial?: string
  nombreComercial?: string
}

export type StageMatchEvent = {
  NomEvent?: string
  NomClient?: string
  Comercial?: string
  DataInici?: string
  MenuTasting1Date?: string
  MenuTasting2Date?: string
  MenuTastingCompanyDate?: string
  Data_1_Prova_Men?: string
  Data_2a_Part_Tast?: string
  Data_i_hora?: string
}

export type AdaMatchResult = {
  ada: AdaMatchEvent
  score: number
  fields: string[]
}

const unaccent = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normalizeEntity = (value?: string | null) =>
  unaccent(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const normalizeStageName = (value?: string | null) =>
  normalizeEntity(String(value || '').split('/')[0] || '')

const normalizeAdaDescription = (value?: string | null) => {
  let text = String(value || '').trim()
  text = text.replace(/^[A-Z]\s*\d{6}\s*/i, '')
  text = text.split(/\s+-\s+/)[0] || text
  return normalizeEntity(text)
}

const isoDay = (value?: string | null) => String(value || '').slice(0, 10)

export function stageAdaDateKeys(
  stage: StageMatchEvent,
  includeMenuTastingDates: boolean
): string[] {
  const values: Array<string | null> = [isoDay(stage.DataInici) || null]
  if (includeMenuTastingDates) {
    values.push(
      menuTastingIsoDay(stage.MenuTasting1Date),
      menuTastingIsoDay(stage.MenuTasting2Date),
      menuTastingIsoDay(stage.MenuTastingCompanyDate),
      menuTastingIsoDay(stage.Data_1_Prova_Men),
      menuTastingIsoDay(stage.Data_2a_Part_Tast),
      menuTastingIsoDay(stage.Data_i_hora)
    )
  }
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export function buildAdaMatch(
  stage: StageMatchEvent,
  ada: AdaMatchEvent,
  includeMenuTastingDates: boolean
): AdaMatchResult {
  const adaDate = isoDay(ada.fechaInicio)
  const dateMatches = Boolean(
    adaDate && stageAdaDateKeys(stage, includeMenuTastingDates).includes(adaDate)
  )

  const stageCommercial = normalizeEntity(stage.Comercial)
  const commercialMatches = Boolean(
    stageCommercial &&
      [ada.nombreComercial, ada.codigoComercial]
        .map(normalizeEntity)
        .some((value) => value === stageCommercial)
  )

  const stageClient = normalizeEntity(stage.NomClient)
  const clientMatches = Boolean(
    stageClient &&
      [ada.nombreCliente, ada.codigoCliente]
        .map(normalizeEntity)
        .some((value) => value === stageClient)
  )

  const stageName = normalizeStageName(stage.NomEvent)
  const adaName = normalizeAdaDescription(ada.descripcion)
  const nameMatches = Boolean(stageName && adaName && stageName === adaName)

  const fields: string[] = []
  if (dateMatches) fields.push('date')
  if (commercialMatches) fields.push('commercial')
  if (clientMatches) fields.push('client')
  if (nameMatches) fields.push('name')

  return { ada, score: fields.length, fields }
}
