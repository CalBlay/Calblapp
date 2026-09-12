/**
 * Seed PE: agrega events del període + imputa pots Opsia per facturació.
 */

import { buildCostServeisListItems } from '@/lib/costServeis/buildListItems'
import type { ServiceCostListItem } from '@/lib/costServeis/types'
import { listOpsiaFixedLnMonthDocs } from '@/lib/costServeis/opsiaFixedLn'
import { listOpsiaEstructuraLnMonthDocs } from '@/lib/costServeis/opsiaEstructuraLn'
import { getOpsiaPctAnualDoc } from '@/lib/costServeis/opsiaPctAnual'
import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import { splitServiceTypeLabels } from '@/lib/serveis/utils'
import {
  peFromInputs,
  pctPointsToRatio,
  type PeMode,
} from '@/lib/costServeis/peCalc'
import type {
  PeSeedInputs,
  PeSeedMeta,
  PeSeedOptions,
  PeSeedResponse,
} from '@/lib/costServeis/peTypes'

export type {
  PeSeedInputs,
  PeSeedMeta,
  PeSeedOptions,
  PeSeedResponse,
} from '@/lib/costServeis/peTypes'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fold(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = []
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return out
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function itemMatchesService(
  item: ServiceCostListItem,
  serviceType: string
): boolean {
  const target = fold(serviceType)
  if (!target) return true
  const parts = splitServiceTypeLabels(item.serviceType)
  if (parts.length === 0) return fold(item.serviceType) === target
  return parts.some((p) => fold(p) === target)
}

function itemMatchesLocation(
  item: ServiceCostListItem,
  location: string
): boolean {
  const target = fold(location)
  if (!target) return true
  return fold(item.location) === target
}

function itemMatchesLn(item: ServiceCostListItem, ln: string): boolean {
  const target = fold(normalizeManualLnName(ln) || ln)
  if (!target) return true
  const itemLn = fold(normalizeManualLnName(item.ln) || item.ln)
  return itemLn === target
}

/** Troba clau Opsia (lnCodi) a partir del nom LN de l’event. */
export function resolveOpsiaLnCodi(
  byLn: Record<string, { lnCodi: string; lnNom: string }>,
  eventLn: string
): string | null {
  const raw = String(eventLn || '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (byLn[upper]) return upper

  // A CalBlapp aquesta LN es diu Agenda; a OpsiaFinance es diu CENTRAL.
  if (fold(raw) === 'agenda' && byLn.LN00000) return 'LN00000'

  const f = fold(normalizeManualLnName(raw) || raw)
  if (!f) return null

  for (const [codi, row] of Object.entries(byLn)) {
    if (fold(row.lnNom) === f) return codi
  }
  for (const [codi, row] of Object.entries(byLn)) {
    const nom = fold(row.lnNom)
    if (nom.includes(f) || f.includes(nom)) return codi
  }
  if (/^ln\d+/i.test(raw) && byLn[upper]) return upper
  return null
}

function collectOptions(items: ServiceCostListItem[]): PeSeedOptions {
  const services = new Set<string>()
  const locations = new Set<string>()
  const lns = new Set<string>()
  for (const it of items) {
    for (const part of splitServiceTypeLabels(it.serviceType)) {
      if (part) services.add(part)
    }
    if (it.serviceType && splitServiceTypeLabels(it.serviceType).length === 0) {
      services.add(it.serviceType.trim())
    }
    if (it.location?.trim()) locations.add(it.location.trim())
    const ln = normalizeManualLnName(it.ln) || it.ln?.trim()
    if (ln) lns.add(ln)
  }
  return {
    serviceTypes: [...services].sort((a, b) => a.localeCompare(b, 'ca')),
    locations: [...locations].sort((a, b) => a.localeCompare(b, 'ca')),
    lns: [...lns].sort((a, b) => a.localeCompare(b, 'ca')),
  }
}

async function allocateFixos(opts: {
  from: string
  to: string
  bucket: ServiceCostListItem[]
  allInRange: ServiceCostListItem[]
}): Promise<{
  fixDirecte: number
  fixIndirecte: number
  monthsMissingFixed: string[]
  monthsMissingEstructura: string[]
  opsiaLnCodi: string | null
}> {
  const yms = monthsInRange(opts.from, opts.to)
  const fromYm = yms[0] || opts.from.slice(0, 7)
  const toYm = yms[yms.length - 1] || opts.to.slice(0, 7)

  const [fixedDocs, estructuraDocs] = await Promise.all([
    listOpsiaFixedLnMonthDocs({ fromYm, toYm }),
    listOpsiaEstructuraLnMonthDocs({ fromYm, toYm }),
  ])
  const fixedByYm = new Map(fixedDocs.map((d) => [d.ym, d]))
  const estByYm = new Map(estructuraDocs.map((d) => [d.ym, d]))

  let fixDirecte = 0
  let fixIndirecte = 0
  const monthsMissingFixed: string[] = []
  const monthsMissingEstructura: string[] = []
  let opsiaLnCodi: string | null = null

  for (const ym of yms) {
    const bucketMes = opts.bucket.filter((i) => i.eventDate.slice(0, 7) === ym)
    const factB = bucketMes.reduce((s, i) => s + (i.billing || 0), 0)
    if (!(factB > 0)) continue

    // Agrupar per LN de l’event dins el mes
    const byLnName = new Map<string, ServiceCostListItem[]>()
    for (const it of bucketMes) {
      const key = normalizeManualLnName(it.ln) || it.ln || '—'
      if (!byLnName.has(key)) byLnName.set(key, [])
      byLnName.get(key)!.push(it)
    }

    const fixedDoc = fixedByYm.get(ym)
    const estDoc = estByYm.get(ym)
    if (!fixedDoc) monthsMissingFixed.push(ym)
    if (!estDoc) monthsMissingEstructura.push(ym)

    for (const [lnName, lnItems] of byLnName) {
      const factBucketLn = lnItems.reduce((s, i) => s + (i.billing || 0), 0)
      if (!(factBucketLn > 0)) continue

      const lnAllMes = opts.allInRange.filter(
        (i) =>
          i.eventDate.slice(0, 7) === ym &&
          (normalizeManualLnName(i.ln) || i.ln || '—') === lnName
      )
      const factLn = lnAllMes.reduce((s, i) => s + (i.billing || 0), 0)
      if (!(factLn > 0)) continue

      const quota = factBucketLn / factLn

      if (fixedDoc?.byLn) {
        const codi = resolveOpsiaLnCodi(fixedDoc.byLn, lnName)
        if (codi) {
          opsiaLnCodi = opsiaLnCodi || codi
          const pot = Number(fixedDoc.byLn[codi]?.costSalarial) || 0
          fixDirecte += pot * quota
        }
      }

      if (estDoc?.byLn) {
        const codi = resolveOpsiaLnCodi(estDoc.byLn, lnName)
        if (codi) {
          opsiaLnCodi = opsiaLnCodi || codi
          const pot = Number(estDoc.byLn[codi]?.estructuraNeta) || 0
          fixIndirecte += pot * quota
        }
      }
    }
  }

  return {
    fixDirecte: round2(fixDirecte),
    fixIndirecte: round2(fixIndirecte),
    monthsMissingFixed,
    monthsMissingEstructura,
    opsiaLnCodi,
  }
}

async function resolvePcts(
  year: number,
  lnFilter: string,
  sampleLn: string
): Promise<{
  pctCompres: number
  pctGestio: number
  source: 'ln' | 'general' | 'none'
  opsiaLnCodi: string | null
}> {
  const doc = await getOpsiaPctAnualDoc(year, 'calblay')
  if (!doc) {
    return { pctCompres: 0, pctGestio: 0, source: 'none', opsiaLnCodi: null }
  }

  const targetLn = lnFilter || sampleLn
  const codi = targetLn ? resolveOpsiaLnCodi(doc.byLn || {}, targetLn) : null
  if (codi && doc.byLn?.[codi]) {
    return {
      pctCompres: pctPointsToRatio(doc.byLn[codi].pctCompres),
      pctGestio: pctPointsToRatio(doc.byLn[codi].pctGestio),
      source: 'ln',
      opsiaLnCodi: codi,
    }
  }

  return {
    pctCompres: pctPointsToRatio(doc.general?.pctCompres),
    pctGestio: pctPointsToRatio(doc.general?.pctGestio),
    source: 'general',
    opsiaLnCodi: codi,
  }
}

export async function buildPeSeed(opts: {
  from: string
  to: string
  serviceType?: string
  location?: string
  ln?: string
  mode?: PeMode
}): Promise<PeSeedResponse> {
  const { from, to } = opts
  const serviceType = String(opts.serviceType || '').trim()
  const location = String(opts.location || '').trim()
  const ln = String(opts.ln || '').trim()
  const mode: PeMode = opts.mode === 'pctGestio' ? 'pctGestio' : 'pots'

  const { items } = await buildCostServeisListItems(from, to)
  const options = collectOptions(items)

  if (!serviceType || !location) {
    return { from, to, options }
  }

  const filtered = items.filter(
    (it) =>
      itemMatchesService(it, serviceType) &&
      itemMatchesLocation(it, location) &&
      itemMatchesLn(it, ln)
  )

  if (filtered.length === 0) {
    return {
      from,
      to,
      options,
      error: 'Cap event amb aquest servei i ubicació al període.',
    }
  }

  // Només events amb facturació per MC% / imputació
  const withBilling = filtered.filter((it) => (it.billing || 0) > 0)
  const pool = withBilling.length > 0 ? withBilling : filtered

  const billing = round2(pool.reduce((s, i) => s + (i.billing || 0), 0))
  const cvOperatiu = round2(
    pool.reduce((s, i) => s + (i.operationalTotal || 0), 0)
  )
  const numPax = pool.reduce((s, i) => s + (i.numPax || 0), 0)
  const eventsWithSheet = pool.filter((i) => i.hasSheet).length

  const sampleLn =
    normalizeManualLnName(pool[0]?.ln) || pool[0]?.ln || ln || ''
  const pctYear = Number(to.slice(0, 4)) || new Date().getFullYear()

  const [alloc, pcts] = await Promise.all([
    allocateFixos({ from, to, bucket: pool, allInRange: items }),
    resolvePcts(pctYear, ln, sampleLn),
  ])

  const seed: PeSeedInputs = {
    billing,
    cvOperatiu,
    pctCompres: pcts.pctCompres,
    pctGestio: pcts.pctGestio,
    fixDirecte: alloc.fixDirecte,
    fixIndirecte: alloc.fixIndirecte,
    numPax,
    mode,
  }

  const result = peFromInputs(seed)

  const meta: PeSeedMeta = {
    from,
    to,
    serviceType,
    location,
    ln: ln || sampleLn,
    eventCount: pool.length,
    eventsWithSheet,
    monthsMissingFixed: alloc.monthsMissingFixed,
    monthsMissingEstructura: alloc.monthsMissingEstructura,
    pctYear,
    pctSource: pcts.source,
    opsiaLnCodi: alloc.opsiaLnCodi || pcts.opsiaLnCodi,
  }

  if (alloc.monthsMissingFixed.length) {
    result.warnings.push(
      `Mesos sense sync salarial: ${alloc.monthsMissingFixed.join(', ')}`
    )
  }
  if (alloc.monthsMissingEstructura.length) {
    result.warnings.push(
      `Mesos sense sync estructura: ${alloc.monthsMissingEstructura.join(', ')}`
    )
  }
  if (pcts.source === 'none') {
    result.warnings.push(
      `Sense % anual sincronitzat per ${pctYear}. Compres/Gestió = 0.`
    )
  }

  return { from, to, options, meta, seed, result }
}
