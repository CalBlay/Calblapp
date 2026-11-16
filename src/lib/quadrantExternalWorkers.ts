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
  const normalizedExternalExtra = normalized
    .replace(/^extra\s+c\s*\.\s*extern\b/, 'extra extern')
    .replace(/^extra\s+c\s+extern\b/, 'extra extern')
  if (
    normalizedExternalExtra === 'extra extern' ||
    normalizedExternalExtra.startsWith('extra extern -')
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
  // `Extra` és també una plaça pendent/genèrica creada pel motor, mai una persona.
  if (normalize(value.name || value.personName) === 'extra') return true
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

  const centerExternalPrefix = /^extra\s*c(?:\s*\.\s*|\s+)extern/i
  if (centerExternalPrefix.test(raw)) {
    const suffix = raw
      .replace(centerExternalPrefix, '')
      .replace(/^\s*-\s*/, '')
      .trim()
    return suffix ? `${basePrefix} - ${suffix}` : basePrefix
  }

  if (/^extra\s+extern\b/i.test(raw)) {
    const suffix = raw
      .replace(/^extra\s+extern\b/i, '')
      .replace(/^\s*-\s*/, '')
      .trim()
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
