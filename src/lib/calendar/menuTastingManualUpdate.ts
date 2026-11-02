import type { MenuTastingOccurrenceType } from '@/lib/calendar/menuTastingOccurrences'

export const MENU_TASTING_MANUAL_OVERRIDE_FIELDS = new Set([
  'MenuTasting1Date',
  'MenuTasting2Date',
  'MenuTastingCompanyDate',
  'Data_1_Prova_Men',
  'Data_2a_Part_Tast',
  'Data_i_hora',
  'Hora',
  'Ubicaci_1a_Part',
  'Ubicaci_2a_part',
  'Ubicaci',
  'Comensals',
  'Comensals_2a',
  'Pax',
])

type MenuTastingEditValues = {
  DataInici?: unknown
  HoraInici?: unknown
  Ubicacio?: unknown
  NumPax?: unknown
}

const asText = (value: unknown) => String(value ?? '').trim()

const asPax = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const dateTime = (day: string, time: string) =>
  day ? `${day}T${time || '12:00'}:00` : null

/** Tradueix els camps visibles del modal als camps Zoho de la PM concreta. */
export function buildMenuTastingManualUpdate(
  occurrenceType: MenuTastingOccurrenceType,
  values: MenuTastingEditValues,
  options: { includePax?: boolean } = {}
): Record<string, unknown> {
  const day = asText(values.DataInici).slice(0, 10)
  const time = asText(values.HoraInici).slice(0, 5)
  const location = asText(values.Ubicacio)
  const includePax = options.includePax !== false
  const pax = asPax(values.NumPax)

  if (occurrenceType === 'menu_tasting_1') {
    return {
      MenuTasting1Date: day || null,
      Data_1_Prova_Men: dateTime(day, time),
      Ubicaci_1a_Part: location || null,
      ...(includePax ? { Comensals: pax } : {}),
    }
  }

  if (occurrenceType === 'menu_tasting_2') {
    return {
      MenuTasting2Date: day || null,
      Data_2a_Part_Tast: day || null,
      Hora: time || null,
      Ubicaci_2a_part: location || null,
      ...(includePax ? { Comensals_2a: pax } : {}),
    }
  }

  return {
    MenuTastingCompanyDate: day || null,
    Data_i_hora: dateTime(day, time),
    Ubicaci: location || null,
    ...(includePax ? { Pax: pax } : {}),
  }
}
