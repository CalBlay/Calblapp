import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { queryStageCollectionDocsInDateRange } from '@/lib/firestoreStageRangeQuery'
import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import {
  listManualServicesByDateRange,
  sumManualPotDeductions,
} from '@/lib/costServeis/manualServices'
import { listOpsiaMonthDocs } from '@/lib/costServeis/opsiaFinance'
import { listOpsiaTransfersMonthDocs } from '@/lib/costServeis/opsiaTransfers'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import { resolveStructurePots } from '@/lib/costServeis/allocateStructure'
import type { CostServeisDepartment } from '@/lib/costServeis/types'
import { adjustStructureLinesWithTransfers } from '@/lib/costServeis/transferCostMath'
import {
  MONTHLY_INDICATOR_VERSION,
  MONTHLY_POT_KEYS,
  buildActivityStats,
  buildPotMetrics,
  sumPotMetrics,
  type MonthlyCostIndicatorRow,
  type MonthlyEventFact,
} from '@/lib/costServeis/monthlyIndicatorMath'

export const SERVICE_COST_MONTHLY_ACTIVITY_COL = 'serviceCostMonthlyActivity'
export const SERVICE_COST_MONTHLY_EVENT_FACTS_COL = 'serviceCostMonthlyEventFacts'
export const SERVICE_COST_MONTHLY_INDICATORS_COL = 'serviceCostMonthlyIndicators'

const STRUCTURE_DEPARTMENTS = ['logistica', 'cuina'] as const

function isoDay(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate
    if (typeof toDate === 'function') return toDate.call(value).toISOString().slice(0, 10)
  }
  return ''
}

function monthKeys(fromYm: string, toYm: string): string[] {
  const result: string[] = []
  let [year, month] = fromYm.split('-').map(Number)
  const [toYear, toMonth] = toYm.split('-').map(Number)
  while (year < toYear || (year === toYear && month <= toMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      year += 1
      month = 1
    }
  }
  return result
}

function endDay(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

function readString(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(data[key] ?? '').trim()
    if (value) return value
  }
  return ''
}

function safeFactId(ym: string, eventId: string): string {
  return `${ym}__${encodeURIComponent(eventId).replace(/\./g, '%2E')}`
}

async function commitWrites(
  writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>
) {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch()
    for (const write of writes.slice(index, index + 400)) batch.set(write.ref, write.data)
    await batch.commit()
  }
}

