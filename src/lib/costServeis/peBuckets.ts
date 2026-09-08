/**
 * PE precalculat per any: LN × tipusServei × Propi|Extern.
 * Els mesos només s’usen al job de càlcul; la UI fa lookup.
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { buildCostServeisListItems } from '@/lib/costServeis/buildListItems'
import type { ServiceCostListItem } from '@/lib/costServeis/types'
import { listOpsiaFixedLnMonthDocs } from '@/lib/costServeis/opsiaFixedLn'
import { listOpsiaEstructuraLnMonthDocs } from '@/lib/costServeis/opsiaEstructuraLn'
import { getOpsiaPctAnualDoc } from '@/lib/costServeis/opsiaPctAnual'
import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import { splitServiceTypeLabels } from '@/lib/serveis/utils'
import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'
import { peFromInputs, pctPointsToRatio } from '@/lib/costServeis/peCalc'
import { resolveOpsiaLnCodi } from '@/lib/costServeis/peSeed'
import { listServeiWeightRows } from '@/lib/costServeis/serveiWeights'
import {
  SERVICE_COST_PE_BUCKETS_COL,
  type PeBucketDoc,
  type PeBucketMetaDoc,
  type PeLookupResponse,
} from '@/lib/costServeis/peBucketTypes'

export {
  SERVICE_COST_PE_BUCKETS_COL,
  type PeBucketDoc,
  type PeBucketMetaDoc,
  type PeLookupResponse,
} from '@/lib/costServeis/peBucketTypes'

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

function slugPart(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'x'
}

export function peBucketDocId(
  year: number,
  ln: string,
  serviceType: string,
  spaceKind: SpaceKind
): string {
  return `${year}__${slugPart(ln)}__${slugPart(serviceType)}__${spaceKind}`
}

function metaDocId(year: number) {
  return `${year}__meta`
}

function yearDateRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

function monthsInYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

type Agg = {
  ln: string
  serviceType: string
  spaceKind: SpaceKind
  billing: number
  cvOperatiu: number
  numPax: number
  eventCount: number
  /** billing per mes — per imputar fixos */
  billingByYm: Map<string, number>
}

function serviceParts(raw: string): string[] {
  const parts = splitServiceTypeLabels(raw)
  if (parts.length > 0) return parts
  const t = String(raw || '').trim()
  return t ? [t] : ['Sense tipus']
}

/** Expandeix un event en contribucions per part de servei (reparteix imports). */
function expandItem(item: ServiceCostListItem): Array<{
  ln: string
  serviceType: string
  spaceKind: SpaceKind
  billing: number
  cvOperatiu: number
  numPax: number
  ym: string
}> {
  if (!item.spaceKind) return []
  const ln = normalizeManualLnName(item.ln) || item.ln?.trim() || 'Sense LN'
  const parts = serviceParts(item.serviceType)
  const w = 1 / parts.length
  const ym = item.eventDate.slice(0, 7)
  return parts.map((serviceType) => ({
    ln,
    serviceType,
    spaceKind: item.spaceKind as SpaceKind,
    billing: (item.billing || 0) * w,
    cvOperatiu: (item.operationalTotal || 0) * w,
    numPax: (item.numPax || 0) * w,
    ym,
  }))
}

function aggKey(ln: string, serviceType: string, spaceKind: SpaceKind) {
  return `${fold(ln)}||${fold(serviceType)}||${spaceKind}`
}

