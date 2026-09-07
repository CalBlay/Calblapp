/**
 * Ponderació progressiva per tipus de servei (Cost de serveis).
 * Catàleg: Firestore `serveis` (Settings).
 * Pesos: Firestore `serviceCostServeiWeights` — només files creades sota demanda.
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
  type ServeiCostWeights,
} from '@/lib/serveis/utils'
import type { CostServeisDepartment } from '@/lib/costServeis/types'

export const SERVICE_COST_SERVEI_WEIGHTS_COL = 'serviceCostServeiWeights'

/** Depts amb ponderació d’estructura en aquesta fase. */
export const PONDERACIO_DEPTS = ['logistica', 'cuina'] as const
export type PonderacioDept = (typeof PONDERACIO_DEPTS)[number]

export type ServeiWeightRow = {
  id: string
  serveiId: string
  serveiNom: string
  serveiCodi: string
  dept: PonderacioDept
  gestio: number
  preparacio: number
  rentat: number
  updatedAt: string
}

export function isPonderacioDept(v: string): v is PonderacioDept {
  return (PONDERACIO_DEPTS as readonly string[]).includes(v)
}

export function serveiWeightDocId(serveiId: string, dept: PonderacioDept): string {
  return `${serveiId}__${dept}`
}

function mapRow(id: string, data: Record<string, unknown>): ServeiWeightRow {
  const w = normalizeServeiCostWeights({
    gestio: data.gestio as number,
    preparacio: data.preparacio as number,
    rentat: data.rentat as number,
  })
  return {
    id,
    serveiId: String(data.serveiId || ''),
    serveiNom: String(data.serveiNom || ''),
    serveiCodi: String(data.serveiCodi || ''),
    dept: (String(data.dept || 'logistica') as PonderacioDept) || 'logistica',
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: String(data.updatedAt || ''),
  }
}

export async function listServeiWeightRows(opts?: {
  dept?: PonderacioDept | 'all'
}): Promise<ServeiWeightRow[]> {
  const dept = opts?.dept || 'all'
  let snap
  if (dept !== 'all' && isPonderacioDept(dept)) {
    snap = await db
      .collection(SERVICE_COST_SERVEI_WEIGHTS_COL)
      .where('dept', '==', dept)
      .get()
  } else {
    snap = await db.collection(SERVICE_COST_SERVEI_WEIGHTS_COL).get()
  }

  const rows = snap.docs.map((d) => mapRow(d.id, d.data() as Record<string, unknown>))
  return rows.sort(
    (a, b) =>
      a.dept.localeCompare(b.dept) ||
      a.serveiNom.localeCompare(b.serveiNom, 'ca', { sensitivity: 'base' })
  )
}

export async function upsertServeiWeightRow(input: {
  serveiId: string
  serveiNom: string
  serveiCodi: string
  dept: PonderacioDept
  weights?: Partial<ServeiCostWeights>
  /** Si ja existeix i no passem weights, no pisa. */
  onlyIfMissing?: boolean
}): Promise<ServeiWeightRow> {
  const id = serveiWeightDocId(input.serveiId, input.dept)
  const ref = db.collection(SERVICE_COST_SERVEI_WEIGHTS_COL).doc(id)
  const snap = await ref.get()

  if (snap.exists && input.onlyIfMissing) {
    return mapRow(id, snap.data() as Record<string, unknown>)
  }

  const prev = snap.exists
    ? mapRow(id, snap.data() as Record<string, unknown>)
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
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: new Date().toISOString(),
  }
  await ref.set(payload, { merge: true })
  return mapRow(id, payload)
}

export async function updateServeiWeightRow(
  id: string,
  weights: Partial<ServeiCostWeights> & { serveiNom?: string }
): Promise<ServeiWeightRow> {
  const ref = db.collection(SERVICE_COST_SERVEI_WEIGHTS_COL).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Fila de ponderació no trobada')
  const prev = mapRow(id, snap.data() as Record<string, unknown>)
  const w = normalizeServeiCostWeights({
    gestio: weights.gestio ?? prev.gestio,
    preparacio: weights.preparacio ?? prev.preparacio,
    rentat: weights.rentat ?? prev.rentat,
  })
  const payload = {
    ...prev,
    serveiNom: weights.serveiNom ? String(weights.serveiNom) : prev.serveiNom,
    gestio: w.gestio,
    preparacio: w.preparacio,
    rentat: w.rentat,
    updatedAt: new Date().toISOString(),
  }
  await ref.set(
    {
      serveiNom: payload.serveiNom,
      gestio: payload.gestio,
      preparacio: payload.preparacio,
      rentat: payload.rentat,
      updatedAt: payload.updatedAt,
    },
    { merge: true }
  )
  return payload
}

/**
 * A partir dels tipus d’Edició (llista de noms):
 * 1) assegura doc a `serveis`
 * 2) crea fila de pesos per Logística i Cuina si falta
 */
export async function syncPonderacioFromServiceTypes(
  serviceTypeLabels: string[]
): Promise<{
  createdServeis: number
  createdWeightRows: number
  rows: ServeiWeightRow[]
}> {
  const unique = [
    ...new Set(
      serviceTypeLabels
        .map((s) => String(s || '').trim())
        .filter((s) => s && s !== '(sense tipus)')
    ),
  ]

  let createdServeis = 0
  let createdWeightRows = 0
  const touched: ServeiWeightRow[] = []

  const catalogBefore = await listServeis()
  const beforeIds = new Set(catalogBefore.map((s) => s.id))

  for (const nom of unique) {
    const existed = Boolean(matchServeiCatalogId(nom, catalogBefore))
    const servei = await ensureServeiInCatalog(nom)
    if (!existed && !beforeIds.has(servei.id)) createdServeis += 1
    beforeIds.add(servei.id)

    for (const dept of PONDERACIO_DEPTS) {
      const id = serveiWeightDocId(servei.id, dept)
      const exists = (
        await db.collection(SERVICE_COST_SERVEI_WEIGHTS_COL).doc(id).get()
      ).exists
      const row = await upsertServeiWeightRow({
        serveiId: servei.id,
        serveiNom: servei.nom,
        serveiCodi: servei.codi,
        dept,
        onlyIfMissing: true,
      })
      if (!exists) createdWeightRows += 1
      touched.push(row)
    }
  }

  return { createdServeis, createdWeightRows, rows: touched }
}

export type { ServeiCostWeights }
