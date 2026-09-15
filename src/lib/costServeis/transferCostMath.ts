import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import type {
  OpsiaTransferLine,
  OpsiaTransfersMonthDoc,
} from '@/lib/costServeis/opsiaTransfersTypes'
import type { CostServeisDepartment } from '@/lib/costServeis/types'

export type StructureTransferSourceLine = {
  deptCodi: string
  deptNom: string
  costPersonal: number
  pot: 'gestio' | 'preparacio' | 'rentat' | null
}

export type AdjustedStructureTransferLine = StructureTransferSourceLine & {
  costPersonalGross: number
  transferOut: number
  transferIn: number
}

export type StructureTransferAdjustment = {
  lines: AdjustedStructureTransferLine[]
  transferOut: number
  transferIn: number
  netAdjustment: number
  unappliedTransfers: number
}

export type AdjustedStructurePots = {
  gestio: number
  preparacio: number
  rentat: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function sourceCentreForDepartment(
  department: CostServeisDepartment
): string | null {
  return department === 'cuina' ? 'CCC00007' : null
}

/**
 * Aplica traspassos sobre les línies salarials originals:
 * - tota sortida redueix el departament d'origen;
 * - només les entrades internes a Càtering es reincorporen a DCC0005.
 */
export function adjustStructureLinesWithTransfers(input: {
  department: CostServeisDepartment
  sourceLines: StructureTransferSourceLine[]
  transfers: OpsiaTransferLine[]
}): StructureTransferAdjustment {
  const centreCodi = sourceCentreForDepartment(input.department)
  const deltas = new Map<string, { out: number; in: number }>()
  let transferOut = 0
  let transferIn = 0
  let unappliedTransfers = 0

  const add = (deptCodi: string | null, kind: 'out' | 'in', amount: number) => {
    if (!deptCodi) {
      unappliedTransfers = round2(unappliedTransfers + amount)
      return
    }
    const key = deptCodi.toUpperCase()
    const row = deltas.get(key) ?? { out: 0, in: 0 }
    row[kind] = round2(row[kind] + amount)
    deltas.set(key, row)
  }

  for (const transfer of input.transfers) {
    const amount = round2(Number(transfer.importTotal) || 0)
    if (!centreCodi || amount === 0 || transfer.origenCentreCodi !== centreCodi) {
      continue
    }
    transferOut = round2(transferOut + amount)
    add(transfer.origenDeptCodi, 'out', amount)
    if (
      input.department === 'cuina' &&
      transfer.destiGrup === 'CATERING' &&
      transfer.destiCentreCodi === centreCodi
    ) {
      transferIn = round2(transferIn + amount)
      add(transfer.destiDeptCodi, 'in', amount)
    }
  }

  const lines = input.sourceLines.map((line) => {
    const gross = round2(Number(line.costPersonal) || 0)
    const delta = deltas.get(line.deptCodi.toUpperCase()) ?? { out: 0, in: 0 }
    deltas.delete(line.deptCodi.toUpperCase())
    return {
      ...line,
      costPersonalGross: gross,
      transferOut: delta.out,
      transferIn: delta.in,
      costPersonal: round2(gross - delta.out + delta.in),
    }
  })

  for (const delta of deltas.values()) {
    unappliedTransfers = round2(unappliedTransfers + delta.out + delta.in)
  }

  return {
    lines,
    transferOut,
    transferIn,
    netAdjustment: round2(transferIn - transferOut),
    unappliedTransfers,
  }
}

export function sumAdjustedStructurePots(
  lines: AdjustedStructureTransferLine[]
): AdjustedStructurePots | null {
  const pots: AdjustedStructurePots = { gestio: 0, preparacio: 0, rentat: 0 }
  for (const line of lines) {
    if (line.pot) pots[line.pot] += Number(line.costPersonal) || 0
  }
  pots.gestio = round2(pots.gestio)
  pots.preparacio = round2(pots.preparacio)
  pots.rentat = round2(pots.rentat)
  return pots.gestio > 0 || pots.preparacio > 0 || pots.rentat > 0 ? pots : null
}

/** Traspassos externs que ja formen part del personal directe d'una LN. */
export function sumOperationalTransfersForLn(
  doc: Pick<OpsiaTransfersMonthDoc, 'estat' | 'lines'> | null | undefined,
  ln: string,
  lnCodi?: string | null
): number | null {
  if (!doc || doc.estat !== 'CONFIRMAT') return null
  const normalized = normalizeManualLnName(ln)
  const code = String(lnCodi || '').trim().toUpperCase()
  const folded = String(ln || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  const destination =
    code === 'LN00002' || normalized === 'Empresa'
      ? 'EMPRESA'
      : code === 'LN00003' || normalized === 'Casaments'
        ? 'CASAMENTS'
        : code === 'LN00005' ||
            code === 'LN00007' ||
            normalized === 'Foodlovers' ||
            folded.includes('fires & festivals') ||
            folded.includes('fires i festivals')
          ? 'FOODLOVERS'
          : null
  if (!destination) return 0
  return round2(
    doc.lines
      .filter((line) => line.destiGrup === destination)
      .reduce((sum, line) => sum + (Number(line.importTotal) || 0), 0)
  )
}
