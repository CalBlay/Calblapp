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
    normalized.startsWith('extra c.extern -')
  ) {
    return 'centerExternalExtra'
  }
  if (normalized === 'ett' || normalized.startsWith('ett -')) {
    return 'ett'
  }
  return null
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
