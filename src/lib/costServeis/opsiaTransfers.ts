import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getOpsiaFinanceConfig } from '@/lib/costServeis/opsiaFinance'
import {
  SERVICE_COST_OPSIA_TRANSFERS_COL,
  type OpsiaTransferLine,
  type OpsiaTransferDestinationGroup,
  type OpsiaTransferSourceGroup,
  type OpsiaTransfersApiResponse,
  type OpsiaTransfersMonthDoc,
  type OpsiaTransfersStatus,
} from '@/lib/costServeis/opsiaTransfersTypes'

export {
  SERVICE_COST_OPSIA_TRANSFERS_COL,
  type OpsiaTransferLine,
  type OpsiaTransferSummary,
  type OpsiaTransfersApiResponse,
  type OpsiaTransfersMonthDoc,
} from '@/lib/costServeis/opsiaTransfersTypes'

const ALLOWED_SOURCE_GROUPS = new Set<OpsiaTransferSourceGroup>([
  'CUINA',
  'CATERING',
])
const ALLOWED_DESTINATION_GROUPS = new Set<OpsiaTransferDestinationGroup>([
  'EMPRESA',
  'CASAMENTS',
  'FOODLOVERS',
  'CATERING',
])

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function round2(value: unknown): number {
  const number = Number(value) || 0
  return Math.round((number + Number.EPSILON) * 100) / 100
}

function nullableText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeLine(raw: Partial<OpsiaTransferLine>): OpsiaTransferLine | null {
  const origenGrup = String(raw.origenGrup || '').toUpperCase() as OpsiaTransferSourceGroup
  const destiGrup = String(raw.destiGrup || '').toUpperCase() as OpsiaTransferDestinationGroup
  const destiLnCodi = String(raw.destiLnCodi || '').toUpperCase()
  if (
    !ALLOWED_SOURCE_GROUPS.has(origenGrup) ||
    !ALLOWED_DESTINATION_GROUPS.has(destiGrup)
  ) {
    return null
  }
  return {
    id: String(raw.id || ''),
    origenGrup,
    origenCentreCodi: String(raw.origenCentreCodi || '').toUpperCase(),
    origenCentreNom: String(raw.origenCentreNom || ''),
    origenDeptCodi: nullableText(raw.origenDeptCodi)?.toUpperCase() ?? null,
    origenDeptNom: nullableText(raw.origenDeptNom),
    destiCentreCodi: String(raw.destiCentreCodi || '').toUpperCase(),
    destiCentreNom: String(raw.destiCentreNom || ''),
    destiDeptCodi: nullableText(raw.destiDeptCodi)?.toUpperCase() ?? null,
    destiDeptNom: nullableText(raw.destiDeptNom),
    destiGrup,
    destiLnCodi,
    destiLnNom: String(raw.destiLnNom || destiLnCodi),
    minuts: round2(raw.minuts),
    hores: round2(raw.hores),
    tarifaHora: round2(raw.tarifaHora),
    importTotal: round2(raw.importTotal),
  }
}

function normalizeStatus(value: unknown): OpsiaTransfersStatus {
  return value === 'CONFIRMAT' || value === 'BORRADOR' ? value : 'SENSE_DADES'
}

