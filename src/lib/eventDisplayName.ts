function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

/** Nom visible d'un esdeveniment a partir de camps habituals de Firestore. */
export function resolveEventDisplayName(
  data?: Record<string, unknown> | null,
  ...fallbacks: (string | undefined | null)[]
): string {
  const fromData = data
    ? firstNonEmptyString(
        data.NomEvent,
        data.eventName,
        data.summary,
        data.Nom,
        data.name,
        data.title
      )
    : ''
  return firstNonEmptyString(fromData, ...fallbacks)
}
