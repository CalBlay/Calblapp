const unaccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const slugifyServeiCodi = (t: string) =>
  unaccent(t)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const buildServeiSearchable = (nom: string, codi: string) =>
  `${nom} ${codi}`.toLowerCase().trim()

/** Coeficients estables per repartir costos d’estructura (Cost de serveis). */
export type ServeiCostWeights = {
  gestio: number
  preparacio: number
  rentat: number
}

export const DEFAULT_SERVEI_COST_WEIGHTS: ServeiCostWeights = {
  gestio: 1,
  preparacio: 1,
  rentat: 1,
}

export function normalizeServeiCostWeights(
  raw?: Partial<ServeiCostWeights> | null
): ServeiCostWeights {
  const n = (v: unknown, fallback: number) => {
    const x = Number(v)
    if (!Number.isFinite(x) || x < 0) return fallback
    return Math.round(x * 1000) / 1000
  }
  return {
    gestio: n(raw?.gestio, DEFAULT_SERVEI_COST_WEIGHTS.gestio),
    preparacio: n(raw?.preparacio, DEFAULT_SERVEI_COST_WEIGHTS.preparacio),
    rentat: n(raw?.rentat, DEFAULT_SERVEI_COST_WEIGHTS.rentat),
  }
}

/**
 * Un event pot portar diversos tipus separats per coma
 * (ex. «Aperitiu,Banquet - Menu 1» → dues línies de ponderació).
 */
export function splitServiceTypeLabels(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(raw || '').split(',')) {
    const nom = part.trim()
    if (!nom) continue
    const key = slugifyServeiCodi(nom)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(nom)
  }
  return out
}

/** Emparella el text Servei de l’event amb un doc del catàleg. */
export function matchServeiCatalogId(
  serviceLabel: string,
  catalog: Array<{ id: string; nom: string; codi: string }>
): string | null {
  const slug = slugifyServeiCodi(serviceLabel)
  if (!slug) return null
  const hit = catalog.find(
    (s) =>
      s.codi === slug ||
      s.id === slug ||
      slugifyServeiCodi(s.nom) === slug
  )
  return hit?.id || null
}

/** Cert si tots els tipus (separats per coma) són al catàleg. */
export function allServiceTypesInCatalog(
  serviceLabel: string,
  catalog: Array<{ id: string; nom: string; codi: string }>
): boolean {
  const parts = splitServiceTypeLabels(serviceLabel)
  if (parts.length === 0) return false
  return parts.every((p) => Boolean(matchServeiCatalogId(p, catalog)))
}