export async function rebuildMonthlyCostIndicators(opts: {
  fromYm: string
  toYm: string
  userId: string
}): Promise<{ rows: MonthlyCostIndicatorRow[]; eventFacts: number; months: number }> {
  const months = monthKeys(opts.fromYm, opts.toYm)
  if (months.length === 0 || months.length > 36) throw new Error('Rang de mesos invàlid o massa ampli')

  const fromDay = `${opts.fromYm}-01`
  const toDay = endDay(opts.toYm)
  const [stageDocs, opsiaDocs, transferDocs, manuals, spaceIndex] = await Promise.all([
    queryStageCollectionDocsInDateRange(db, 'stage_verd', fromDay, toDay),
    listOpsiaMonthDocs({ fromYm: opts.fromYm, toYm: opts.toYm }),
    listOpsiaTransfersMonthDocs({ fromYm: opts.fromYm, toYm: opts.toYm }),
    listManualServicesByDateRange(fromDay, toDay),
    loadSpaceOwnershipIndex(),
  ])
  const deductions = sumManualPotDeductions(manuals)
  const opsiaByYm = new Map(opsiaDocs.map((doc) => [doc.ym, doc]))
  const transfersByYm = new Map(transferDocs.map((doc) => [doc.ym, doc]))
  const generatedAt = new Date().toISOString()
  const runId = `${generatedAt}__${opts.userId}`
  const factsByYm = new Map<string, MonthlyEventFact[]>(months.map((ym) => [ym, []]))

  for (const doc of stageDocs) {
    const data = doc.data() as Record<string, unknown>
    const eventDate = isoDay(data.DataInici ?? data.dataInici ?? data.eventDate)
    const ym = eventDate.slice(0, 7)
    if (!factsByYm.has(ym) || eventDate < fromDay || eventDate > toDay) continue
    const lnRaw = readString(data, ['LN', 'ln', 'LineaNegoci', 'lineaNegoci'])
    const lnNormalized = normalizeManualLnName(lnRaw)
    const included = lnNormalized === 'Empresa' || lnNormalized === 'Casaments'
    const rawPax = Number(data.NumPax ?? data.numPax ?? 0)
    const hasValidPax = Number.isFinite(rawPax) && rawPax > 0
    const numPax = hasValidPax ? rawPax : 0
    const eventName = readString(data, ['NomEvent', 'summary', 'eventName']) || 'Sense nom'
    const location = readString(data, ['Ubicacio', 'location'])
    const fact: MonthlyEventFact = {
      id: safeFactId(ym, doc.id),
      runId,
      ym,
      eventId: doc.id,
      eventDate,
      eventName,
      lnRaw,
      lnNormalized,
      included,
      exclusionReason: included ? '' : 'LN diferent d’Empresa o Casaments',
      numPax,
      hasValidPax,
      serviceType: readString(data, [
        'Servei',
        'Servicio',
        'service',
        'TipusServei',
        'tipusServei',
        'serviceType',
      ]),
      location,
      spaceKind: resolveSpaceKind(spaceIndex, {
        fincaId: data.FincaId ? String(data.FincaId) : null,
        fincaCode: data.FincaCode ? String(data.FincaCode) : null,
        ubicacioCode: data.UbicacioCode ? String(data.UbicacioCode) : null,
        location,
        eventName,
      }),
      generatedAt,
      calculationVersion: MONTHLY_INDICATOR_VERSION,
    }
    factsByYm.get(ym)!.push(fact)
  }

  const rows: MonthlyCostIndicatorRow[] = []
  const writes: Array<{
    ref: FirebaseFirestore.DocumentReference
    data: Record<string, unknown>
  }> = []

  for (const ym of months) {
    const facts = factsByYm.get(ym) || []
    const activity = buildActivityStats(facts)
    const opsia = opsiaByYm.get(ym)
    writes.push({
      ref: db.collection(SERVICE_COST_MONTHLY_ACTIVITY_COL).doc(ym),
      data: {
        ym,
        ...activity,
        runId,
        generatedAt,
        generatedBy: opts.userId,
        calculationVersion: MONTHLY_INDICATOR_VERSION,
      },
    })
    for (const fact of facts) {
      writes.push({
        ref: db.collection(SERVICE_COST_MONTHLY_EVENT_FACTS_COL).doc(fact.id),
        data: fact as unknown as Record<string, unknown>,
      })
    }

    for (const department of STRUCTURE_DEPARTMENTS) {
      const block = opsia?.departments?.[department]
      const resolvedPots = resolveStructurePots(block)
      const transferDoc = transfersByYm.get(ym)
      const deptDeductions = deductions.get(ym)?.[department]
      const rawSourceLines = (block?.lines || []).map((line) => ({
        deptCodi: String(line.deptCodi || ''),
        deptNom: String(line.deptNom || ''),
        costPersonal: Math.round((Number(line.costPersonal) || 0) * 100) / 100,
        pot: MONTHLY_POT_KEYS.includes(line.pot as (typeof MONTHLY_POT_KEYS)[number])
          ? (line.pot as (typeof MONTHLY_POT_KEYS)[number])
          : null,
      }))
      const transferAdjustment = adjustStructureLinesWithTransfers({
        department: department as CostServeisDepartment,
        sourceLines: rawSourceLines,
        transfers: transferDoc?.estat === 'CONFIRMAT' ? transferDoc.lines : [],
      })
      const sourceLines = transferAdjustment.lines
      const pots = Object.fromEntries(
        MONTHLY_POT_KEYS.map((pot) => [
          pot,
          buildPotMetrics({
            grossCost:
              sourceLines.length > 0
                ? sourceLines
                    .filter((line) => line.pot === pot)
                    .reduce((sum, line) => sum + line.costPersonal, 0)
                : Number(resolvedPots?.[pot]) || 0,
            manualDeductions: Number(deptDeductions?.[pot]) || 0,
            eventCount: activity.eventCount,
            paxCount: activity.paxCount,
          }),
        ])
      ) as MonthlyCostIndicatorRow['pots']
      const warnings: string[] = []
      if (!block) warnings.push('Costos d’Opsia no disponibles')
      if (!transferDoc || transferDoc.estat !== 'CONFIRMAT') {
        warnings.push('Traspassos d’Opsia no sincronitzats o no confirmats')
      }
      if (transferAdjustment.unappliedTransfers > 0) {
        warnings.push(
          `${transferAdjustment.unappliedTransfers.toLocaleString('ca-ES')} € de traspassos sense departament aplicable`
        )
      }
      if (activity.eventCount === 0) warnings.push('Cap esdeveniment Empresa/Casaments')
      if (activity.paxCount === 0) warnings.push('Cap pax vàlid')
      if (activity.missingPaxEvents > 0) {
        warnings.push(`${activity.missingPaxEvents} esdeveniment(s) sense pax vàlids`)
      }
      if (
        MONTHLY_POT_KEYS.some(
          (pot) => pots[pot].manualDeductions > pots[pot].grossCost
        )
      ) {
        warnings.push('Hi ha deduccions manuals superiors al pot')
      }
      for (const pot of MONTHLY_POT_KEYS) {
        const detailTotal = Math.round(
          sourceLines
            .filter((line) => line.pot === pot)
            .reduce((sum, line) => sum + line.costPersonal, 0) * 100
        ) / 100
        if (sourceLines.length > 0 && Math.abs(detailTotal - pots[pot].grossCost) > 0.01) {
          warnings.push(`El resum i el detall d’Opsia no quadren per a ${pot}`)
        }
      }
      const status: MonthlyCostIndicatorRow['status'] =
        !block || activity.eventCount === 0 || activity.paxCount === 0
          ? 'incomplete'
          : warnings.length > 0
            ? 'warning'
            : 'complete'
      const [year, month] = ym.split('-').map(Number)
      const row: MonthlyCostIndicatorRow = {
        id: `${ym}__${department}`,
        ym,
        year,
        month,
        department: department as CostServeisDepartment,
        activity,
        pots,
        totals: sumPotMetrics(pots, activity.eventCount, activity.paxCount),
        sourceLines,
        transferAdjustment: {
          transferOut: transferAdjustment.transferOut,
          transferIn: transferAdjustment.transferIn,
          netAdjustment: transferAdjustment.netAdjustment,
          unappliedTransfers: transferAdjustment.unappliedTransfers,
        },
        status,
        warnings,
        opsiaSyncedAt: String(opsia?.syncedAt || ''),
        generatedAt,
        generatedBy: opts.userId,
        calculationVersion: MONTHLY_INDICATOR_VERSION,
        runId,
      }
      rows.push(row)
      writes.push({
        ref: db.collection(SERVICE_COST_MONTHLY_INDICATORS_COL).doc(row.id),
        data: row as unknown as Record<string, unknown>,
      })
    }
  }

  await commitWrites(writes)
  const eventFacts = Array.from(factsByYm.values()).reduce(
    (total, monthFacts) => total + monthFacts.length,
    0
  )
  return { rows, eventFacts, months: months.length }
}

export async function listMonthlyCostIndicators(opts: {
  fromYm: string
  toYm: string
  department: CostServeisDepartment | 'all'
}): Promise<MonthlyCostIndicatorRow[]> {
  const snap = await db
    .collection(SERVICE_COST_MONTHLY_INDICATORS_COL)
    .where('ym', '>=', opts.fromYm)
    .where('ym', '<=', opts.toYm)
    .orderBy('ym', 'asc')
    .get()
  return snap.docs
    .map((doc) => doc.data() as MonthlyCostIndicatorRow)
    .filter((row) => opts.department === 'all' || row.department === opts.department)
    .sort((a, b) => a.ym.localeCompare(b.ym) || a.department.localeCompare(b.department))
}