/** Obté només els traspassos rellevants i confirmats exposats per Opsia. */
export async function fetchOpsiaTransfersMonth(
  year: number,
  month: number
): Promise<OpsiaTransfersApiResponse> {
  const { baseUrl, apiKey, configured } = getOpsiaFinanceConfig()
  if (!configured) {
    throw new Error(
      'Falta OPSIA_FINANCE_BASE_URL o OPSIA_FINANCE_API_KEY a l’entorn'
    )
  }

  const params = new URLSearchParams({ year: String(year), month: String(month) })
  const res = await fetch(
    `${baseUrl}/api/external/cost-traspassos-serveis?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpsiaFinance ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }
  const data = (await res.json()) as Partial<OpsiaTransfersApiResponse>
  const lines = (Array.isArray(data.lines) ? data.lines : [])
    .map(normalizeLine)
    .filter((line): line is OpsiaTransferLine => line !== null)

  const summaryMap = new Map<string, OpsiaTransfersApiResponse['summary'][number]>()
  for (const line of lines) {
    const key = [
      line.origenGrup,
      line.origenDeptCodi ?? line.origenDeptNom ?? line.origenCentreCodi,
      line.destiCentreCodi,
      line.destiDeptCodi ?? '',
    ].join('|')
    const row = summaryMap.get(key) ?? {
      origenGrup: line.origenGrup,
      origenDeptCodi: line.origenDeptCodi,
      origenDeptNom: line.origenDeptNom || line.origenCentreNom,
      destiCentreCodi: line.destiCentreCodi,
      destiCentreNom: line.destiCentreNom,
      destiDeptCodi: line.destiDeptCodi,
      destiDeptNom: line.destiDeptNom,
      destiGrup: line.destiGrup,
      destiLnCodi: line.destiLnCodi,
      destiLnNom: line.destiLnNom,
      minuts: 0,
      hores: 0,
      importTotal: 0,
      moviments: 0,
    }
    row.minuts += line.minuts
    row.hores += line.hores
    row.importTotal += line.importTotal
    row.moviments += 1
    summaryMap.set(key, row)
  }

  return {
    year: Number(data.year) || year,
    month: Number(data.month) || month,
    estat: normalizeStatus(data.estat),
    sourceExecutionId: nullableText(data.sourceExecutionId),
    sourceConfirmedAt: nullableText(data.sourceConfirmedAt),
    filters: {
      origenGrups: ['CUINA', 'CATERING'],
      destiGrups: ['EMPRESA', 'CASAMENTS', 'FOODLOVERS', 'CATERING'],
    },
    totals: {
      minuts: round2(lines.reduce((sum, line) => sum + line.minuts, 0)),
      hores: round2(lines.reduce((sum, line) => sum + line.hores, 0)),
      importTotal: round2(lines.reduce((sum, line) => sum + line.importTotal, 0)),
      moviments: lines.length,
    },
    summary: [...summaryMap.values()].map((row) => ({
      ...row,
      minuts: round2(row.minuts),
      hores: round2(row.hores),
      importTotal: round2(row.importTotal),
    })),
    lines,
  }
}

export async function listOpsiaTransfersMonthDocs(input: {
  fromYm: string
  toYm: string
}): Promise<OpsiaTransfersMonthDoc[]> {
  if (!/^\d{4}-\d{2}$/.test(input.fromYm) || !/^\d{4}-\d{2}$/.test(input.toYm)) {
    return []
  }
  const snap = await db
    .collection(SERVICE_COST_OPSIA_TRANSFERS_COL)
    .where('ym', '>=', input.fromYm)
    .where('ym', '<=', input.toYm)
    .orderBy('ym', 'asc')
    .get()
  return snap.docs.map((doc) => doc.data() as OpsiaTransfersMonthDoc)
}

export async function getOpsiaTransfersMonthDoc(
  year: number,
  month: number
): Promise<OpsiaTransfersMonthDoc | null> {
  const snap = await db
    .collection(SERVICE_COST_OPSIA_TRANSFERS_COL)
    .doc(ymKey(year, month))
    .get()
  return snap.exists ? (snap.data() as OpsiaTransfersMonthDoc) : null
}

export async function syncOpsiaTransfersMonth(input: {
  year: number
  month: number
  userId?: string
}): Promise<OpsiaTransfersMonthDoc> {
  const api = await fetchOpsiaTransfersMonth(input.year, input.month)
  const ym = ymKey(input.year, input.month)
  const doc: OpsiaTransfersMonthDoc = {
    ...api,
    year: input.year,
    month: input.month,
    ym,
    source: 'opsia-finance-confirmed-personnel-transfers',
    syncedAt: new Date().toISOString(),
    ...(input.userId ? { syncedBy: input.userId } : {}),
  }
  await db.collection(SERVICE_COST_OPSIA_TRANSFERS_COL).doc(ym).set(doc)
  return doc
}
