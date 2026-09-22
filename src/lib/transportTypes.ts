export const TRANSPORT_TYPE_OPTIONS = [
  { value: 'comercial', label: 'Comercial', serviceIntervalKm: 20000 },
  { value: 'transport', label: 'Transport', serviceIntervalKm: 20000 },
  { value: 'furgonetaPetita', label: 'Furgoneta petita', serviceIntervalKm: 20000 },
  { value: 'furgonetaManteniment', label: 'Furgoneta manteniment', serviceIntervalKm: 20000 },
  { value: 'furgonetaMitjana', label: 'Furgoneta mitjana', serviceIntervalKm: 20000 },
  { value: 'furgonetaGran', label: 'Furgoneta gran', serviceIntervalKm: 20000 },
  { value: 'camioPPlataforma', label: 'Camio P.Plataforma', serviceIntervalKm: 20000 },
  {
    value: 'camioGran',
    label: 'Camio Gran',
    requiresLargeTruckLicense: true,
    tachographRequired: true,
    serviceIntervalKm: 40000,
  },
  {
    value: 'camioPPlataformaFred',
    label: 'Camio P.Plataforma Fred',
    refrigeratedByDefault: true,
    serviceIntervalKm: 20000,
  },
  {
    value: 'camioGranFred',
    label: 'Camio Gran Fred',
    requiresLargeTruckLicense: true,
    refrigeratedByDefault: true,
    tachographRequired: true,
    serviceIntervalKm: 40000,
  },
] as const

export type TransportType = string

export type TransportTypeDefinition = {
  value: string
  label: string
  active: boolean
  sortOrder: number
  requiresLargeTruckLicense: boolean
  refrigeratedByDefault: boolean
  tachographRequired: boolean
  serviceIntervalKm: number
  fromDefaults?: boolean
}

export const DEFAULT_TRANSPORT_TYPE_DEFINITIONS: TransportTypeDefinition[] =
  TRANSPORT_TYPE_OPTIONS.map((option, index) => ({
    value: option.value,
    label: option.label,
    active: true,
    sortOrder: index * 10,
    requiresLargeTruckLicense:
      'requiresLargeTruckLicense' in option && option.requiresLargeTruckLicense === true,
    refrigeratedByDefault:
      'refrigeratedByDefault' in option && option.refrigeratedByDefault === true,
    tachographRequired: 'tachographRequired' in option && option.tachographRequired === true,
    serviceIntervalKm: option.serviceIntervalKm,
    fromDefaults: true,
  }))

export const TRANSPORT_TYPE_LABELS: Record<string, string> =
  TRANSPORT_TYPE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label
    return acc
  }, {} as Record<string, string>)

const normalizeBase = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')

/** Matrícula normalitzada per coincidir catàleg, quadrants i assignacions (ignora guions, espais i caixa). */
export function normalizeTransportPlateKey(raw?: string | null): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

const TRANSPORT_TYPE_ALIASES: Record<string, TransportType> = {
  comercial: 'comercial',
  transport: 'transport',
  furgonetapetita: 'furgonetaPetita',
  furgonetamanteniment: 'furgonetaManteniment',
  furgonetamitjana: 'furgonetaMitjana',
  furgonetagran: 'furgonetaGran',
  furgoneta: 'furgonetaMitjana',
  camiopplataforma: 'camioPPlataforma',
  camiogran: 'camioGran',
  camiopplataformafred: 'camioPPlataformaFred',
  camiogranfred: 'camioGranFred',
  camiopetit: 'transport',
}

export const normalizeTransportType = (value?: string): string => {
  if (!value) return ''

  const exact = TRANSPORT_TYPE_OPTIONS.find((option) => option.value === value)
  if (exact) return exact.value

  const normalized = normalizeBase(value)
  return TRANSPORT_TYPE_ALIASES[normalized] || value
}
