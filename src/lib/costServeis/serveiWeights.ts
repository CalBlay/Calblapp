/**
 * Ponderació progressiva per tipus de servei (Cost de serveis).
 * Catàleg: Firestore `serveis` (Settings).
 * Pesos en col·leccions separades:
 *   - `ponderacioServeisLogistica`
 *   - `ponderacioServeisCuina`
 * Doc id: `${serveiId}__${spaceKind}` — només es crea quan aquell servei
 * apareix realment en aquell tipus d’espai (Propi o Extern).
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  ensureServeiInCatalog,
  listServeis,
  matchServeiCatalogId,
} from '@/lib/serveis/server'
import {
  DEFAULT_SERVEI_COST_WEIGHTS,
  normalizeServeiCostWeights,
  splitServiceTypeLabels,
  type ServeiCostWeights,
} from '@/lib/serveis/utils'
import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'

/** Depts amb ponderació d’estructura en aquesta fase. */
export const PONDERACIO_DEPTS = ['logistica', 'cuina'] as const
export type PonderacioDept = (typeof PONDERACIO_DEPTS)[number]

export const PONDERACIO_COLLECTIONS: Record<PonderacioDept, string> = {
  logistica: 'ponderacioServeisLogistica',
  cuina: 'ponderacioServeisCuina',
}

/** @deprecated legacy; es llegeix només per compatibilitat temporal */
export const SERVICE_COST_SERVEI_WEIGHTS_COL = 'serviceCostServeiWeights'

export type ServeiWeightRow = {
  /** Id client: `${serveiId}__${dept}__${spaceKind}` */
  id: string
  serveiId: string
  serveiNom: string
  serveiCodi: string
  dept: PonderacioDept
  spaceKind: SpaceKind
  /** false = inactiu (amagat per defecte a la UI). */
  active: boolean
  gestio: number
  preparacio: number
  rentat: number
  updatedAt: string
}

export type SyncServiceOccurrence = {
  serviceType: string
  spaceKind: SpaceKind | null
}

export function isPonderacioDept(v: string): v is PonderacioDept {
  return (PONDERACIO_DEPTS as readonly string[]).includes(v)
}

export function isPonderacioSpaceKind(v: string): v is SpaceKind {
  return v === 'Propi' || v === 'Extern'
}

export function ponderacioCollection(dept: PonderacioDept): string {
  return PONDERACIO_COLLECTIONS[dept]
}

/** Id del document dins la col·lecció del dept. */
export function serveiWeightDocId(serveiId: string, spaceKind: SpaceKind): string {
  return `${serveiId}__${spaceKind}`
}

/** Id estable per a la UI / API (inclou dept). */
export function serveiWeightRowId(
  serveiId: string,
  dept: PonderacioDept,
  spaceKind: SpaceKind
): string {
  return `${serveiId}__${dept}__${spaceKind}`
}

export function parseServeiWeightRowId(id: string): {
  serveiId: string
  dept: PonderacioDept
  spaceKind: SpaceKind
} | null {
  const parts = String(id || '').split('__')
  if (parts.length < 3) return null
  const spaceKind = parts[parts.length - 1]
  const dept = parts[parts.length - 2]
  if (!isPonderacioDept(dept) || !isPonderacioSpaceKind(spaceKind)) return null
  const serveiId = parts.slice(0, -2).join('__')
  if (!serveiId) return null
  return { serveiId, dept, spaceKind }
}

function mapRow(
  dept: PonderacioDept,
  docId: string,
  data: Record<string, unknown>
): ServeiWeightRow {
  const w = normalizeServeiCostWeights({
    gestio: data.gestio as number,
    preparacio: data.preparacio as number,
    rentat: data.rentat as number,
  })
  const spaceKind = isPonderacioSpaceKind(String(data.spaceKind || ''))
    ? (data.spaceKind as SpaceKind)
    : docId.endsWith('__Extern')
      ? 'Extern'
      : 'Propi'
  const serveiId = String(data.serveiId || docId.replace(/__(Propi|Extern)$/, '') || '')
  const active = data.active === false ? false : true
  return {
    id: serveiWeightRowId(serveiId, dept, spaceKind),
    serveiId,
    serveiNom: String(data.serveiNom || ''),
    serveiCodi: String(data.serveiCodi || ''),
    dept,
    spaceKind,
    active,
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: String(data.updatedAt || ''),
  }
}

async function listDeptRows(dept: PonderacioDept): Promise<ServeiWeightRow[]> {
  const snap = await db.collection(ponderacioCollection(dept)).get()
  return snap.docs
    .map((d) => mapRow(dept, d.id, d.data() as Record<string, unknown>))
    .filter((r) => isPonderacioSpaceKind(r.spaceKind) && Boolean(r.serveiId))
}

export async function listServeiWeightRows(opts?: {
  dept?: PonderacioDept | 'all'
}): Promise<ServeiWeightRow[]> {
  const dept = opts?.dept || 'all'
  const rows =
    dept !== 'all' && isPonderacioDept(dept)
      ? await listDeptRows(dept)
      : (
          await Promise.all(PONDERACIO_DEPTS.map((d) => listDeptRows(d)))
        ).flat()

  return rows.sort(
    (a, b) =>
      a.dept.localeCompare(b.dept) ||
      a.serveiNom.localeCompare(b.serveiNom, 'ca', { sensitivity: 'base' }) ||
      a.spaceKind.localeCompare(b.spaceKind)
  )
}

