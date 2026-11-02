export const normalizeAdaEventCode = (code?: string | null) =>
  String(code || '').trim().toUpperCase()

// Les proves de menu (PM, PM2, ...) poden compartir el codi de l'esdeveniment
// d'origen. La resta de codis ADA son unics per esdeveniment.
export const isRepeatablePmCode = (code?: string | null) =>
  /^PM\d*(?:[_\-\s]|$)/i.test(String(code || '').trim())

/**
 * Reserva un codi dins d'una execucio de sync. Es fa abans del commit del
 * batch perque les escriptures pendents encara no son visibles a Firestore.
 */
export const reserveAdaEventCode = (
  owners: Map<string, string | null>,
  code: string,
  eventId: string
) => {
  const normalizedCode = normalizeAdaEventCode(code)
  if (!normalizedCode || isRepeatablePmCode(normalizedCode)) return true

  const owner = owners.get(normalizedCode)
  if (owner && owner !== eventId) return false

  owners.set(normalizedCode, eventId)
  return true
}
