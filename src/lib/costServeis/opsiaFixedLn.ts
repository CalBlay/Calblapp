/**
 * Store Firestore: cost salarial total LN (vista SAP Opsia).
 * Col·lecció: serviceCostOpsiaFixedLnMonths (doc id = YYYY-MM)
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  SERVICE_COST_OPSIA_FIXED_LN_COL,
  type OpsiaFixedLnApiResponse,
  type OpsiaFixedLnMonthDoc,
  type OpsiaFixedLnRow,
  type OpsiaFixedLnTableRow,
} from '@/lib/costServeis/opsiaFixedLnTypes'

export {
  SERVICE_COST_OPSIA_FIXED_LN_COL,
  type OpsiaFixedLnApiResponse,
  type OpsiaFixedLnMonthDoc,
  type OpsiaFixedLnRow,
  type OpsiaFixedLnTableRow,
} from '@/lib/costServeis/opsiaFixedLnTypes'

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function normalizeRow(raw: Partial<OpsiaFixedLnRow> & { lnCodi: string }): OpsiaFixedLnRow {
  // Compat: respostes antigues amb `fixos`
  const cost =
    Number((raw as { costSalarial?: number }).costSalarial) ||
    Number((raw as { fixos?: number }).fixos) ||
    0
  return {
    lnCodi: String(raw.lnCodi || '').toUpperCase(),
    lnNom: String(raw.lnNom || raw.lnCodi || ''),
    vista: 'sap',
    costSalarial: round2(cost),
  }
}

/** Crida OpsiaFinance GET /api/external/cost-fixos-ln */
export async function fetchOpsiaFixedLnMonth(
  year: number,
  month: number
): Promise<OpsiaFixedLnApiResponse> {
  const { baseUrl, apiKey, configured } = getOpsiaFinanceConfig()
  if (!configured) {
    throw new Error(
      'Falta OPSIA_FINANCE_BASE_URL o OPSIA_FINANCE_API_KEY a l’entorn'
    )
  }

  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  })

  const url = `${baseUrl}/api/external/cost-fixos-ln?${params.toString()}`
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
        `OpsiaFinance ha retornat HTML (login/404). L’endpoint cost-fixos-ln encara no està desplegat. Status ${res.status}.`
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
      `OpsiaFinance no ha retornat JSON (content-type: ${contentType || 'desconegut'}). Cos: ${body.slice(0, 80)}`
    )
  }

  const data = (await res.json()) as OpsiaFixedLnApiResponse
  return {
    year: Number(data.year) || year,
    month: Number(data.month) || month,
    vista: 'sap',
    node: data.node,
    lines: Array.isArray(data.lines)
      ? data.lines.map((l) => normalizeRow(l))
      : [],
  }
}

export async function getOpsiaFixedLnMonthDoc(
  year: number,
  month: number
): Promise<OpsiaFixedLnMonthDoc | null> {
  const id = ymKey(year, month)
  const snap = await db.collection(SERVICE_COST_OPSIA_FIXED_LN_COL).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as OpsiaFixedLnMonthDoc
}

export async function listOpsiaFixedLnMonthDocs(opts: {
  fromYm: string
  toYm: string
}): Promise<OpsiaFixedLnMonthDoc[]> {
  const from = String(opts.fromYm || '').trim()
  const to = String(opts.toYm || '').trim()
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return []

  const snap = await db
    .collection(SERVICE_COST_OPSIA_FIXED_LN_COL)
    .where('ym', '>=', from)
    .where('ym', '<=', to)
    .orderBy('ym', 'asc')
    .get()

  return snap.docs.map((d) => d.data() as OpsiaFixedLnMonthDoc)
}

/** Sync cost salarial SAP de totes les LN i desa a Firestore. */
export async function syncOpsiaFixedLnMonth(opts: {
  year: number
  month: number
  userId?: string
}): Promise<OpsiaFixedLnMonthDoc> {
  const { year, month, userId } = opts
  const ym = ymKey(year, month)
  const prev = await getOpsiaFixedLnMonthDoc(year, month)

  const api = await fetchOpsiaFixedLnMonth(year, month)
  const byLn: Record<string, OpsiaFixedLnRow> = {}
  for (const row of api.lines) {
    byLn[row.lnCodi] = row
  }

  const doc: OpsiaFixedLnMonthDoc = {
    year,
    month,
    ym,
    vista: 'sap',
    byLn,
    source: 'opsia-finance-sap-cost-salarial',
    syncedAt: new Date().toISOString(),
    syncedBy: userId || prev?.syncedBy,
  }

  await db.collection(SERVICE_COST_OPSIA_FIXED_LN_COL).doc(ym).set(doc)
  return doc
}

export function flattenFixedLnMonthsToRows(
  docs: OpsiaFixedLnMonthDoc[]
): OpsiaFixedLnTableRow[] {
  const rows: OpsiaFixedLnTableRow[] = []
  for (const doc of docs) {
    for (const ln of Object.values(doc.byLn || {})) {
      const cost =
        Number(ln.costSalarial) ||
        Number((ln as { fixos?: number }).fixos) ||
        0
      rows.push({
        ym: doc.ym,
        year: doc.year,
        month: doc.month,
        lnCodi: ln.lnCodi,
        lnNom: ln.lnNom,
        costSalarial: round2(cost),
        syncedAt: doc.syncedAt,
      })
    }
  }
  return rows.sort(
    (a, b) => a.ym.localeCompare(b.ym) || a.lnCodi.localeCompare(b.lnCodi)
  )
}
