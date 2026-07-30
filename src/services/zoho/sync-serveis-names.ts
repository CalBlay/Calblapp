/** Pure helpers for Zoho → Firestore `serveis` catalog sync. */

export type DealServeiFields = {
  Servicio_texto?: unknown
  Men_texto?: unknown
}

export function collectServeisNamesFromDeals(deals: DealServeiFields[]): string[] {
  const serveisRaw = new Set<string>()
  for (const deal of deals) {
    const nom = String(deal.Servicio_texto || deal.Men_texto || '').trim()
    if (nom) serveisRaw.add(nom)
  }
  return Array.from(serveisRaw)
}

export type PlannedServeiCreate = {
  nomRaw: string
  norm: string
  searchable: string
}

/**
 * Decide which servei catalog docs to create from deal service names.
 * Skips empty slugify results and norms already present in Firestore.
 */
export function planNewServeisCreates(params: {
  names: string[]
  existingNorms: Iterable<string>
  slugify: (text: string) => string
}): PlannedServeiCreate[] {
  const existing = new Set(params.existingNorms)
  const out: PlannedServeiCreate[] = []

  for (const nomRaw of params.names) {
    const norm = params.slugify(nomRaw)
    if (!norm || existing.has(norm)) continue
    out.push({
      nomRaw,
      norm,
      searchable: `${nomRaw} ${norm}`.toLowerCase(),
    })
  }

  return out
}
