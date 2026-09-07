/**
 * Agregacions per Resultats (tipus servei / ubicació / mes).
 */

import type { ServiceCostListItem } from '@/lib/costServeis/types'

export type ResultatsMetrics = {
  eventCount: number
  numPax: number
  billing: number
  cost: number
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
  cost: number
}): ResultatsMetrics {
  const billing = round2(parts.billing)
  const cost = round2(parts.cost)
  const margin = round2(billing - cost)
  const numPax = parts.numPax
  return {
    eventCount: parts.eventCount,
    numPax,
    billing,
    cost,
    margin,
    marginPct: billing > 0 ? round4(margin / billing) : null,
    costPct: billing > 0 ? round4(cost / billing) : null,
    costPerPax: numPax > 0 ? round2(cost / numPax) : null,
    billingPerPax: numPax > 0 ? round2(billing / numPax) : null,
  }
}

export function toResultatsItemRow(item: ServiceCostListItem): ResultatsItemRow {
  const m = metricsFromParts({
    eventCount: 1,
    numPax: item.numPax || 0,
    billing: item.billing || 0,
    cost: item.total || 0,
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
  items: ServiceCostListItem[],
  keyFn: (item: ServiceCostListItem) => string,
  labelFn: (key: string, item: ServiceCostListItem) => string
): ResultatsGroupRow[] {
  const buckets = new Map<
    string,
    { label: string; eventCount: number; numPax: number; billing: number; cost: number }
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
        cost: item.total || 0,
      })
    } else {
      prev.eventCount += 1
      prev.numPax += item.numPax || 0
      prev.billing += item.billing || 0
      prev.cost += item.total || 0
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

export function summarizeResultats(items: ServiceCostListItem[]): ResultatsMetrics {
  let numPax = 0
  let billing = 0
  let cost = 0
  for (const item of items) {
    numPax += item.numPax || 0
    billing += item.billing || 0
    cost += item.total || 0
  }
  return metricsFromParts({
    eventCount: items.length,
    numPax,
    billing,
    cost,
  })
}

export function groupByServiceType(items: ServiceCostListItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => String(i.serviceType || '').trim() || '__sense__',
    (key, i) => (key === '__sense__' ? 'Sense tipus' : i.serviceType.trim())
  )
}

export function groupByLocation(items: ServiceCostListItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => String(i.location || '').trim() || '__sense__',
    (key, i) => (key === '__sense__' ? 'Sense ubicació' : i.location.trim())
  )
}

export function groupByMonth(items: ServiceCostListItem[]): ResultatsGroupRow[] {
  return aggregateBy(
    items,
    (i) => i.eventDate.slice(0, 7) || '__sense__',
    (key) => (key === '__sense__' ? 'Sense mes' : key)
  )
}
