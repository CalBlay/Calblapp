export type ExternalWorkerType = 'ett' | 'centerExternalExtra'

const normalize = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export function getExternalWorkerTypeFromName(
  value?: string | null
): ExternalWorkerType | null {
  const normalized = normalize(value)
  if (!normalized) return null
  if (
    normalized === 'extra c.extern' ||
    normalized.startsWith('extra c.extern -') ||
    normalized === 'extra c extern' ||
    normalized.startsWith('extra c extern -') ||
    normalized === 'extra extern' ||
    normalized.startsWith('extra extern -')
  ) {
    return 'centerExternalExtra'
  }
  if (normalized === 'ett' || normalized.startsWith('ett -')) {
    return 'ett'
  }
  return null
}

/**
 * Una plaça d'Extra C.Extern és un recurs genèric, no una persona concreta.
 * Per això mai no ha de reservar disponibilitat ni provocar solapaments.
 */
export function isReusableExternalExtra(value?: {
  name?: string | null
  personName?: string | null
  externalType?: string | null
  isCenterExternalExtra?: boolean | null
} | null): boolean {
  if (!value) return false
  if (value.externalType === 'centerExternalExtra') return true
  if (value.isCenterExternalExtra === true) return true
  return getExternalWorkerTypeFromName(value.name || value.personName) === 'centerExternalExtra'
}

/** Detecta l'etiqueta ETT a qualsevol posició del nom (p. ex. "Joan ETT"). */
export function hasEttWorkerMarker(value?: string | null): boolean {
  return /(?:^|[^a-z0-9])ett(?:$|[^a-z0-9])/.test(normalize(value))
}

export function getExternalWorkerBaseLabel(
  type?: ExternalWorkerType | null
): string {
  return type === 'centerExternalExtra' ? 'Extra C.Extern' : 'ETT'
}

export function normalizeExternalWorkerName(params: {
  rawName?: string | null
  type?: ExternalWorkerType | null
}): string {
  const type = params.type || 'ett'
  const basePrefix = getExternalWorkerBaseLabel(type)
  const raw = String(params.rawName || '').trim()
  const normalized = normalize(raw)

  if (!raw || normalized === 'extra' || normalized === 'ett') {
    return basePrefix
  }

  if (/^extra\s*c\.extern(?:\s*-\s*)?/i.test(raw)) {
    const suffix = raw.replace(/^extra\s*c\.extern\s*-\s*/i, '').trim()
    return suffix ? `${basePrefix} - ${suffix}` : basePrefix
  }

  if (/^ett\s*-\s*/i.test(raw)) {
    const suffix = raw.replace(/^ett\s*-\s*/i, '').trim()
    return suffix ? `${basePrefix} - ${suffix}` : basePrefix
  }

  if (normalized === 'extra c.extern') {
    return basePrefix
  }

  return `${basePrefix} - ${raw}`
}
