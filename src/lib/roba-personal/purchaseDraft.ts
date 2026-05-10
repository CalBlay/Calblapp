import { Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import {
  avgDailyFromSemesterTotal,
  CONSUMPTION_WINDOW_DAYS,
  daysUntilMinimum,
  listDeliveredLineRollups,
  suggestedSemesterOrderQty,
  sumDeliveredUnitsByProductSince,
} from '@/lib/roba-personal/deliveryConsumption'

const PROD = DOTACIO_COLLECTIONS.products
const REQ = DOTACIO_COLLECTIONS.requests
const MOV = DOTACIO_COLLECTIONS.stockMovements

export type PurchaseDraftLine = {
  productId: string
  code: string
  name: string
  size: string
  supplier: string
  quantityOnHand: number
  minStock: number | null
  suggestedFromMin: number
}

export type PurchaseDemandLine = {
  productId: string
  code: string
  name: string
  size: string
  supplier: string
  quantityDemanded: number
}

/** Una fila per a la vista d’estoc + previsió. */
export type StockInsightRow = {
  productId: string
  code: string
  name: string
  size: string
  supplier: string
  magatzem: string
  quantityOnHand: number
  quantityReserved: number
  quantityAvailable: number
  quantityPendingTheoretical: number
  quantityAvailableAfterTheoretical: number
  minStock: number | null
  gapToMin: number
  consumption6m: number
  annualDeliveredCurrentYear: number
  annualDeliveredPreviousYear: number
  avgDaily: number
  avgDailySource: 'since_last_inbound' | 'last_180_days'
  avgDailyWindowDays: number
  daysUntilMin: number | null
  atOrBelowMin: boolean
  hasConsumptionHistory: boolean
  suggestedSemesterQty: number | null
}

const NON_INBOUND_STOCK_REASONS = new Set([
  'request_reserve',
  'request_reserve_release',
])

/** Línia de comanda proposada (semestre + mínims). */
export type PurchaseProposalLine = StockInsightRow & {
  suggestedQty: number
}

/** Sol·licituds que encara generen demanda operativa (no lliurades ni cancel·lades). */
const OPEN_REQUEST = new Set([
  'submitted',
  'sent_to_rrhh',
  'approved',
  'draft',
  'prepared',
  'ready_for_worker_delivery',
  'picked_up',
])

function purchaseTextTallaFragment(size: string): string {
  const t = (size || '').trim()
  return t ? ` | talla ${t}` : ''
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export type RobaInventoryContext = {
  generatedAt: string
  consumptionWindowDays: number
  stockRows: StockInsightRow[]
  /** Només productes amb mínim definit i quantitat de comanda > 0. */
  proposalLines: PurchaseProposalLine[]
  /** Mateixes línies agrupades per proveïdor (clau = proveïdor). */
  bySupplier: Record<string, PurchaseProposalLine[]>
  shortfalls: PurchaseDraftLine[]
  demandByProduct: PurchaseDemandLine[]
  alertsAtOrBelowMin: number
}

export async function buildRobaInventoryContext(): Promise<RobaInventoryContext> {
  const since = new Date()
  since.setDate(since.getDate() - CONSUMPTION_WINDOW_DAYS)
  const currentYear = new Date().getFullYear()
  const previousYear = currentYear - 1

  const [prodSnap, reqSnap, consumptionMap, movSnap, deliveredRollups] = await Promise.all([
    db.collection(PROD).get(),
    db.collection(REQ).limit(500).get(),
    sumDeliveredUnitsByProductSince(since),
    db.collection(MOV).orderBy('createdAt', 'desc').get(),
    listDeliveredLineRollups(),
  ])

  const products = new Map<
    string,
    {
      code: string
      name: string
      size: string
      supplier: string
      magatzem: string
      quantityOnHand: number
      quantityReserved: number
      minStock: number | null
    }
  >()

  for (const d of prodSnap.docs) {
    const x = d.data() as {
      code?: string
      name?: string
      size?: string
      supplier?: string
      magatzem?: string
      quantityOnHand?: number
      quantityReserved?: number
      minStock?: number | null
      isActive?: boolean
    }
    if (x.isActive === false) continue
    const minStock =
      typeof x.minStock === 'number' && !Number.isNaN(x.minStock) ? x.minStock : null
    const onHand = Number(x.quantityOnHand ?? 0)
    const reserved = Math.max(0, Number(x.quantityReserved ?? 0))
    products.set(d.id, {
      code: String(x.code || ''),
      name: String(x.name || ''),
      size: String(x.size || ''),
      supplier: String(x.supplier || ''),
      magatzem: String(x.magatzem || '').trim(),
      quantityOnHand: onHand,
      quantityReserved: reserved,
      minStock,
    })
  }

  const lastInboundByProduct = new Map<string, Date>()
  for (const d of movSnap.docs) {
    const data = d.data() as {
      productId?: string
      quantityDelta?: number
      reason?: string
      createdAt?: Timestamp
    }
    const productId = String(data.productId || '').trim()
    const quantityDelta = Number(data.quantityDelta ?? 0)
    const reason = String(data.reason || '').trim()
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null
    if (!productId || !createdAt) continue
    if (quantityDelta <= 0) continue
    if (NON_INBOUND_STOCK_REASONS.has(reason)) continue
    if (!lastInboundByProduct.has(productId)) {
      lastInboundByProduct.set(productId, createdAt)
    }
  }

  const stockRows: StockInsightRow[] = []
  let alertsAtOrBelowMin = 0
  const annualDeliveredCurrentYearByProduct = new Map<string, number>()
  const annualDeliveredPreviousYearByProduct = new Map<string, number>()

  for (const delivery of deliveredRollups) {
    const year = delivery.deliveredAt.getFullYear()
    if (year !== currentYear && year !== previousYear) continue
    for (const line of delivery.lines) {
      const productId = String(line.productId || '').trim()
      const quantity = Number(line.quantity)
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue
      const targetMap =
        year === currentYear
          ? annualDeliveredCurrentYearByProduct
          : annualDeliveredPreviousYearByProduct
      targetMap.set(productId, (targetMap.get(productId) ?? 0) + quantity)
    }
  }

  const pendingTheoreticalByProduct = new Map<string, number>()
  for (const d of reqSnap.docs) {
    const data = d.data() as {
      status?: string
      lines?: Array<{ productId?: string; quantity?: number }>
    }
    const st = String(data.status || '')
    if (st !== 'submitted') continue
    const lines = Array.isArray(data.lines) ? data.lines : []
    for (const ln of lines) {
      const pid = String(ln.productId || '').trim()
      const q = Number(ln.quantity)
      if (!pid || !Number.isFinite(q) || q <= 0) continue
      pendingTheoreticalByProduct.set(pid, (pendingTheoreticalByProduct.get(pid) ?? 0) + q)
    }
  }

  for (const [id, p] of products) {
    const q6 = consumptionMap.get(id) ?? 0
    const lastInboundAt = lastInboundByProduct.get(id) ?? null
    const lastInboundDay = lastInboundAt ? startOfLocalDay(lastInboundAt) : null
    const deliveredSinceInbound = lastInboundAt
      ? deliveredRollups.reduce((acc, delivery) => {
          if (lastInboundDay && delivery.deliveredAt < lastInboundDay) return acc
          return (
            acc +
            delivery.lines.reduce(
              (sum, line) => sum + (line.productId === id ? line.quantity : 0),
              0
            )
          )
        }, 0)
      : 0
    const windowDaysSinceInbound = lastInboundDay
      ? Math.max(
          1,
          Math.ceil((Date.now() - lastInboundDay.getTime()) / (1000 * 60 * 60 * 24))
        )
      : 0
    const useInboundWindow = Boolean(lastInboundAt && windowDaysSinceInbound > 0)
    const avgDaily = useInboundWindow
      ? avgDailyFromSemesterTotal(deliveredSinceInbound, windowDaysSinceInbound)
      : avgDailyFromSemesterTotal(q6, CONSUMPTION_WINDOW_DAYS)
    const avgDailyWindowDays = useInboundWindow ? windowDaysSinceInbound : CONSUMPTION_WINDOW_DAYS
    const avgDailySource = useInboundWindow ? 'since_last_inbound' : 'last_180_days'
    const min = p.minStock
    const available = Math.max(0, p.quantityOnHand - p.quantityReserved)
    const quantityPendingTheoretical = pendingTheoreticalByProduct.get(id) ?? 0
    const quantityAvailableAfterTheoretical = available - quantityPendingTheoretical
    const annualDeliveredCurrentYear = annualDeliveredCurrentYearByProduct.get(id) ?? 0
    const annualDeliveredPreviousYear = annualDeliveredPreviousYearByProduct.get(id) ?? 0
    const gapToMin = min != null ? Math.max(0, min - available) : 0
    const atOrBelowMin = min != null && available <= min
    if (atOrBelowMin) alertsAtOrBelowMin++

    let daysUntilMin: number | null = null
    if (min != null) {
      daysUntilMin = daysUntilMinimum(available, min, avgDaily)
    }

    const hasConsumptionHistory = q6 > 0
    let suggestedSemesterQty: number | null = null
    if (min != null) {
      suggestedSemesterQty = suggestedSemesterOrderQty(available, min, q6)
    }

    stockRows.push({
      productId: id,
      code: p.code,
      name: p.name,
      size: p.size,
      supplier: p.supplier,
      magatzem: p.magatzem,
      quantityOnHand: p.quantityOnHand,
      quantityReserved: p.quantityReserved,
      quantityAvailable: available,
      quantityPendingTheoretical,
      quantityAvailableAfterTheoretical,
      minStock: min,
      gapToMin,
      consumption6m: q6,
      annualDeliveredCurrentYear,
      annualDeliveredPreviousYear,
      avgDaily,
      avgDailySource,
      avgDailyWindowDays,
      daysUntilMin,
      atOrBelowMin,
      hasConsumptionHistory,
      suggestedSemesterQty,
    })
  }

  stockRows.sort(
    (a, b) => a.code.localeCompare(b.code, 'ca') || a.size.localeCompare(b.size, 'ca')
  )

  const proposalLines: PurchaseProposalLine[] = []
  for (const row of stockRows) {
    if (row.minStock == null) continue
    const q = row.suggestedSemesterQty ?? 0
    if (q <= 0) continue
    proposalLines.push({
      ...row,
      suggestedQty: q,
    })
  }

  const bySupplier: Record<string, PurchaseProposalLine[]> = {}
  for (const line of proposalLines) {
    const key = line.supplier || '(sense proveïdor)'
    if (!bySupplier[key]) bySupplier[key] = []
    bySupplier[key].push(line)
  }
  for (const k of Object.keys(bySupplier)) {
    bySupplier[k].sort(
      (a, b) => a.code.localeCompare(b.code, 'ca') || a.size.localeCompare(b.size, 'ca')
    )
  }

  const shortfalls: PurchaseDraftLine[] = []
  for (const row of stockRows) {
    if (row.minStock === null) continue
    if (row.gapToMin > 0) {
      shortfalls.push({
        productId: row.productId,
        code: row.code,
        name: row.name,
        size: row.size,
        supplier: row.supplier,
        quantityOnHand: row.quantityAvailable,
        minStock: row.minStock,
        suggestedFromMin: row.gapToMin,
      })
    }
  }

  const demandAgg = new Map<string, number>()
  for (const d of reqSnap.docs) {
    const data = d.data() as {
      status?: string
      lines?: Array<{ productId?: string; quantity?: number }>
    }
    const st = String(data.status || '')
    if (!OPEN_REQUEST.has(st)) continue
    const lines = Array.isArray(data.lines) ? data.lines : []
    for (const ln of lines) {
      const pid = String(ln.productId || '').trim()
      const q = Number(ln.quantity)
      if (!pid || !Number.isFinite(q) || q <= 0) continue
      demandAgg.set(pid, (demandAgg.get(pid) ?? 0) + q)
    }
  }

  const demandByProduct: PurchaseDemandLine[] = []
  for (const [productId, quantityDemanded] of demandAgg) {
    const p = products.get(productId)
    if (!p) continue
    demandByProduct.push({
      productId,
      code: p.code,
      name: p.name,
      size: p.size,
      supplier: p.supplier,
      quantityDemanded,
    })
  }
  demandByProduct.sort(
    (a, b) => a.code.localeCompare(b.code, 'ca') || a.size.localeCompare(b.size, 'ca')
  )

  return {
    generatedAt: new Date().toISOString(),
    consumptionWindowDays: CONSUMPTION_WINDOW_DAYS,
    stockRows,
    proposalLines,
    bySupplier,
    shortfalls,
    demandByProduct,
    alertsAtOrBelowMin,
  }
}

export function purchaseDraftToText(
  draft: Awaited<ReturnType<typeof buildRobaInventoryContext>>
): string {
  const lines: string[] = []
  lines.push('Necessitats de compra — Roba personal / EPI')
  lines.push(`Generat: ${draft.generatedAt}`)
  lines.push(
    `Consum agregat: darrers ${draft.consumptionWindowDays} dies (entregues a treballadors).`
  )
  lines.push(`Avís: ${draft.alertsAtOrBelowMin} article(s) amb estoc ≤ mínim.`)
  lines.push('')

  lines.push('--- Proposta semestral (dèficit fins al mínim + sortides dels darrers 6 mesos) ---')
  if (draft.proposalLines.length === 0) {
    lines.push('(cap línia amb quantitat suggerida > 0)')
  } else {
    const suppliers = Object.keys(draft.bySupplier).sort((a, b) =>
      a.localeCompare(b, 'ca', { sensitivity: 'base' })
    )
    for (const sup of suppliers) {
      lines.push('')
      lines.push(`== Proveïdor: ${sup} ==`)
      for (const s of draft.bySupplier[sup]) {
        lines.push(
          `${s.code} | ${s.name}${purchaseTextTallaFragment(s.size)} | estoc: ${s.quantityOnHand} | mín: ${s.minStock} | consum 6m: ${s.consumption6m} | suggerit comanda: ${s.suggestedQty} (dèficit ${s.gapToMin} + consum 6m)`
        )
      }
    }
  }

  lines.push('')
  lines.push('--- Sota mínim d’estoc (només dèficit) ---')
  if (draft.shortfalls.length === 0) {
    lines.push('(cap)')
  } else {
    for (const s of draft.shortfalls) {
      lines.push(
        `${s.code} | ${s.name}${purchaseTextTallaFragment(s.size)} | proveïdor: ${s.supplier} | estoc: ${s.quantityOnHand} | mín: ${s.minStock} | dèficit: ${s.suggestedFromMin}`
      )
    }
  }

  lines.push('')
  lines.push('--- Demanda agrupada (sol·licituds obertes) ---')
  if (draft.demandByProduct.length === 0) {
    lines.push('(cap)')
  } else {
    for (const d of draft.demandByProduct) {
      lines.push(
        `${d.code} | ${d.name}${purchaseTextTallaFragment(d.size)} | proveïdor: ${d.supplier} | unitats demanades: ${d.quantityDemanded}`
      )
    }
  }
  return lines.join('\n')
}
