export const CALENDAR_MANUAL_OVERRIDE_FIELDS = new Set([
  'LN',
  'code',
  'NomEvent',
  'DataInici',
  'DataFi',
  'HoraInici',
  'HoraFi',
  'NumPax',
  'Ubicacio',
  'Servei',
  'Comercial',
  'ComercialIntern',
  'Responsable',
])

type CalendarDocument = Record<string, unknown>

export function readManualOverrides(document?: CalendarDocument): Record<string, unknown> {
  const value = document?.manualOverrides
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

export function hasManualDateOverride(document?: CalendarDocument): boolean {
  const overrides = readManualOverrides(document)
  return overrides.DataInici === true || overrides.DataFi === true
}

export function preserveManualCalendarOverrides(
  incoming: CalendarDocument,
  existing?: CalendarDocument
): CalendarDocument {
  if (!existing) return incoming

  const result = { ...incoming }
  const overrides = readManualOverrides(existing)

  for (const field of CALENDAR_MANUAL_OVERRIDE_FIELDS) {
    if (overrides[field] === true && existing[field] !== undefined) {
      result[field] = existing[field]
    }
  }

  return result
}