async function resolvePcts(
  year: number,
  ln: string
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
  const codi = resolveOpsiaLnCodi(doc.byLn || {}, ln)
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

/**
 * Recalcula tots els buckets PE de l’any i els desa a Firestore.
 */
export async function recomputePeBucketsForYear(opts: {
  year: number
  userId?: string
}): Promise<{ meta: PeBucketMetaDoc; buckets: PeBucketDoc[] }> {
  const { year, userId } = opts
  const { from, to } = yearDateRange(year)
  const { items } = await buildCostServeisListItems(from, to)

  let skippedNoSpace = 0
  const aggs = new Map<string, Agg>()

  for (const item of items) {
    if (!item.spaceKind) {
      skippedNoSpace += 1
      continue
    }
    for (const row of expandItem(item)) {
      const key = aggKey(row.ln, row.serviceType, row.spaceKind)
      let a = aggs.get(key)
      if (!a) {
        a = {
          ln: row.ln,
          serviceType: row.serviceType,
          spaceKind: row.spaceKind,
          billing: 0,
          cvOperatiu: 0,
          numPax: 0,
          eventCount: 0,
          billingByYm: new Map(),
        }
        aggs.set(key, a)
      }
      a.billing += row.billing
      a.cvOperatiu += row.cvOperatiu
      a.numPax += row.numPax
      a.eventCount += 1 / serviceParts(item.serviceType).length
      a.billingByYm.set(
        row.ym,
        (a.billingByYm.get(row.ym) || 0) + row.billing
      )
    }
  }

  // Facturació total per LN × mes (per quota d’imputació)
  const factLnByYm = new Map<string, number>()
  for (const item of items) {
    const ln = normalizeManualLnName(item.ln) || item.ln?.trim() || 'Sense LN'
    const ym = item.eventDate.slice(0, 7)
    const k = `${fold(ln)}||${ym}`
    factLnByYm.set(k, (factLnByYm.get(k) || 0) + (item.billing || 0))
  }

  const yms = monthsInYear(year)
  const fromYm = `${year}-01`
  const toYm = `${year}-12`
  const [fixedDocs, estructuraDocs] = await Promise.all([
    listOpsiaFixedLnMonthDocs({ fromYm, toYm }),
    listOpsiaEstructuraLnMonthDocs({ fromYm, toYm }),
  ])
  const fixedByYm = new Map(fixedDocs.map((d) => [d.ym, d]))
  const estByYm = new Map(estructuraDocs.map((d) => [d.ym, d]))

  const monthsMissingFixed = yms.filter((ym) => {
    const hasEvents = items.some((i) => i.eventDate.startsWith(ym) && (i.billing || 0) > 0)
    return hasEvents && !fixedByYm.has(ym)
  })
  const monthsMissingEstructura = yms.filter((ym) => {
    const hasEvents = items.some((i) => i.eventDate.startsWith(ym) && (i.billing || 0) > 0)
    return hasEvents && !estByYm.has(ym)
  })

  const monthsUsed = new Set<string>()
  const computedAt = new Date().toISOString()
  const buckets: PeBucketDoc[] = []

  // pct per LN (cache)
  const pctCache = new Map<
    string,
    Awaited<ReturnType<typeof resolvePcts>>
  >()

  for (const a of aggs.values()) {
    let fixDirecte = 0
    let fixIndirecte = 0
    let opsiaLnCodi: string | null = null

    for (const [ym, factB] of a.billingByYm) {
      if (!(factB > 0)) continue
      const factLn = factLnByYm.get(`${fold(a.ln)}||${ym}`) || 0
      if (!(factLn > 0)) continue
      const quota = factB / factLn
      monthsUsed.add(ym)

      const fixedDoc = fixedByYm.get(ym)
      if (fixedDoc?.byLn) {
        const codi = resolveOpsiaLnCodi(fixedDoc.byLn, a.ln)
        if (codi) {
          opsiaLnCodi = opsiaLnCodi || codi
          fixDirecte += (Number(fixedDoc.byLn[codi]?.costSalarial) || 0) * quota
        }
      }
      const estDoc = estByYm.get(ym)
      if (estDoc?.byLn) {
        const codi = resolveOpsiaLnCodi(estDoc.byLn, a.ln)
        if (codi) {
          opsiaLnCodi = opsiaLnCodi || codi
          fixIndirecte +=
            (Number(estDoc.byLn[codi]?.estructuraNeta) || 0) * quota
        }
      }
    }

    let pct = pctCache.get(fold(a.ln))
    if (!pct) {
      pct = await resolvePcts(year, a.ln)
      pctCache.set(fold(a.ln), pct)
    }

    const billing = round2(a.billing)
    const cvOperatiu = round2(a.cvOperatiu)
    const numPax = round2(a.numPax)
    const pe = peFromInputs({
      billing,
      cvOperatiu,
      pctCompres: pct.pctCompres,
      pctGestio: pct.pctGestio,
      fixDirecte: round2(fixDirecte),
      fixIndirecte: round2(fixIndirecte),
      numPax,
      mode: 'pots',
    })

    const id = peBucketDocId(year, a.ln, a.serviceType, a.spaceKind)
    const doc: PeBucketDoc = {
      id,
      year,
      ln: a.ln,
      serviceType: a.serviceType,
      spaceKind: a.spaceKind,
      billing,
      cvOperatiu,
      numPax,
      eventCount: Math.round(a.eventCount * 100) / 100,
      preuMitjaPax: pe.preuMitjaPax,
      cvOperatiuPerPax: pe.cvOperatiuPerPax,
      pctCompres: pct.pctCompres,
      pctGestio: pct.pctGestio,
      fixDirecte: round2(fixDirecte),
      fixIndirecte: round2(fixIndirecte),
      fixos: pe.fixos,
      margePerPax: pe.margePerPax,
      pePax: pe.pePax,
      peEuro: pe.peEuro,
      status: pe.status,
      headline: pe.headline,
      opsiaLnCodi: opsiaLnCodi || pct.opsiaLnCodi,
      pctSource: pct.source,
      monthsUsed: [...a.billingByYm.keys()].sort(),
      computedAt,
    }
    buckets.push(doc)
  }

  buckets.sort(
    (x, y) =>
      x.ln.localeCompare(y.ln, 'ca') ||
      x.serviceType.localeCompare(y.serviceType, 'ca') ||
      x.spaceKind.localeCompare(y.spaceKind)
  )

  // Esborra buckets antics de l’any i escriu els nous
  const col = db.collection(SERVICE_COST_PE_BUCKETS_COL)
  const existing = await col.where('year', '==', year).get()
  const batchSize = 400
  let batch = db.batch()
  let n = 0
  for (const snap of existing.docs) {
    batch.delete(snap.ref)
    n += 1
    if (n >= batchSize) {
      await batch.commit()
      batch = db.batch()
      n = 0
    }
  }
  if (n > 0) await batch.commit()

  batch = db.batch()
  n = 0
  for (const b of buckets) {
    batch.set(col.doc(b.id), b)
    n += 1
    if (n >= batchSize) {
      await batch.commit()
      batch = db.batch()
      n = 0
    }
  }

  const meta: PeBucketMetaDoc = {
    id: metaDocId(year),
    year,
    bucketCount: buckets.length,
    eventCount: items.length,
    skippedNoSpace,
    monthsMissingFixed,
    monthsMissingEstructura,
    computedAt,
    computedBy: userId,
  }
  batch.set(col.doc(meta.id), meta)
  await batch.commit()

  return { meta, buckets }
}

export async function getPeBucketMeta(
  year: number
): Promise<PeBucketMetaDoc | null> {
  const snap = await db
    .collection(SERVICE_COST_PE_BUCKETS_COL)
    .doc(metaDocId(year))
    .get()
  if (!snap.exists) return null
  return snap.data() as PeBucketMetaDoc
}

export async function listPeBuckets(year: number): Promise<PeBucketDoc[]> {
  const snap = await db
    .collection(SERVICE_COST_PE_BUCKETS_COL)
    .where('year', '==', year)
    .get()
  return snap.docs
    .map((d) => d.data() as PeBucketDoc | PeBucketMetaDoc)
    .filter((d): d is PeBucketDoc => 'serviceType' in d && 'spaceKind' in d)
    .sort(
      (a, b) =>
        a.ln.localeCompare(b.ln, 'ca') ||
        a.serviceType.localeCompare(b.serviceType, 'ca') ||
        a.spaceKind.localeCompare(b.spaceKind)
    )
}

export async function getPeBucket(opts: {
  year: number
  ln: string
  serviceType: string
  spaceKind: SpaceKind
}): Promise<PeBucketDoc | null> {
  const id = peBucketDocId(
    opts.year,
    opts.ln,
    opts.serviceType,
    opts.spaceKind
  )
  const snap = await db.collection(SERVICE_COST_PE_BUCKETS_COL).doc(id).get()
  if (snap.exists) return snap.data() as PeBucketDoc

  // Fallback: match per fold si el slug no coincideix exactament
  const all = await listPeBuckets(opts.year)
  const lnF = fold(normalizeManualLnName(opts.ln) || opts.ln)
  const svcF = fold(opts.serviceType)
  return (
    all.find(
      (b) =>
        fold(b.ln) === lnF &&
        fold(b.serviceType) === svcF &&
        b.spaceKind === opts.spaceKind
    ) || null
  )
}

export async function lookupPe(opts: {
  year: number
  ln?: string
  serviceType?: string
  spaceKind?: SpaceKind | ''
}): Promise<PeLookupResponse> {
  const year = opts.year
  const ln = String(opts.ln || '').trim()
  const serviceType = String(opts.serviceType || '').trim()
  const spaceKind =
    opts.spaceKind === 'Propi' || opts.spaceKind === 'Extern'
      ? opts.spaceKind
      : ('' as const)

  const [meta, buckets, weightRows] = await Promise.all([
    getPeBucketMeta(year),
    listPeBuckets(year),
    listServeiWeightRows({ dept: 'all' }),
  ])

  // Servei actiu = almenys una fila de ponderació active per aquell espai.
  const activeBySpace = new Map<SpaceKind, Set<string>>()
  const hasPonderacioBySpace = new Map<SpaceKind, boolean>()
  for (const sk of ['Propi', 'Extern'] as SpaceKind[]) {
    activeBySpace.set(sk, new Set())
    hasPonderacioBySpace.set(sk, false)
  }
  for (const row of weightRows) {
    hasPonderacioBySpace.set(row.spaceKind, true)
    if (row.active === false) continue
    const nom = String(row.serveiNom || '').trim()
    if (!nom) continue
    activeBySpace.get(row.spaceKind)?.add(fold(nom))
  }

  const isActiveService = (svc: string, sk: SpaceKind) => {
    if (!hasPonderacioBySpace.get(sk)) {
      // Sense ponderació per aquest espai: no filtrem (evita llista buida)
      return true
    }
    return activeBySpace.get(sk)?.has(fold(svc)) ?? false
  }

  const lnF = ln ? fold(normalizeManualLnName(ln) || ln) : ''

  const lns = [...new Set(buckets.map((b) => b.ln))].sort((a, b) =>
    a.localeCompare(b, 'ca')
  )

  const bucketsForLn = lnF
    ? buckets.filter((b) => fold(normalizeManualLnName(b.ln) || b.ln) === lnF)
    : buckets

  const spaceKinds = [
    ...new Set(bucketsForLn.map((b) => b.spaceKind)),
  ] as SpaceKind[]

  const bucketsForCentre =
    spaceKind && lnF
      ? bucketsForLn.filter((b) => b.spaceKind === spaceKind)
      : spaceKind
        ? buckets.filter((b) => b.spaceKind === spaceKind)
        : []

  // Serveis només quan hi ha LN + centre; només actius
  const serviceTypes =
    lnF && spaceKind
      ? [
          ...new Set(
            bucketsForCentre
              .filter((b) => isActiveService(b.serviceType, b.spaceKind))
              .map((b) => b.serviceType)
          ),
        ].sort((a, b) => a.localeCompare(b, 'ca'))
      : []

  const options = { lns, spaceKinds, serviceTypes }

  if (!serviceType || !ln || !spaceKind) {
    return { year, meta, options }
  }

  if (!isActiveService(serviceType, spaceKind)) {
    return {
      year,
      meta,
      options,
      bucket: null,
      error: 'Aquest servei no està actiu a Configuració (ponderació).',
    }
  }

  const bucket = await getPeBucket({ year, ln, serviceType, spaceKind })
  if (!bucket) {
    return {
      year,
      meta,
      options,
      bucket: null,
      error:
        'No hi ha PE precalculat per aquesta combinació. Recalcula l’any o tria un altre perfil.',
    }
  }

  return { year, meta, options, bucket }
}