export async function upsertServeiWeightRow(input: {
  serveiId: string
  serveiNom: string
  serveiCodi: string
  dept: PonderacioDept
  spaceKind: SpaceKind
  weights?: Partial<ServeiCostWeights>
  /** Si ja existeix i no passem weights, no pisa. */
  onlyIfMissing?: boolean
}): Promise<ServeiWeightRow> {
  const docId = serveiWeightDocId(input.serveiId, input.spaceKind)
  const ref = db.collection(ponderacioCollection(input.dept)).doc(docId)
  const snap = await ref.get()

  if (snap.exists && input.onlyIfMissing) {
    return mapRow(input.dept, docId, snap.data() as Record<string, unknown>)
  }

  const prev = snap.exists
    ? mapRow(input.dept, docId, snap.data() as Record<string, unknown>)
    : null

  const w = normalizeServeiCostWeights({
    gestio: input.weights?.gestio ?? prev?.gestio ?? DEFAULT_SERVEI_COST_WEIGHTS.gestio,
    preparacio:
      input.weights?.preparacio ??
      prev?.preparacio ??
      DEFAULT_SERVEI_COST_WEIGHTS.preparacio,
    rentat: input.weights?.rentat ?? prev?.rentat ?? DEFAULT_SERVEI_COST_WEIGHTS.rentat,
  })

  const payload = {
    serveiId: input.serveiId,
    serveiNom: input.serveiNom,
    serveiCodi: input.serveiCodi,
    dept: input.dept,
    spaceKind: input.spaceKind,
    active: true,
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: new Date().toISOString(),
  }
  // onlyIfMissing: ja retornem abans; creació nova sempre activa
  if (!snap.exists) {
    await ref.set(payload, { merge: true })
    return mapRow(input.dept, docId, payload)
  }
  await ref.set(
    {
      ...payload,
      active: prev?.active !== false,
      gestio: w.gestio,
      preparacio: w.preparacio,
      rentat: w.rentat,
    },
    { merge: true }
  )
  return mapRow(input.dept, docId, { ...payload, active: prev?.active !== false })
}

export async function updateServeiWeightRow(
  rowId: string,
  weights: Partial<ServeiCostWeights> & {
    serveiNom?: string
    dept?: PonderacioDept
    active?: boolean
  }
): Promise<ServeiWeightRow> {
  const parsed = parseServeiWeightRowId(rowId)
  const dept = weights.dept || parsed?.dept
  const spaceKind = parsed?.spaceKind
  const serveiId = parsed?.serveiId
  if (!dept || !spaceKind || !serveiId) {
    throw new Error('Fila de ponderació no vàlida')
  }

  const docId = serveiWeightDocId(serveiId, spaceKind)
  const ref = db.collection(ponderacioCollection(dept)).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Fila de ponderació no trobada')
  const prev = mapRow(dept, docId, snap.data() as Record<string, unknown>)
  const w = normalizeServeiCostWeights({
    gestio: weights.gestio ?? prev.gestio,
    preparacio: weights.preparacio ?? prev.preparacio,
    rentat: weights.rentat ?? prev.rentat,
  })
  const payload = {
    serveiNom: weights.serveiNom ? String(weights.serveiNom) : prev.serveiNom,
    spaceKind: prev.spaceKind,
    active: typeof weights.active === 'boolean' ? weights.active : prev.active,
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: new Date().toISOString(),
  }
  await ref.set(payload, { merge: true })
  return mapRow(dept, docId, { ...prev, ...payload })
}

/**
 * Crea només les combinacions (tipus × espai) que han sortit als events.
 * Un cop creades es conserven; un sync posterior només afegeix les noves.
 */
export async function syncPonderacioFromOccurrences(
  occurrences: SyncServiceOccurrence[]
): Promise<{
  createdServeis: number
  createdWeightRows: number
  uniquePairs: number
  rows: ServeiWeightRow[]
}> {
  const pairKey = (nom: string, space: SpaceKind) => `${nom.toLowerCase()}::${space}`
  const pairs = new Map<string, { nom: string; spaceKind: SpaceKind }>()

  for (const occ of occurrences) {
    if (!occ.spaceKind) continue
    for (const nom of splitServiceTypeLabels(occ.serviceType)) {
      if (!nom || nom === '(sense tipus)') continue
      pairs.set(pairKey(nom, occ.spaceKind), { nom, spaceKind: occ.spaceKind })
    }
  }

  let createdServeis = 0
  let createdWeightRows = 0
  const touched: ServeiWeightRow[] = []

  const catalogBefore = await listServeis()
  const beforeIds = new Set(catalogBefore.map((s) => s.id))

  for (const { nom, spaceKind } of pairs.values()) {
    const existed = Boolean(matchServeiCatalogId(nom, catalogBefore))
    const servei = await ensureServeiInCatalog(nom)
    if (!existed && !beforeIds.has(servei.id)) createdServeis += 1
    beforeIds.add(servei.id)

    for (const dept of PONDERACIO_DEPTS) {
      const docId = serveiWeightDocId(servei.id, spaceKind)
      const exists = (
        await db.collection(ponderacioCollection(dept)).doc(docId).get()
      ).exists
      const row = await upsertServeiWeightRow({
        serveiId: servei.id,
        serveiNom: servei.nom,
        serveiCodi: servei.codi,
        dept,
        spaceKind,
        onlyIfMissing: true,
      })
      if (!exists) createdWeightRows += 1
      touched.push(row)
    }
  }

  return {
    createdServeis,
    createdWeightRows,
    uniquePairs: pairs.size,
    rows: touched,
  }
}

/** @deprecated usa syncPonderacioFromOccurrences */
export async function syncPonderacioFromServiceTypes(
  serviceTypeLabels: string[]
): Promise<{
  createdServeis: number
  createdWeightRows: number
  rows: ServeiWeightRow[]
}> {
  return syncPonderacioFromOccurrences(
    serviceTypeLabels.map((serviceType) => ({ serviceType, spaceKind: null }))
  )
}

export type { ServeiCostWeights }
