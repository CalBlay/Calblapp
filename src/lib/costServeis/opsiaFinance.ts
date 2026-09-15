/**
 * Client + store Firestore per costos d’estructura importats d’OpsiaFinance.
 * Col·lecció: serviceCostOpsiaMonths (doc id = YYYY-MM)
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { CostServeisDepartment } from '@/lib/costServeis/types'

export const SERVICE_COST_OPSIA_MONTHS_COL = 'serviceCostOpsiaMonths'

export type OpsiaPotKey = 'gestio' | 'preparacio' | 'rentat'

export type OpsiaImportLine = {
  deptCodi: string
  deptNom: string
  costPersonal: number
  pot: OpsiaPotKey | null
}

export type OpsiaDeptImport = {
  centre: { codi: string; nom: string }
  pots: { gestio: number; preparacio: number; rentat: number }
  lines: OpsiaImportLine[]
}

export type OpsiaMonthDoc = {
  year: number
  month: number
  ym: string
  departments: Partial<Record<CostServeisDepartment, OpsiaDeptImport>>
  source: string
  syncedAt: string
  syncedBy?: string
}

export type OpsiaLogisticaApiResponse = {
  year: number
  month: number
  centre: { codi: string; nom: string }
  pots: { gestio: number; preparacio: number; rentat: number }
  lines: OpsiaImportLine[]
}

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function getOpsiaFinanceConfig(): {
  baseUrl: string
  apiKey: string
  configured: boolean
} {
  const baseUrl = String(process.env.OPSIA_FINANCE_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  // OpsiaFinance anomena aquesta mateixa credencial OPSIA_EXTERNAL_API_KEY.
  // Mantenim el nom antic per compatibilitat amb desplegaments existents.
  const apiKey = String(
    process.env.OPSIA_FINANCE_API_KEY || process.env.OPSIA_EXTERNAL_API_KEY || ''
  ).trim()
  return { baseUrl, apiKey, configured: Boolean(baseUrl && apiKey) }
}

/** Crida OpsiaFinance GET /api/external/cost-personal-logistica | cost-personal-cuina */
async function fetchOpsiaCentrePots(
  centre: 'logistica' | 'cuina',
  year: number,
  month: number
): Promise<OpsiaLogisticaApiResponse> {
  const { baseUrl, apiKey, configured } = getOpsiaFinanceConfig()
  if (!configured) {
    throw new Error(
      'Falta OPSIA_FINANCE_BASE_URL o OPSIA_FINANCE_API_KEY a l’entorn'
    )
  }

  const path =
    centre === 'cuina'
      ? 'cost-personal-cuina'
      : 'cost-personal-logistica'
  const url = `${baseUrl}/api/external/${path}?year=${year}&month=${month}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const looksHtml = /^\s*</.test(body) || body.includes('<!DOCTYPE')
    if (looksHtml) {
      throw new Error(
        `OpsiaFinance ha retornat HTML (login/404). L’endpoint encara no està desplegat o el middleware bloqueja /api/external. Status ${res.status}.`
      )
    }
    throw new Error(
      `OpsiaFinance ${res.status}: ${body.slice(0, 200) || res.statusText}`
    )
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `OpsiaFinance no ha retornat JSON (content-type: ${contentType || 'desconegut'}). Probablement falta desplegar l’API. Cos: ${body.slice(0, 80)}`
    )
  }

  const data = (await res.json()) as OpsiaLogisticaApiResponse
  const defaultCentre =
    centre === 'cuina'
      ? { codi: 'CCC00007', nom: 'CUINA CENTRAL' }
      : { codi: 'CCC00004', nom: 'LOGISTICA' }
  return {
    year: Number(data.year) || year,
    month: Number(data.month) || month,
    centre: {
      codi: String(data.centre?.codi || defaultCentre.codi),
      nom: String(data.centre?.nom || defaultCentre.nom),
    },
    pots: {
      gestio: round2(Number(data.pots?.gestio) || 0),
      preparacio: round2(Number(data.pots?.preparacio) || 0),
      rentat: round2(Number(data.pots?.rentat) || 0),
    },
    lines: Array.isArray(data.lines)
      ? data.lines.map((l) => ({
          deptCodi: String(l.deptCodi || ''),
          deptNom: String(l.deptNom || ''),
          costPersonal: round2(Number(l.costPersonal) || 0),
          pot: (l.pot as OpsiaPotKey | null) || null,
        }))
      : [],
  }
}

export async function fetchOpsiaLogisticaPots(year: number, month: number) {
  return fetchOpsiaCentrePots('logistica', year, month)
}

export async function fetchOpsiaCuinaPots(year: number, month: number) {
  return fetchOpsiaCentrePots('cuina', year, month)
}

export async function getOpsiaMonthDoc(
  year: number,
  month: number
): Promise<OpsiaMonthDoc | null> {
  const id = ymKey(year, month)
  const snap = await db.collection(SERVICE_COST_OPSIA_MONTHS_COL).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as OpsiaMonthDoc
}

export async function listOpsiaMonthDocs(opts: {
  fromYm: string
  toYm: string
}): Promise<OpsiaMonthDoc[]> {
  const from = String(opts.fromYm || '').trim()
  const to = String(opts.toYm || '').trim()
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return []

  const snap = await db
    .collection(SERVICE_COST_OPSIA_MONTHS_COL)
    .where('ym', '>=', from)
    .where('ym', '<=', to)
    .orderBy('ym', 'asc')
    .get()

  return snap.docs.map((d) => d.data() as OpsiaMonthDoc)
}

/** Sync Logística + Cuina des d’Opsia i desa a Firestore. */
export async function syncOpsiaEstructuraMonth(opts: {
  year: number
  month: number
  userId?: string
  /** Només un dept (per defecte tots dos). */
  only?: 'logistica' | 'cuina'
}): Promise<OpsiaMonthDoc> {
  const { year, month, userId, only } = opts
  const ym = ymKey(year, month)
  const prev = await getOpsiaMonthDoc(year, month)
  const departments = { ...(prev?.departments || {}) }

  const doLog = !only || only === 'logistica'
  const doCuina = !only || only === 'cuina'

  if (doLog) {
    const api = await fetchOpsiaLogisticaPots(year, month)
    departments.logistica = {
      centre: api.centre,
      pots: api.pots,
      lines: api.lines,
    }
  }
  if (doCuina) {
    const api = await fetchOpsiaCuinaPots(year, month)
    departments.cuina = {
      centre: api.centre,
      pots: api.pots,
      lines: api.lines,
    }
  }

  const doc: OpsiaMonthDoc = {
    year,
    month,
    ym,
    departments,
    source: 'opsia-finance',
    syncedAt: new Date().toISOString(),
    syncedBy: userId || prev?.syncedBy,
  }

  await db.collection(SERVICE_COST_OPSIA_MONTHS_COL).doc(ym).set(doc, { merge: true })
  return doc
}

/** @deprecated use syncOpsiaEstructuraMonth */
export async function syncOpsiaLogisticaMonth(opts: {
  year: number
  month: number
  userId?: string
}): Promise<OpsiaMonthDoc> {
  return syncOpsiaEstructuraMonth({ ...opts, only: 'logistica' })
}

/** Assegura cache logística+cuina; refresh força sync. */
export async function ensureOpsiaMonth(opts: {
  year: number
  month: number
  refresh?: boolean
  userId?: string
}): Promise<OpsiaMonthDoc> {
  if (!opts.refresh) {
    const existing = await getOpsiaMonthDoc(opts.year, opts.month)
    if (existing?.departments?.logistica && existing?.departments?.cuina) {
      return existing
    }
  }
  return syncOpsiaEstructuraMonth(opts)
}

export type OpsiaStructureRow = {
  ym: string
  year: number
  month: number
  calBlayDept: CostServeisDepartment
  deptCodi: string
  deptNom: string
  costPersonal: number
  costPersonalGross?: number
  transferOut?: number
  transferIn?: number
  transfersStatus?: 'CONFIRMAT' | 'BORRADOR' | 'SENSE_DADES' | 'NO_IMPORTAT'
  pot: OpsiaPotKey | null
  syncedAt?: string
}

/** Aplana docs → files de taula Costos estructura. */
export function flattenOpsiaMonthsToRows(
  docs: OpsiaMonthDoc[],
  deptFilter: CostServeisDepartment | 'all'
): OpsiaStructureRow[] {
  const rows: OpsiaStructureRow[] = []
  for (const doc of docs) {
    const depts = Object.keys(doc.departments || {}) as CostServeisDepartment[]
    for (const calDept of depts) {
      if (deptFilter !== 'all' && calDept !== deptFilter) continue
      const block = doc.departments[calDept]
      if (!block) continue
      for (const line of block.lines || []) {
        rows.push({
          ym: doc.ym,
          year: doc.year,
          month: doc.month,
          calBlayDept: calDept,
          deptCodi: line.deptCodi,
          deptNom: line.deptNom,
          costPersonal: line.costPersonal,
          pot: line.pot,
          syncedAt: doc.syncedAt,
        })
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.ym.localeCompare(b.ym) ||
      a.calBlayDept.localeCompare(b.calBlayDept) ||
      a.deptCodi.localeCompare(b.deptCodi)
  )
}
