/**
 * Agregacions per Resultats (tipus servei / ubicació / mes).
 */

import type { ServiceCostListItem } from '@/lib/costServeis/types'
import type { EventFixedCosts } from '@/lib/costServeis/resultatsFixedCosts'

export type ResultatsCostItem = ServiceCostListItem & EventFixedCosts

export type ResultatsMetrics = {
  eventCount: number
  numPax: number
  billing: number
  operationalCost: number
  contributionMargin: number
  fixedDirect: number
  marginAfterDirect: number
  fixedIndirect: number
  purchasePct: number | null
  managementPct: number | null
  theoreticalPurchaseCost: number
  theoreticalManagementCost: number
  potsFullCost: number
  potsFullMargin: number
  potsFullMarginPct: number | null
  managementFullCost: number
  managementFullMargin: number
  managementFullMarginPct: number | null
  fixedDirectNormalized: number
  fixedIndirectNormalized: number
  normalizedPotsFullCost: number
  normalizedPotsFullMargin: number
  normalizedPotsFullMarginPct: number | null
  /** Compatibilitat: cost complet real. */
  cost: number
  /** Compatibilitat: resultat complet real. */
  margin: number
  /** marge / facturació (null si no hi ha facturació) */
  marginPct: number | null
  /** cost / facturació */
  costPct: number | null
  /** cost / pax */
  costPerPax: number | null
  /** facturació / pax */
  billingPerPax: number | null
}

export type ResultatsItemRow = ResultatsMetrics & {
  eventId: string
  eventName: string
  eventDate: string
  ym: string
  ln: string
  location: string
  serviceType: string
  hasSheet: boolean
}

