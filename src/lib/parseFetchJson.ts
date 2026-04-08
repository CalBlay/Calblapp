/**
 * Parseja JSON d'una Response de fetch. Evita "Unexpected end of JSON input"
 * quan res.ok però el cos és buit (p.ex. timeout intermediari, proxy).
 */
export async function parseFetchJson<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback
  const text = await res.text()
  const trimmed = text.trim()
  if (!trimmed) return fallback
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return fallback
  }
}
