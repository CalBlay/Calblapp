import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'

const PROD = DOTACIO_COLLECTIONS.products
const REQ = DOTACIO_COLLECTIONS.requests

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

const OPEN_REQUEST = new Set(['submitted', 'approved', 'draft'])

export async function buildPurchaseDraft(): Promise<{
  shortfalls: PurchaseDraftLine[]
  demandByProduct: PurchaseDemandLine[]
  generatedAt: string
}> {
  const [prodSnap, reqSnap] = await Promise.all([
    db.collection(PROD).get(),
    db.collection(REQ).limit(500).get(),
  ])

  const products = new Map<
    string,
    {
      code: string
      name: string
      size: string
      supplier: string
      quantityOnHand: number
      minStock: number | null
    }
  >()

  for (const d of prodSnap.docs) {
    const x = d.data() as {
      code?: string
      name?: string
      size?: string
      supplier?: string
      quantityOnHand?: number
      minStock?: number | null
      isActive?: boolean
    }
    if (x.isActive === false) continue
    const minStock =
      typeof x.minStock === 'number' && !Number.isNaN(x.minStock) ? x.minStock : null
    products.set(d.id, {
      code: String(x.code || ''),
      name: String(x.name || ''),
      size: String(x.size || ''),
      supplier: String(x.supplier || ''),
      quantityOnHand: Number(x.quantityOnHand ?? 0),
      minStock,
    })
  }

  const shortfalls: PurchaseDraftLine[] = []
  for (const [id, p] of products) {
    if (p.minStock === null) continue
    const gap = p.minStock - p.quantityOnHand
    if (gap > 0) {
      shortfalls.push({
        productId: id,
        code: p.code,
        name: p.name,
        size: p.size,
        supplier: p.supplier,
        quantityOnHand: p.quantityOnHand,
        minStock: p.minStock,
        suggestedFromMin: gap,
      })
    }
  }
  shortfalls.sort((a, b) => a.code.localeCompare(b.code, 'ca') || a.size.localeCompare(b.size, 'ca'))

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
    shortfalls,
    demandByProduct,
    generatedAt: new Date().toISOString(),
  }
}

export function purchaseDraftToText(draft: Awaited<ReturnType<typeof buildPurchaseDraft>>): string {
  const lines: string[] = []
  lines.push('Necessitats de compra — Roba personal / EPI')
  lines.push(`Generat: ${draft.generatedAt}`)
  lines.push('')
  lines.push('--- Sota mínim d’estoc (minStock − estoc actual) ---')
  if (draft.shortfalls.length === 0) {
    lines.push('(cap)')
  } else {
    for (const s of draft.shortfalls) {
      lines.push(
        `${s.code} | ${s.name} | ${s.size} | proveïdor: ${s.supplier} | estoc: ${s.quantityOnHand} | mín: ${s.minStock} | suggerit: ${s.suggestedFromMin}`
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
        `${d.code} | ${d.name} | ${d.size} | proveïdor: ${d.supplier} | unitats demanades: ${d.quantityDemanded}`
      )
    }
  }
  return lines.join('\n')
}
