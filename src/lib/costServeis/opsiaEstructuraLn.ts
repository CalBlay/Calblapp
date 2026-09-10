/**
 * Store Firestore: estructura Central neta per LN (Gestió, sense Logística/Cuina).
 * Col·lecció: serviceCostOpsiaEstructuraLnMonths (doc id = YYYY-MM)
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  mergeOpsiaEstructuraLnRowWithPrevious,
  normalizeOpsiaEstructuraLnRow,
} from '@/lib/costServeis/opsiaEstructuraLnNormalize'
import {
  SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL,
  type OpsiaEstructuraLnApiResponse,
  type OpsiaEstructuraLnMonthDoc,
  type OpsiaEstructuraLnRow,
} from '@/lib/costServeis/opsiaEstructuraLnTypes'

export {
  SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL,
  type OpsiaEstructuraLnApiResponse,
  type OpsiaEstructuraLnMonthDoc,
  type OpsiaEstructuraLnRow,
  type OpsiaEstructuraLnTableRow,
} from '@/lib/costServeis/opsiaEstructuraLnTypes'

export {
  flattenEstructuraLnMonthsToRows,
  mergeOpsiaEstructuraLnRowWithPrevious,
  normalizeOpsiaEstructuraLnRow,
} from '@/lib/costServeis/opsiaEstructuraLnNormalize'

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export async function fetchOpsiaEstructuraLnMonth(
  year: number,
  month: number
): Promise<OpsiaEstructuraLnApiResponse> {
  const { baseUrl, apiKey, configured } = getOpsiaFinanceConfig()
  if (!configured) {
    throw new Error(
      'Falta OPSIA_FINANCE_BASE_URL o OPSIA_FINANCE_API_KEY a l’entorn'
    )
  }

  const url = `${baseUrl}/api/external/cost-estructura-ln?year=${year}&month=${month}`
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
        `OpsiaFinance ha retornat HTML. L’endpoint cost-estructura-ln encara no està desplegat. Status ${res.status}.`
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
      `OpsiaFinance no ha retornat JSON. Cos: ${body.slice(0, 80)}`
    )
  }

  const data = (await res.json()) as OpsiaEstructuraLnApiResponse
  const estat = String(data.execucioEstat || 'SENSE_DADES')
  const execucioEstat =
    estat === 'CONFIRMAT' || estat === 'LIVE_FALLBACK' || estat === 'SENSE_DADES'
      ? estat
      : 'SENSE_DADES'

  return {
    year: Number(data.year) || year,
    month: Number(data.month) || month,
    vista: 'gestio',
    execucioEstat,
    logisticaCuinaPersonal: round2(Number(data.logisticaCuinaPersonal) || 0),
    personalCentralSap: round2(Number(data.personalCentralSap) || 0),
    ratioLogisticaCuina: Number(data.ratioLogisticaCuina) || 0,
    lines: Array.isArray(data.lines)
      ? data.lines.map((l) => normalizeOpsiaEstructuraLnRow(l))
      : [],
  }
}

export async function getOpsiaEstructuraLnMonthDoc(
  year: number,
  month: number
): Promise<OpsiaEstructuraLnMonthDoc | null> {
  const snap = await db
    .collection(SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL)
    .doc(ymKey(year, month))
    .get()
  if (!snap.exists) return null
  return snap.data() as OpsiaEstructuraLnMonthDoc
}

export async function listOpsiaEstructuraLnMonthDocs(opts: {
  fromYm: string
  toYm: string
}): Promise<OpsiaEstructuraLnMonthDoc[]> {
  const from = String(opts.fromYm || '').trim()
  const to = String(opts.toYm || '').trim()
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return []

  const snap = await db
    .collection(SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL)
    .where('ym', '>=', from)
    .where('ym', '<=', to)
    .orderBy('ym', 'asc')
    .get()

  return snap.docs.map((d) => d.data() as OpsiaEstructuraLnMonthDoc)
}

export async function syncOpsiaEstructuraLnMonth(opts: {
  year: number
  month: number
  userId?: string
}): Promise<OpsiaEstructuraLnMonthDoc> {
  const { year, month, userId } = opts
  const ym = ymKey(year, month)
  const prev = await getOpsiaEstructuraLnMonthDoc(year, month)
  const api = await fetchOpsiaEstructuraLnMonth(year, month)

  const byLn: Record<string, OpsiaEstructuraLnRow> = {}
  for (const row of api.lines) {
    byLn[row.lnCodi] = mergeOpsiaEstructuraLnRowWithPrevious(
      row,
      prev?.byLn?.[row.lnCodi]
    )
  }

  const doc: OpsiaEstructuraLnMonthDoc = {
    year,
    month,
    ym,
    vista: 'gestio',
    execucioEstat: api.execucioEstat,
    logisticaCuinaPersonal: api.logisticaCuinaPersonal,
    personalCentralSap: api.personalCentralSap,
    ratioLogisticaCuina: api.ratioLogisticaCuina,
    byLn,
    source: 'opsia-finance-gestio-estructura-neta',
    syncedAt: new Date().toISOString(),
    syncedBy: userId || prev?.syncedBy,
  }

  await db.collection(SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL).doc(ym).set(doc)
  return doc
}
