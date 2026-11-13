function normalizeSpaceName(value: unknown): string {
  return String(value ?? '').trim().split('(')[0].trim()
}

/**
 * Extreu les finques de Zoho mantenint compatibilitat amb documents antics.
 * Quan l'oportunitat ja es verda, Ubicacio es la finca final i les
 * multiseleccions historiques no s'han de continuar mostrant com a reserves.
 */
export function eventSpaceNames(
  data: Record<string, unknown>,
  primaryOnly = false
): string[] {
  const values: unknown[] = [
    ...(Array.isArray(data.Ubicacions) ? data.Ubicacions : []),
    ...(Array.isArray(data.Finca_2) ? data.Finca_2 : []),
    ...(Array.isArray(data.Espai_2) ? data.Espai_2 : []),
  ]

  if (primaryOnly) {
    const primary = normalizeSpaceName(data.Ubicacio)
    return primary ? [primary] : eventSpaceNames(data).slice(0, 1)
  }

  if (values.length === 0) values.push(data.Ubicacio)

  const byKey = new Map<string, string>()
  for (const value of values) {
    const name = normalizeSpaceName(value)
    if (!name) continue
    const key = name.toLocaleLowerCase('ca')
    if (!byKey.has(key)) byKey.set(key, name)
  }

  return Array.from(byKey.values())
}
