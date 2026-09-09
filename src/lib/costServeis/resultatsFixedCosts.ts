/**
 * Imputació de costos fixos per a Resultats.
 *
 * - Real: pot mensual Opsia per LN.
 * - Normalitzat: tarifa anual per unitat d'activitat, calculada només amb mesos
 *   que tenen el pot corresponent sincronitzat.
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { queryStageCollectionDocsInDateRange } from '@/lib/firestoreStageRangeQuery'
import { listServeis } from '@/lib/serveis/server'
import { listOpsiaFixedLnMonthDocs } from '@/lib/costServeis/opsiaFixedLn'
import { listOpsiaEstructuraLnMonthDocs } from '@/lib/costServeis/opsiaEstructuraLn'
import { resolveOpsiaLnCodi } from '@/lib/costServeis/peSeed'
import { getOpsiaPctAnualDoc } from '@/lib/costServeis/opsiaPctAnual'
import { pctPointsToRatio } from '@/lib/costServeis/peCalc'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import { coefForEvent } from '@/lib/costServeis/allocateStructure'
import {
  listServeiWeightRows,
  PONDERACIO_DEPTS,
  type PonderacioDept,
  type ServeiWeightRow,
} from '@/lib/costServeis/serveiWeights'
import type { ServiceCostListItem } from '@/lib/costServeis/types'
import {
  allocateCostPool,
  calculateIndirectPersonnelPool,
} from '@/lib/costServeis/fixedCostMath'

export type EventFixedCosts = {
  fixedDirect: number
  fixedIndirect: number
  fixedDirectNormalized: number
  fixedIndirectNormalized: number
  purchasePct: number
  managementPct: number
  theoreticalPurchaseCost: number
  theoreticalManagementCost: number
  pctSource: 'ln' | 'general' | 'none'
}

export type FixedCostAuditRow = {
  key: string
  ym: string
  ln: string
  eventCount: number
  billing: number
  directWeight: number
  fixedDirectPool: number
  fixedDirectAllocated: number
  personalTotalLn: number | null
  fixedIndirectMode: 'FIX_DEPARTAMENTS' | 'RESIDUAL_LN'
  fixedIndirectConfigured: number | null
  fixedIndirectExcludedOperational: number
  fixedIndirectPool: number
  fixedIndirectAllocated: number
  directStatus: 'ok' | 'missing_month' | 'missing_ln' | 'no_driver'
  indirectStatus: 'ok' | 'missing_month' | 'missing_ln' | 'missing_base' | 'no_driver'
}

export type FixedCostCoverage = {
  monthsWithEvents: string[]
  monthsMissingDirect: string[]
  monthsMissingIndirect: string[]
  normalizedYears: Array<{
    year: number
    directMonths: number
    indirectMonths: number
  }>
  yearsMissingPercentages: number[]
}

type ActivityRow = Pick<
  ServiceCostListItem,
  'eventId' | 'eventDate' | 'ln' | 'serviceType' | 'spaceKind' | 'numPax' | 'billing'
>

type CatalogRow = { id: string; nom: string; codi: string }

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function fold(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function lnName(raw: string): string {
  return normalizeManualLnName(raw) || String(raw || '').trim() || 'Sense LN'
}

function ymOf(row: ActivityRow) {
  return row.eventDate.slice(0, 7)
}

function directWeight(
  row: ActivityRow,
  catalog: CatalogRow[],
  weightsByDept: Map<PonderacioDept, Map<string, ServeiWeightRow>>
): number {
  const pax = Math.max(1, Number(row.numPax) || 0)
  let score = 0
  for (const dept of PONDERACIO_DEPTS) {
    const c = coefForEvent(
      row.serviceType,
      row.spaceKind,
      catalog,
      weightsByDept.get(dept) || new Map()
    )
    score += c.gestio + (c.preparacio + c.rentat) * pax
  }
  return Math.max(0, score)
}

function dayKey(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10)
  if (
    v &&
    typeof v === 'object' &&
    'toDate' in v &&
    typeof (v as { toDate: () => Date }).toDate === 'function'
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  return ''
}

function readServiceType(d: Record<string, unknown>): string {
  return String(
    d.Servei || d.Servicio || d.service || d.TipusServei || d.tipusServei || d.serviceType || ''
  ).trim()
}

async function loadYearActivity(year: number): Promise<ActivityRow[]> {
  const [docs, spaceIndex] = await Promise.all([
    queryStageCollectionDocsInDateRange(
      db,
      'stage_verd',
      `${year}-01-01`,
      `${year}-12-31`
    ),
    loadSpaceOwnershipIndex(),
  ])
  return docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>
      const eventDate = dayKey(d.DataInici)
      if (!eventDate) return null
      const location = String(d.Ubicacio || '')
      const eventName = String(d.NomEvent || d.summary || '')
      return {
        eventId: doc.id,
        eventDate,
        ln: String(d.LN || ''),
        serviceType: readServiceType(d),
        spaceKind: resolveSpaceKind(spaceIndex, {
          fincaId: d.FincaId ? String(d.FincaId) : null,
          fincaCode: d.FincaCode ? String(d.FincaCode) : null,
          ubicacioCode: d.UbicacioCode ? String(d.UbicacioCode) : null,
          location,
          eventName,
        }),
        numPax: Number(d.NumPax ?? 0) || 0,
        billing: Number(d.Import ?? d.importAmount ?? 0) || 0,
      } satisfies ActivityRow
    })
    .filter(Boolean) as ActivityRow[]
}

function groupRows(rows: ActivityRow[]): Map<string, ActivityRow[]> {
  const groups = new Map<string, ActivityRow[]>()
  for (const row of rows) {
    const key = `${ymOf(row)}||${fold(lnName(row.ln))}`
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return groups
}

export async function allocateResultatsFixedCosts(opts: {
  /** Tots els events dels mesos afectats, no només els dies visibles. */
  monthlyItems: ServiceCostListItem[]
  fromYm: string
  toYm: string
}): Promise<{
  byEventId: Map<string, EventFixedCosts>
  audit: FixedCostAuditRow[]
  coverage: FixedCostCoverage
}> {
  const years = [
    ...new Set(
      opts.monthlyItems.map((item) => Number(item.eventDate.slice(0, 4))).filter(Boolean)
    ),
  ].sort()
  const [fixedDocs, indirectDocs, catalogFull, weightRows, annualEntries] =
    await Promise.all([
      listOpsiaFixedLnMonthDocs({ fromYm: opts.fromYm, toYm: opts.toYm }),
      listOpsiaEstructuraLnMonthDocs({ fromYm: opts.fromYm, toYm: opts.toYm }),
      listServeis(),
      listServeiWeightRows({ dept: 'all' }),
      Promise.all(years.map(async (year) => [year, await loadYearActivity(year)] as const)),
    ])
  const catalog = catalogFull.map(({ id, nom, codi }) => ({ id, nom, codi }))
  const weightsByDept = new Map<
    PonderacioDept,
    Map<string, ServeiWeightRow>
  >()
  for (const dept of PONDERACIO_DEPTS) weightsByDept.set(dept, new Map())
  for (const row of weightRows) {
    if (row.active === false) continue
    weightsByDept
      .get(row.dept)
      ?.set(`${row.serveiId}__${row.spaceKind}`, row)
  }
  const fixedByYm = new Map(fixedDocs.map((doc) => [doc.ym, doc]))
  const indirectByYm = new Map(indirectDocs.map((doc) => [doc.ym, doc]))
  const result = new Map<string, EventFixedCosts>()
  for (const item of opts.monthlyItems) {
    result.set(item.eventId, {
      fixedDirect: 0,
      fixedIndirect: 0,
      fixedDirectNormalized: 0,
      fixedIndirectNormalized: 0,
      purchasePct: 0,
      managementPct: 0,
      theoreticalPurchaseCost: 0,
      theoreticalManagementCost: 0,
      pctSource: 'none',
    })
  }

  const audit: FixedCostAuditRow[] = []
  for (const [, rows] of groupRows(opts.monthlyItems)) {
    const first = rows[0]
    const ym = ymOf(first)
    const ln = lnName(first.ln)
    const fixedDoc = fixedByYm.get(ym)
    const indirectDoc = indirectByYm.get(ym)
    const directCode = fixedDoc ? resolveOpsiaLnCodi(fixedDoc.byLn || {}, ln) : null
    const indirectCode = indirectDoc
      ? resolveOpsiaLnCodi(indirectDoc.byLn || {}, ln)
      : null
    const fixedDirectPool = directCode
      ? Math.max(0, Number(fixedDoc?.byLn[directCode]?.costSalarial) || 0)
      : 0
    // Fix indirecte pur: personal central net. Compres i gestió es calculen
    // separadament amb els seus percentatges teòrics i no poden entrar aquí.
    const indirectRow = indirectCode ? indirectDoc?.byLn[indirectCode] : null
    const indirectPoolCalculated = indirectRow
      ? calculateIndirectPersonnelPool({
          personalTotalLn: indirectRow.personalTotalLn,
          fixedDirect: directCode ? fixedDirectPool : null,
          logisticsKitchen: indirectRow.personalExclosLogisticaCuina,
          mode: indirectRow.personalIndirecteMode,
          configuredFixed: indirectRow.personalIndirecteFixConfigurat,
        })
      : null
    const fixedIndirectPool = indirectPoolCalculated ?? 0
    const weightOf = (row: ActivityRow) =>
      directWeight(row, catalog, weightsByDept)
    const directAlloc = allocateCostPool(rows, fixedDirectPool, weightOf)
    // Tots els events de la LN participen, tinguin o no facturació.
    const indirectAlloc = allocateCostPool(rows, fixedIndirectPool, () => 1)
    for (const row of rows) {
      const current = result.get(row.eventId)!
      current.fixedDirect = directAlloc.get(row) || 0
      current.fixedIndirect = indirectAlloc.get(row) || 0
    }
    const totalDirectWeight = rows.reduce((sum, row) => sum + weightOf(row), 0)
    const billing = rows.reduce((sum, row) => sum + Math.max(0, row.billing || 0), 0)
    audit.push({
      key: `${ym}__${fold(ln)}`,
      ym,
      ln,
      eventCount: rows.length,
      billing: round2(billing),
      directWeight: round2(totalDirectWeight),
      fixedDirectPool: round2(fixedDirectPool),
      fixedDirectAllocated: round2(
        rows.reduce((sum, row) => sum + (directAlloc.get(row) || 0), 0)
      ),
      personalTotalLn: indirectRow?.personalTotalLn ?? null,
      fixedIndirectMode:
        indirectRow?.personalIndirecteMode === 'FIX_DEPARTAMENTS'
          ? 'FIX_DEPARTAMENTS'
          : 'RESIDUAL_LN',
      fixedIndirectConfigured:
        indirectRow?.personalIndirecteFixConfigurat ?? null,
      fixedIndirectExcludedOperational: round2(
        Number(indirectRow?.personalExclosLogisticaCuina) || 0
      ),
      fixedIndirectPool: round2(fixedIndirectPool),
      fixedIndirectAllocated: round2(
        rows.reduce((sum, row) => sum + (indirectAlloc.get(row) || 0), 0)
      ),
      directStatus: !fixedDoc
        ? 'missing_month'
        : !directCode
          ? 'missing_ln'
          : totalDirectWeight <= 0
            ? 'no_driver'
            : 'ok',
      indirectStatus: !indirectDoc
        ? 'missing_month'
        : !indirectCode
          ? 'missing_ln'
          : indirectPoolCalculated == null
            ? 'missing_base'
          : rows.length <= 0
            ? 'no_driver'
            : 'ok',
    })
  }

  const normalizedYears: FixedCostCoverage['normalizedYears'] = []
  const yearsMissingPercentages: number[] = []
  const annualData = await Promise.all(
    annualEntries.map(async ([year, annualRows]) => {
      const [annualFixed, annualIndirect, pctDoc] = await Promise.all([
        listOpsiaFixedLnMonthDocs({
          fromYm: `${year}-01`,
          toYm: `${year}-12`,
        }),
        listOpsiaEstructuraLnMonthDocs({
          fromYm: `${year}-01`,
          toYm: `${year}-12`,
        }),
        getOpsiaPctAnualDoc(year, 'calblay'),
      ])
      return { year, annualRows, annualFixed, annualIndirect, pctDoc }
    })
  )
  for (const { year, annualRows, annualFixed, annualIndirect, pctDoc } of annualData) {
    if (!pctDoc) yearsMissingPercentages.push(year)
    const annualFixedByYm = new Map(annualFixed.map((doc) => [doc.ym, doc]))
    const annualIndirectByYm = new Map(annualIndirect.map((doc) => [doc.ym, doc]))
    const byLn = new Map<string, ActivityRow[]>()
    for (const row of annualRows) {
      const key = fold(lnName(row.ln))
      const group = byLn.get(key) || []
      group.push(row)
      byLn.set(key, group)
    }
    for (const rows of byLn.values()) {
      const ln = lnName(rows[0].ln)
      let directPool = 0
      let indirectPool = 0
      let directDriver = 0
      let indirectDriver = 0
      for (const row of rows) {
        const ym = ymOf(row)
        const fixedDoc = annualFixedByYm.get(ym)
        const indirectDoc = annualIndirectByYm.get(ym)
        if (fixedDoc) directDriver += directWeight(row, catalog, weightsByDept)
        if (indirectDoc) {
          const code = resolveOpsiaLnCodi(indirectDoc.byLn || {}, ln)
          const directCode = fixedDoc
            ? resolveOpsiaLnCodi(fixedDoc.byLn || {}, ln)
            : null
          const indirectRow = code ? indirectDoc.byLn[code] : null
          const calculated = indirectRow
            ? calculateIndirectPersonnelPool({
                personalTotalLn: indirectRow.personalTotalLn,
                fixedDirect: directCode
                  ? Number(fixedDoc?.byLn[directCode]?.costSalarial) || 0
                  : null,
                logisticsKitchen: indirectRow.personalExclosLogisticaCuina,
                mode: indirectRow.personalIndirecteMode,
                configuredFixed: indirectRow.personalIndirecteFixConfigurat,
              })
            : null
          if (calculated != null) {
            indirectDriver += 1
          }
        }
      }
      for (const doc of annualFixed) {
        const code = resolveOpsiaLnCodi(doc.byLn || {}, ln)
        if (code) directPool += Math.max(0, Number(doc.byLn[code]?.costSalarial) || 0)
      }
      for (const doc of annualIndirect) {
        const code = resolveOpsiaLnCodi(doc.byLn || {}, ln)
        if (code) {
          const directDoc = annualFixedByYm.get(doc.ym)
          const directCode = directDoc
            ? resolveOpsiaLnCodi(directDoc.byLn || {}, ln)
            : null
          const indirectRow = doc.byLn[code]
          const calculated = calculateIndirectPersonnelPool({
            personalTotalLn: indirectRow?.personalTotalLn,
            fixedDirect: directCode
              ? Number(directDoc?.byLn[directCode]?.costSalarial) || 0
              : null,
            logisticsKitchen:
              Number(indirectRow?.personalExclosLogisticaCuina) || 0,
            mode: indirectRow?.personalIndirecteMode,
            configuredFixed: indirectRow?.personalIndirecteFixConfigurat,
          })
          if (calculated != null) indirectPool += calculated
        }
      }
      const directRate = directDriver > 0 ? directPool / directDriver : 0
      const indirectRate = indirectDriver > 0 ? indirectPool / indirectDriver : 0
      const pctCode = pctDoc ? resolveOpsiaLnCodi(pctDoc.byLn || {}, ln) : null
      const pctRow = pctCode ? pctDoc?.byLn?.[pctCode] : null
      const purchasePct = pctPointsToRatio(
        pctRow?.pctCompres ?? pctDoc?.general?.pctCompres ?? 0
      )
      const managementPct = pctPointsToRatio(
        pctRow?.pctGestio ?? pctDoc?.general?.pctGestio ?? 0
      )
      const pctSource: EventFixedCosts['pctSource'] = pctRow
        ? 'ln'
        : pctDoc
          ? 'general'
          : 'none'
      for (const row of opts.monthlyItems) {
        if (Number(row.eventDate.slice(0, 4)) !== year || fold(lnName(row.ln)) !== fold(ln)) {
          continue
        }
        const current = result.get(row.eventId)!
        current.fixedDirectNormalized = round2(
          directWeight(row, catalog, weightsByDept) * directRate
        )
        current.fixedIndirectNormalized = round2(
          indirectRate
        )
        current.purchasePct = purchasePct
        current.managementPct = managementPct
        current.theoreticalPurchaseCost = round2(
          Math.max(0, row.billing || 0) * purchasePct
        )
        current.theoreticalManagementCost = round2(
          Math.max(0, row.billing || 0) * managementPct
        )
        current.pctSource = pctSource
      }
    }
    normalizedYears.push({
      year,
      directMonths: annualFixed.length,
      indirectMonths: annualIndirect.filter((doc) =>
        Object.values(doc.byLn || {}).some(
          (row) =>
            (row.personalIndirecteMode === 'FIX_DEPARTAMENTS' &&
              row.personalIndirecteFixConfigurat != null) ||
            row.personalTotalLn != null
        )
      ).length,
    })
  }

  const monthsWithEvents = [...new Set(opts.monthlyItems.map(ymOf))].sort()
  return {
    byEventId: result,
    audit: audit.sort((a, b) => a.ym.localeCompare(b.ym) || a.ln.localeCompare(b.ln, 'ca')),
    coverage: {
      monthsWithEvents,
      monthsMissingDirect: monthsWithEvents.filter((ym) => !fixedByYm.has(ym)),
      monthsMissingIndirect: monthsWithEvents.filter((ym) => {
        const doc = indirectByYm.get(ym)
        return (
          !doc ||
          !Object.values(doc.byLn || {}).some(
            (row) =>
              (row.personalIndirecteMode === 'FIX_DEPARTAMENTS' &&
                row.personalIndirecteFixConfigurat != null) ||
              row.personalTotalLn != null
          )
        )
      }),
      normalizedYears,
      yearsMissingPercentages,
    },
  }
}
