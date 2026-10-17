import type {
  OpsiaEstructuraLnMonthDoc,
  OpsiaEstructuraLnRow,
  OpsiaEstructuraLnTableRow,
} from '@/lib/costServeis/opsiaEstructuraLnTypes'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function normalizeOpsiaEstructuraLnRow(
  raw: Partial<OpsiaEstructuraLnRow> & { lnCodi: string }
): OpsiaEstructuraLnRow {
  const estat = String(raw.execucioEstat || 'SENSE_DADES')
  const execucioEstat =
    estat === 'CONFIRMAT' || estat === 'LIVE_FALLBACK' || estat === 'SENSE_DADES'
      ? estat
      : 'SENSE_DADES'

  const compatibleRaw = raw as Partial<OpsiaEstructuraLnRow> & {
    personalTotal?: number
    costPersonalLn?: number
  }
  const personalTotalRaw =
    compatibleRaw.personalTotalLn ??
    compatibleRaw.personalTotal ??
    compatibleRaw.costPersonalLn
  const personalTotalLn =
    personalTotalRaw == null || !Number.isFinite(Number(personalTotalRaw))
      ? null
      : round2(Math.max(0, Number(personalTotalRaw)))
  const personalIndirecteMode =
    compatibleRaw.personalIndirecteMode === 'FIX_DEPARTAMENTS'
      ? 'FIX_DEPARTAMENTS'
      : 'RESIDUAL_LN'
  const personalIndirecteFixRaw = compatibleRaw.personalIndirecteFixConfigurat
  const personalIndirecteFixConfigurat =
    personalIndirecteFixRaw == null ||
    !Number.isFinite(Number(personalIndirecteFixRaw))
      ? null
      : round2(Math.max(0, Number(personalIndirecteFixRaw)))

  return {
    lnCodi: String(raw.lnCodi || '').toUpperCase(),
    lnNom: String(raw.lnNom || raw.lnCodi || ''),
    vista: 'gestio',
    compresImputades: round2(Number(raw.compresImputades) || 0),
    personalImputat: round2(Number(raw.personalImputat) || 0),
    personalTotalLn,
    personalIndirecteMode,
    personalIndirecteFixConfigurat,
    personalExclosLogisticaCuina: round2(Number(raw.personalExclosLogisticaCuina) || 0),
    personalImputatNet: round2(Number(raw.personalImputatNet) || 0),
    gestioImputada: round2(Number(raw.gestioImputada) || 0),
    estructuraCentral: round2(Number(raw.estructuraCentral) || 0),
    estructuraNeta: round2(Number(raw.estructuraNeta) || 0),
    execucioEstat,
  }
}

/** Keep last known LN totals / configured fix when a live Opsia sync omits them. */
export function mergeOpsiaEstructuraLnRowWithPrevious(
  row: OpsiaEstructuraLnRow,
  previous: OpsiaEstructuraLnRow | undefined
): OpsiaEstructuraLnRow {
  return {
    ...row,
    personalTotalLn:
      row.personalTotalLn == null && previous?.personalTotalLn != null
        ? previous.personalTotalLn
        : row.personalTotalLn,
    personalIndirecteFixConfigurat:
      row.personalIndirecteMode === 'FIX_DEPARTAMENTS' &&
      row.personalIndirecteFixConfigurat == null &&
      previous?.personalIndirecteFixConfigurat != null
        ? previous.personalIndirecteFixConfigurat
        : row.personalIndirecteFixConfigurat,
  }
}

export function flattenEstructuraLnMonthsToRows(
  docs: OpsiaEstructuraLnMonthDoc[]
): OpsiaEstructuraLnTableRow[] {
  const rows: OpsiaEstructuraLnTableRow[] = []
  for (const doc of docs) {
    for (const ln of Object.values(doc.byLn || {})) {
      rows.push({
        ym: doc.ym,
        year: doc.year,
        month: doc.month,
        lnCodi: ln.lnCodi,
        lnNom: ln.lnNom,
        estructuraNeta: ln.estructuraNeta,
        estructuraCentral: ln.estructuraCentral,
        personalImputatNet: ln.personalImputatNet,
        personalTotalLn: ln.personalTotalLn ?? null,
        personalIndirecteMode:
          ln.personalIndirecteMode === 'FIX_DEPARTAMENTS'
            ? 'FIX_DEPARTAMENTS'
            : 'RESIDUAL_LN',
        personalIndirecteFixConfigurat:
          ln.personalIndirecteFixConfigurat ?? null,
        fixedDirecte: null,
        personalIndirecteCalculat: null,
        personalExclosLogisticaCuina: ln.personalExclosLogisticaCuina,
        gestioImputada: ln.gestioImputada,
        compresImputades: ln.compresImputades,
        execucioEstat: ln.execucioEstat,
        syncedAt: doc.syncedAt,
      })
    }
  }
  return rows.sort(
    (a, b) => a.ym.localeCompare(b.ym) || a.lnCodi.localeCompare(b.lnCodi)
  )
}
