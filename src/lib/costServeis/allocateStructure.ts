/**
 * Repartiment pots Opsia (gestió / prep / rentat) als events del mes
 * segons ponderació Configuració + pax (prep/rentat).
 */

import { matchServeiCatalogId } from '@/lib/serveis/utils'
import { DEFAULT_SERVEI_COST_WEIGHTS } from '@/lib/serveis/utils'
import type { ServeiWeightRow, PonderacioDept } from '@/lib/costServeis/serveiWeights'
import { PONDERACIO_DEPTS } from '@/lib/costServeis/serveiWeights'
import type { OpsiaDeptImport } from '@/lib/costServeis/opsiaFinance'
import type { ServiceCostSheet } from '@/lib/costServeis/types'
import { recomputeSheet } from '@/lib/costServeis/calc'
import type { HourlyRateByDept, FuelConfig } from '@/lib/costServeis/types'

export type StructurePots = {
  gestio: number
  preparacio: number
  rentat: number
}

export type StructureQuota = {
  managementCost: number
  preparationCost: number
  washingCost: number
}

export type StructureEventInput = {
  eventId: string
  serviceType: string
  numPax: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function resolveStructurePots(block?: OpsiaDeptImport | null): StructurePots | null {
  if (!block) return null
  const pots = {
    gestio: Number(block.pots?.gestio) || 0,
    preparacio: Number(block.pots?.preparacio) || 0,
    rentat: Number(block.pots?.rentat) || 0,
  }
  if (!(pots.gestio > 0 || pots.preparacio > 0 || pots.rentat > 0) && Array.isArray(block.lines)) {
    for (const line of block.lines) {
      const c = Number(line.costPersonal) || 0
      if (line.pot === 'gestio') pots.gestio += c
      if (line.pot === 'preparacio') pots.preparacio += c
      if (line.pot === 'rentat') pots.rentat += c
    }
    pots.gestio = round2(pots.gestio)
    pots.preparacio = round2(pots.preparacio)
    pots.rentat = round2(pots.rentat)
  }
  if (!(pots.gestio > 0 || pots.preparacio > 0 || pots.rentat > 0)) return null
  return pots
}

function coefForEvent(
  serviceType: string,
  catalog: Array<{ id: string; nom: string; codi: string }>,
  weightsByServeiId: Map<string, ServeiWeightRow>
): { gestio: number; preparacio: number; rentat: number } {
  const id = matchServeiCatalogId(serviceType, catalog)
  const row = id ? weightsByServeiId.get(id) : undefined
  if (!row) return { ...DEFAULT_SERVEI_COST_WEIGHTS }
  return {
    gestio: row.gestio,
    preparacio: row.preparacio,
    rentat: row.rentat,
  }
}

/**
 * gestió: coef
 * prep/rentat: coef × max(pax, 1)
 * quota = pot × pes / Σ pesos
 */
export function allocateStructurePotsToEvents(opts: {
  pots: StructurePots
  events: StructureEventInput[]
  catalog: Array<{ id: string; nom: string; codi: string }>
  weightRows: ServeiWeightRow[]
  dept: PonderacioDept
}): Map<string, StructureQuota> {
  const weightsByServeiId = new Map<string, ServeiWeightRow>()
  for (const w of opts.weightRows) {
    if (w.dept !== opts.dept) continue
    weightsByServeiId.set(w.serveiId, w)
  }

  const scored = opts.events.map((ev) => {
    const coef = coefForEvent(ev.serviceType, opts.catalog, weightsByServeiId)
    const pax = Math.max(1, Number(ev.numPax) || 0)
    return {
      eventId: ev.eventId,
      wGestio: Math.max(0, coef.gestio),
      wPrep: Math.max(0, coef.preparacio * pax),
      wRentat: Math.max(0, coef.rentat * pax),
    }
  })

  const sumG = scored.reduce((s, r) => s + r.wGestio, 0)
  const sumP = scored.reduce((s, r) => s + r.wPrep, 0)
  const sumR = scored.reduce((s, r) => s + r.wRentat, 0)

  const out = new Map<string, StructureQuota>()
  for (const r of scored) {
    out.set(r.eventId, {
      managementCost:
        sumG > 0 ? round2((opts.pots.gestio * r.wGestio) / sumG) : 0,
      preparationCost:
        sumP > 0 ? round2((opts.pots.preparacio * r.wPrep) / sumP) : 0,
      washingCost:
        sumR > 0 ? round2((opts.pots.rentat * r.wRentat) / sumR) : 0,
    })
  }
  return out
}

/** Aplica quotes Opsia a logistica/cuina d’una fitxa (recalcula subtotals). */
export function applyStructureQuotasToSheet(
  sheet: ServiceCostSheet,
  quotasByDept: Partial<Record<PonderacioDept, StructureQuota>>,
  rates: HourlyRateByDept,
  fuel: FuelConfig
): ServiceCostSheet {
  const departments = { ...sheet.departments }
  for (const dept of PONDERACIO_DEPTS) {
    const q = quotasByDept[dept]
    if (!q) continue
    const prev = departments[dept]
    if (!prev) continue
    departments[dept] = {
      ...prev,
      managementCost: q.managementCost,
      preparationCost: q.preparationCost,
      washingCost: q.washingCost,
    }
  }
  return recomputeSheet({ ...sheet, departments }, rates, fuel)
}
