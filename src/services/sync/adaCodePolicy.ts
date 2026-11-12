export const normalizeAdaEventCode = (code?: string | null) =>
  String(code || '').trim().toUpperCase()

// Els codis creats abans que ADA assigni el codi definitiu son provisionals
// i sempre comencen per PM (PM, PM2, PM_EMPRESA, ...).
export const isProvisionalPmCode = (code?: string | null) =>
  normalizeAdaEventCode(code).startsWith('PM')

// Les proves de menu poden compartir el codi provisional. La resta de codis
// ADA son unics per esdeveniment.
export const isRepeatablePmCode = (code?: string | null) =>
  isProvisionalPmCode(code)

/** Una PM nomes pot compartir un codi ADA existent amb una coincidencia segura. */
export const canProvisionalPmShareAdaCode = (
  currentCode: string | null | undefined,
  matchScore: number
) => isProvisionalPmCode(currentCode) && matchScore >= 3

/** Prioritza el codi ADA real quan una dada operativa encara conserva un PM. */
export const preferRealAdaCode = (
  storedCode?: string | null,
  syncedCode?: string | null
) => {
  const stored = String(storedCode || '').trim()
  const synced = String(syncedCode || '').trim()
  if (isProvisionalPmCode(stored) && synced && !isProvisionalPmCode(synced)) {
    return synced
  }
  return stored || synced
}

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
