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

const comparable = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function isManualOverrideChange(
  field: string,
  incomingValue: unknown,
  previous: CalendarDocument
): boolean {
  let previousValue = previous[field]

  // Zoho tracta un esdeveniment sense DataFi com un esdeveniment d'un sol dia.
  // El modal envia DataFi = DataInici; no és un canvi manual si la data no varia.
  if (field === 'DataFi' && !comparable(previousValue)) {
    previousValue = previous.DataInici
  }

  return comparable(previousValue) !== comparable(incomingValue)
}

export function readManualOverrides(document?: CalendarDocument): Record<string, unknown> {
  const value = document?.manualOverrides
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

export function readManualOverrideValues(
  document?: CalendarDocument
): Record<string, unknown> {
  const value = document?.manualOverrideValues
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
  const overrideValues = readManualOverrideValues(existing)

  for (const field of CALENDAR_MANUAL_OVERRIDE_FIELDS) {
    if (overrides[field] !== true) continue

    // La copia separada evita perdre el valor manual si algun altre modul
    // escriu accidentalment sobre el camp principal sense esborrar la marca.
    if (Object.prototype.hasOwnProperty.call(overrideValues, field)) {
      result[field] = overrideValues[field]
    } else if (existing[field] !== undefined) {
      // Compatibilitat amb documents creats abans de manualOverrideValues.
      result[field] = existing[field]
    }
  }

  return result
}
