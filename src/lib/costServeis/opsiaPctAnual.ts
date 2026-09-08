/**
 * Store Firestore: % anual Compres i Gestió (vista Gestió Opsia).
 * Col·lecció: serviceCostOpsiaPctAnual (doc id = YYYY o YYYY__grup)
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  SERVICE_COST_OPSIA_PCT_ANUAL_COL,
  type OpsiaPctAnualApiResponse,
  type OpsiaPctAnualDoc,
  type OpsiaPctAnualLnRow,
  type OpsiaPctAnualTotals,
} from '@/lib/costServeis/opsiaPctAnualTypes'

export {
  SERVICE_COST_OPSIA_PCT_ANUAL_COL,
  type OpsiaPctAnualApiResponse,
  type OpsiaPctAnualDoc,
  type OpsiaPctAnualLnRow,
  type OpsiaPctAnualTotals,
} from '@/lib/costServeis/opsiaPctAnualTypes'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

function docId(year: number, grup: string) {
  const g = String(grup || 'calblay').trim() || 'calblay'
  return g === 'calblay' ? String(year) : `${year}__${g}`
}

function normalizeTotals(raw?: Partial<OpsiaPctAnualTotals> | null): OpsiaPctAnualTotals {
  const ingressos = round2(Number(raw?.ingressos) || 0)
  const compres = round2(Number(raw?.compres) || 0)
  const gestio = round2(Number(raw?.gestio) || 0)
  const pctCompres =
    raw?.pctCompres == null || Number.isNaN(Number(raw.pctCompres))
      ? ingressos > 0
        ? round4((compres / ingressos) * 100)
        : null
      : round4(Number(raw.pctCompres))
  const pctGestio =
    raw?.pctGestio == null || Number.isNaN(Number(raw.pctGestio))
      ? ingressos > 0
        ? round4((gestio / ingressos) * 100)
        : null
      : round4(Number(raw.pctGestio))
  return { ingressos, compres, gestio, pctCompres, pctGestio }
}

function normalizeRow(
  raw: Partial<OpsiaPctAnualLnRow> & { lnCodi: string }
): OpsiaPctAnualLnRow {
  const t = normalizeTotals(raw)
  return {
    lnCodi: String(raw.lnCodi || '').toUpperCase(),
    lnNom: String(raw.lnNom || raw.lnCodi || ''),
    ...t,
  }
}

export async function fetchOpsiaPctAnual(
  year: number,
  grup = 'calblay'
): Promise<OpsiaPctAnualApiResponse> {
  const { baseUrl, apiKey, configured } = getOpsiaFinanceConfig()
  if (!configured) {
    throw new Error(
      'Falta OPSIA_FINANCE_BASE_URL o OPSIA_FINANCE_API_KEY a l’entorn'
    )
  }

  const params = new URLSearchParams({
    year: String(year),
    grup: String(grup || 'calblay'),
  })
  const url = `${baseUrl}/api/external/cost-pct-anual?${params.toString()}`
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
        `OpsiaFinance ha retornat HTML. L’endpoint cost-pct-anual encara no està desplegat. Status ${res.status}.`
      )
    }
    throw new Error(
      `OpsiaFinance ${res.status}: ${body.slice(0, 200) || res.statusText}`
    )
  }

  const data = (await res.json()) as OpsiaPctAnualApiResponse
  return {
    year: Number(data.year) || year,
    vista: 'gestio',
    grup: String(data.grup || grup),
    general: normalizeTotals(data.general),
    lines: Array.isArray(data.lines)
      ? data.lines.map((l) => normalizeRow(l))
      : [],
  }
}

export async function getOpsiaPctAnualDoc(
  year: number,
  grup = 'calblay'
): Promise<OpsiaPctAnualDoc | null> {
  const snap = await db
    .collection(SERVICE_COST_OPSIA_PCT_ANUAL_COL)
    .doc(docId(year, grup))
    .get()
  if (!snap.exists) return null
  return snap.data() as OpsiaPctAnualDoc
}

export async function syncOpsiaPctAnual(opts: {
  year: number
  grup?: string
  userId?: string
}): Promise<OpsiaPctAnualDoc> {
  const grup = opts.grup || 'calblay'
  const prev = await getOpsiaPctAnualDoc(opts.year, grup)
  const api = await fetchOpsiaPctAnual(opts.year, grup)

  const byLn: Record<string, OpsiaPctAnualLnRow> = {}
  for (const row of api.lines) {
    byLn[row.lnCodi] = row
  }

  const doc: OpsiaPctAnualDoc = {
    year: api.year,
    vista: 'gestio',
    grup: api.grup,
    general: api.general,
    byLn,
    source: 'opsia-finance-gestio-pct-anual',
    syncedAt: new Date().toISOString(),
    syncedBy: opts.userId || prev?.syncedBy,
  }

  await db
    .collection(SERVICE_COST_OPSIA_PCT_ANUAL_COL)
    .doc(docId(opts.year, grup))
    .set(doc)
  return doc
}
