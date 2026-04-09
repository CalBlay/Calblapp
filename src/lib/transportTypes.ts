export const TRANSPORT_TYPE_OPTIONS = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'transport', label: 'Transport' },
  { value: 'furgonetaPetita', label: 'Furgoneta petita' },
  { value: 'furgonetaManteniment', label: 'Furgoneta manteniment' },
  { value: 'furgonetaMitjana', label: 'Furgoneta mitjana' },
  { value: 'furgonetaGran', label: 'Furgoneta gran' },
  { value: 'camioPPlataforma', label: 'Camio P.Plataforma' },
  { value: 'camioGran', label: 'Camio Gran' },
  { value: 'camioPPlataformaFred', label: 'Camio P.Plataforma Fred' },
  { value: 'camioGranFred', label: 'Camio Gran Fred' },
] as const

export type TransportType = (typeof TRANSPORT_TYPE_OPTIONS)[number]['value']

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
