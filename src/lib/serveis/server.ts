import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  buildServeiSearchable,
  matchServeiCatalogId,
  normalizeServeiCostWeights,
  slugifyServeiCodi,
  DEFAULT_SERVEI_COST_WEIGHTS,
  type ServeiCostWeights,
} from '@/lib/serveis/utils'

const COL = 'serveis'

export { slugifyServeiCodi, matchServeiCatalogId }
export type { ServeiCostWeights }

export type Servei = {
  id: string
  nom: string
  codi: string
  searchable: string
  origen?: string
  updatedAt: string
  /** Coeficients Cost de serveis (estables). */
  costWeights: ServeiCostWeights
}

const mapServei = (id: string, data: Record<string, unknown>): Servei => ({
  id,
  nom: String(data.nom || '').trim(),
  codi: String(data.codi || id).trim(),
  searchable: String(
    data.searchable || buildServeiSearchable(String(data.nom || ''), String(data.codi || id))
  ),
  origen: data.origen ? String(data.origen) : undefined,
  updatedAt: String(data.updatedAt || ''),
  costWeights: normalizeServeiCostWeights(
    (data.costWeights as Partial<ServeiCostWeights> | undefined) || null
  ),
})

export function resolveServeiDocId(params: { nom: string; codi?: string }) {
  const custom = String(params.codi || '').trim()
  if (custom) return custom
  return slugifyServeiCodi(params.nom)
}

export async function listServeis(query?: string): Promise<Servei[]> {
  const snap = await db.collection(COL).get()
  const all = snap.docs.map((doc) => mapServei(doc.id, doc.data() as Record<string, unknown>))

  const q = String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  const filtered = q
    ? all.filter((servei) => {
        const hay = `${servei.nom} ${servei.codi} ${servei.searchable}`.toLowerCase()
        return hay.includes(q)
      })
    : all

  return filtered.sort((a, b) =>
    a.nom.localeCompare(b.nom, 'ca', { sensitivity: 'base' })
  )
}

export async function getServeiById(id: string): Promise<Servei | null> {
  const docId = String(id || '').trim()
  if (!docId) return null
  const snap = await db.collection(COL).doc(docId).get()
  if (!snap.exists) return null
  return mapServei(snap.id, snap.data() as Record<string, unknown>)
}

export async function createServei(params: {
  nom: string
  codi?: string
  origen?: string
  costWeights?: Partial<ServeiCostWeights>
}) {
  const nom = String(params.nom || '').trim()
  if (!nom) throw new Error('Cal el nom del servei.')

  const docId = resolveServeiDocId({ nom, codi: params.codi })
  if (!docId) throw new Error('No s\'ha pogut generar un codi vàlid per al servei.')

  const ref = db.collection(COL).doc(docId)
  const existing = await ref.get()
  if (existing.exists) throw new Error('Ja existeix un servei amb aquest codi.')

  const codi = String(params.codi || docId).trim() || docId
  const now = new Date().toISOString()
  const costWeights = normalizeServeiCostWeights(
    params.costWeights || DEFAULT_SERVEI_COST_WEIGHTS
  )
  const payload = {
    nom,
    codi,
    searchable: buildServeiSearchable(nom, codi),
    origen: params.origen || 'manual',
    costWeights,
    updatedAt: now,
  }
  await ref.set(payload)
  return mapServei(docId, payload)
}

export async function updateServei(
  id: string,
  params: {
    nom?: string
    costWeights?: Partial<ServeiCostWeights>
  }
) {
  const docId = String(id || '').trim()
  const ref = db.collection(COL).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Servei no trobat.')

  const current = snap.data() as Record<string, unknown>
  const nom =
    params.nom !== undefined
      ? String(params.nom || '').trim()
      : String(current.nom || '').trim()
  if (!nom) throw new Error('Cal el nom del servei.')

  const codi = String(current.codi || docId).trim()
  const patch: Record<string, unknown> = {
    nom,
    searchable: buildServeiSearchable(nom, codi),
    updatedAt: new Date().toISOString(),
  }
  if (params.costWeights) {
    patch.costWeights = normalizeServeiCostWeights({
      ...normalizeServeiCostWeights(
        (current.costWeights as Partial<ServeiCostWeights> | undefined) || null
      ),
      ...params.costWeights,
    })
  }
  await ref.set(patch, { merge: true })
  const updated = await ref.get()
  return mapServei(updated.id, updated.data() as Record<string, unknown>)
}

export async function deleteServei(id: string) {
  const docId = String(id || '').trim()
  if (!docId) throw new Error('Servei no trobat.')
  await db.collection(COL).doc(docId).delete()
}

/** Assegura que un tipus usat a events existeix al catàleg (pesos per defecte). */
export async function ensureServeiInCatalog(nomRaw: string): Promise<Servei> {
  const nom = String(nomRaw || '').trim()
  if (!nom) throw new Error('Cal el nom del servei.')
  const catalog = await listServeis()
  const id = matchServeiCatalogId(nom, catalog)
  if (id) {
    const existing = catalog.find((s) => s.id === id)
    if (existing) return existing
  }
  return createServei({ nom, origen: 'cost-serveis' })
}