export type ResultatsGroupRow = ResultatsMetrics & {
  key: string
  label: string
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

export function metricsFromParts(parts: {
  eventCount: number
  numPax: number
  billing: number
  operationalCost: number
  fixedDirect: number
  fixedIndirect: number
  fixedDirectNormalized: number
  fixedIndirectNormalized: number
  theoreticalPurchaseCost: number
  theoreticalManagementCost: number
}): ResultatsMetrics {
  const billing = round2(parts.billing)
  const operationalCost = round2(parts.operationalCost)
  const fixedDirect = round2(parts.fixedDirect)
  const fixedIndirect = round2(parts.fixedIndirect)
  const fixedDirectNormalized = round2(parts.fixedDirectNormalized)
  const fixedIndirectNormalized = round2(parts.fixedIndirectNormalized)
  const theoreticalPurchaseCost = round2(parts.theoreticalPurchaseCost)
  const theoreticalManagementCost = round2(parts.theoreticalManagementCost)
  const contributionMargin = round2(billing - operationalCost)
  const marginAfterDirect = round2(contributionMargin - fixedDirect)
  const potsFullCost = round2(
    operationalCost + theoreticalPurchaseCost + fixedDirect + fixedIndirect
  )
  const potsFullMargin = round2(billing - potsFullCost)
  const managementFullCost = round2(
    operationalCost +
      theoreticalPurchaseCost +
      theoreticalManagementCost +
      fixedDirect
  )
  const managementFullMargin = round2(billing - managementFullCost)
  const normalizedPotsFullCost = round2(
    operationalCost +
      theoreticalPurchaseCost +
      fixedDirectNormalized +
      fixedIndirectNormalized
  )
  const normalizedPotsFullMargin = round2(billing - normalizedPotsFullCost)
  const numPax = parts.numPax
  return {
    eventCount: parts.eventCount,
    numPax,
    billing,
    operationalCost,
    contributionMargin,
    fixedDirect,
    marginAfterDirect,
    fixedIndirect,
    purchasePct:
      billing > 0 ? round4(theoreticalPurchaseCost / billing) : null,
    managementPct:
      billing > 0 ? round4(theoreticalManagementCost / billing) : null,
    theoreticalPurchaseCost,
    theoreticalManagementCost,
    potsFullCost,
    potsFullMargin,
    potsFullMarginPct: billing > 0 ? round4(potsFullMargin / billing) : null,
    managementFullCost,
    managementFullMargin,
    managementFullMarginPct:
      billing > 0 ? round4(managementFullMargin / billing) : null,
    fixedDirectNormalized,
    fixedIndirectNormalized,
    normalizedPotsFullCost,
    normalizedPotsFullMargin,
    normalizedPotsFullMarginPct:
      billing > 0 ? round4(normalizedPotsFullMargin / billing) : null,
    cost: potsFullCost,
    margin: potsFullMargin,
    marginPct: billing > 0 ? round4(potsFullMargin / billing) : null,
    costPct: billing > 0 ? round4(potsFullCost / billing) : null,
    costPerPax: numPax > 0 ? round2(potsFullCost / numPax) : null,
    billingPerPax: numPax > 0 ? round2(billing / numPax) : null,
  }
}

export function toResultatsItemRow(item: ResultatsCostItem): ResultatsItemRow {
  const m = metricsFromParts({
    eventCount: 1,
    numPax: item.numPax || 0,
    billing: item.billing || 0,
    operationalCost: item.operationalTotal || 0,
    fixedDirect: item.fixedDirect || 0,
    fixedIndirect: item.fixedIndirect || 0,
    fixedDirectNormalized: item.fixedDirectNormalized || 0,
    fixedIndirectNormalized: item.fixedIndirectNormalized || 0,
    theoreticalPurchaseCost: item.theoreticalPurchaseCost || 0,
    theoreticalManagementCost: item.theoreticalManagementCost || 0,
  })
  return {
    ...m,
    eventId: item.eventId,
    eventName: item.eventName,
    eventDate: item.eventDate,
    ym: item.eventDate.slice(0, 7),
    ln: item.ln,
    location: item.location || '',
    serviceType: item.serviceType || '',
    hasSheet: item.hasSheet,
  }
}

function aggregateBy(
  items: ResultatsCostItem[],
  keyFn: (item: ResultatsCostItem) => string,
  labelFn: (key: string, item: ResultatsCostItem) => string
): ResultatsGroupRow[] {
  const buckets = new Map<
    string,
    {
      label: string
      eventCount: number
      numPax: number
      billing: number
      operationalCost: number
      fixedDirect: number
      fixedIndirect: number
      fixedDirectNormalized: number
      fixedIndirectNormalized: number
      theoreticalPurchaseCost: number
      theoreticalManagementCost: number
    }
  >()

  for (const item of items) {
    const key = keyFn(item)
    const prev = buckets.get(key)
    if (!prev) {
      buckets.set(key, {
        label: labelFn(key, item),
        eventCount: 1,
        numPax: item.numPax || 0,
        billing: item.billing || 0,
        operationalCost: item.operationalTotal || 0,
        fixedDirect: item.fixedDirect || 0,
        fixedIndirect: item.fixedIndirect || 0,
        fixedDirectNormalized: item.fixedDirectNormalized || 0,
        fixedIndirectNormalized: item.fixedIndirectNormalized || 0,
        theoreticalPurchaseCost: item.theoreticalPurchaseCost || 0,
        theoreticalManagementCost: item.theoreticalManagementCost || 0,
      })
    } else {
      prev.eventCount += 1
      prev.numPax += item.numPax || 0
      prev.billing += item.billing || 0
      prev.operationalCost += item.operationalTotal || 0
      prev.fixedDirect += item.fixedDirect || 0
      prev.fixedIndirect += item.fixedIndirect || 0
      prev.fixedDirectNormalized += item.fixedDirectNormalized || 0
      prev.fixedIndirectNormalized += item.fixedIndirectNormalized || 0
      prev.theoreticalPurchaseCost += item.theoreticalPurchaseCost || 0
      prev.theoreticalManagementCost += item.theoreticalManagementCost || 0
    }
  }

  const rows: ResultatsGroupRow[] = []
  for (const [key, b] of buckets) {
    rows.push({
      key,
      label: b.label,
      ...metricsFromParts(b),
    })
  }

  rows.sort((a, b) => {
    const ma = a.marginPct ?? -Infinity
    const mb = b.marginPct ?? -Infinity
    if (mb !== ma) return mb - ma
    return a.label.localeCompare(b.label, 'ca')
  })
  return rows
}

export function summarizeResultats(items: ResultatsCostItem[]): ResultatsMetrics {
  let numPax = 0
  let billing = 0
  let operationalCost = 0
  let fixedDirect = 0
  let fixedIndirect = 0
  let fixedDirectNormalized = 0
  let fixedIndirectNormalized = 0
  let theoreticalPurchaseCost = 0
  let theoreticalManagementCost = 0
  for (const item of items) {
    numPax += item.numPax || 0
    billing += item.billing || 0
    operationalCost += item.operationalTotal || 0
    fixedDirect += item.fixedDirect || 0
    fixedIndirect += item.fixedIndirect || 0
    fixedDirectNormalized += item.fixedDirectNormalized || 0
    fixedIndirectNormalized += item.fixedIndirectNormalized || 0
    theoreticalPurchaseCost += item.theoreticalPurchaseCost || 0
    theoreticalManagementCost += item.theoreticalManagementCost || 0
  }
  return metricsFromParts({
    eventCount: items.length,
    numPax,
    billing,
    operationalCost,
    fixedDirect,
    fixedIndirect,
    fixedDirectNormalized,
    fixedIndirectNormalized,
    theoreticalPurchaseCost,
    theoreticalManagementCost,
  })
}

export function groupByServiceType(items: ResultatsCostItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => String(i.serviceType || '').trim() || '__sense__',
    (key, i) => (key === '__sense__' ? 'Sense tipus' : i.serviceType.trim())
  )
}

export function groupByLocation(items: ResultatsCostItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => String(i.location || '').trim() || '__sense__',
    (key, i) => (key === '__sense__' ? 'Sense ubicació' : i.location.trim())
  )
}

export function groupByMonth(items: ResultatsCostItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => i.eventDate.slice(0, 7) || '__sense__',
    (key) => (key === '__sense__' ? 'Sense mes' : key)
  )
}
