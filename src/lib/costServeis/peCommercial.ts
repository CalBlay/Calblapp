/**
 * Calculadora comercial PE (bidireccional).
 * Cost variable/pax = cvOperatiu/pax + preu × %compres [+ preu × %gestió].
 * Fixos = pot a cobrir del perfil.
 */

export type PeCommercialInputs = {
  /** Preu de venda €/pax (escenari). */
  preuPax: number
  /** Nombre de pax de l’escenari (per preu mínim). */
  pax: number
  /** Cost variable operatiu €/pax (sense food cost %). */
  cvOperatiuPerPax: number
  /** Food cost ratio 0–1. */
  pctCompres: number
  /** % Gestió ratio 0–1 (0 si no s’aplica). */
  pctGestio: number
  /** Fixos absoluts a cobrir (€). */
  fixos: number
}

export type PeCommercialResult = {
  /** Cost variable total / pax al preu actual (inclou % sobre preu). */
  costVariablePerPax: number
  /** Què queda de cada pax després de variables. */
  margePerPax: number
  /** Amb aquest preu: pax mínims. */
  pePax: number | null
  /** Amb aquests pax: preu mínim €/pax. */
  preuMinimPax: number | null
  /** Facturació mínima absoluta (€) = fixos / MC%  o pePax × preu. */
  peFacturacio: number | null
  /** MC% al preu actual. */
  mcPct: number | null
  status: 'ok' | 'no_margin' | 'no_fixed' | 'no_data'
  /** Frases curtes per a director comercial. */
  linePreuFix: string
  linePaxFix: string
  lineFacturacio: string
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fmtEuro(n: number, digits = 2) {
  return n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
  })
}

function fmtPax(n: number) {
  return Math.ceil(n).toLocaleString('ca-ES')
}

/**
 * Respostes comercials:
 * - Si el preu és X → calen Y pax (i Z € de facturació)
 * - Si els pax són N → cal vendre a mínim P €/pax
 */
export function peCommercial(raw: PeCommercialInputs): PeCommercialResult {
  const preuPax = Math.max(0, Number(raw.preuPax) || 0)
  const pax = Math.max(0, Number(raw.pax) || 0)
  const cvOp = Math.max(0, Number(raw.cvOperatiuPerPax) || 0)
  const pctCompres = Math.max(0, Number(raw.pctCompres) || 0)
  const pctGestio = Math.max(0, Number(raw.pctGestio) || 0)
  const fixos = Math.max(0, Number(raw.fixos) || 0)

  const pctVarSobrePreu = pctCompres + pctGestio
  // costVar = cvOp + preu * pct  →  marge = preu*(1-pct) - cvOp
  const costVariablePerPax = round2(cvOp + preuPax * pctVarSobrePreu)
  const margePerPax = round2(preuPax - costVariablePerPax)
  const mcPct =
    preuPax > 0 ? round2((1 - pctVarSobrePreu) - cvOp / preuPax) : null

  // Preu mínim per N pax: P*(1-pct) - cvOp = fixos/N  →  P = (fixos/N + cvOp) / (1-pct)
  const denom = 1 - pctVarSobrePreu
  let preuMinimPax: number | null = null
  if (pax > 0 && denom > 0) {
    preuMinimPax = round2((fixos / pax + cvOp) / denom)
  }

  let pePax: number | null = null
  let peFacturacio: number | null = null
  let status: PeCommercialResult['status'] = 'ok'

  if (fixos <= 0) {
    status = 'no_fixed'
    pePax = 0
    peFacturacio = 0
  } else if (margePerPax <= 0 || (mcPct != null && mcPct <= 0)) {
    status = 'no_margin'
  } else {
    pePax = round2(fixos / margePerPax)
    peFacturacio = round2(pePax * preuPax)
  }

  const linePreuFix =
    status === 'no_fixed'
      ? 'Introdueix els fixos a cobrir (ara són 0: sync Opsia o valor manual).'
      : status === 'no_margin'
        ? `A ${fmtEuro(preuPax)}/pax el cost variable (${fmtEuro(costVariablePerPax)}/pax) es menja tot el preu: no hi ha PE. Puja el preu.`
        : pePax != null
          ? `Si veneu a ${fmtEuro(preuPax)}/pax → calen com a mínim ${fmtPax(pePax)} pax.`
          : '—'

  const linePaxFix =
    preuMinimPax == null
      ? 'Indica un nombre de pax per saber el preu mínim.'
      : status === 'no_fixed'
        ? `Amb ${fmtPax(pax)} pax i fixos 0, el preu mínim per cobrir només variables és ${fmtEuro(preuMinimPax)}/pax. Poseu fixos per al PE complet.`
        : `Si feu ${fmtPax(pax)} pax → cal vendre a com a mínim ${fmtEuro(preuMinimPax)}/pax.`

  const lineFacturacio =
    status === 'ok' && peFacturacio != null
      ? `Facturació mínima del servei: ${fmtEuro(peFacturacio, 0)}.`
      : status === 'no_fixed'
        ? 'Facturació mínima = 0 mentre els fixos siguin 0.'
        : 'No hi ha facturació mínima viable amb aquest preu.'

  return {
    costVariablePerPax,
    margePerPax,
    pePax,
    preuMinimPax,
    peFacturacio,
    mcPct,
    status,
    linePreuFix,
    linePaxFix,
    lineFacturacio,
  }
}
