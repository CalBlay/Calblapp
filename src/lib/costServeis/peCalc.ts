/**
 * CVP en € / pax — PE de facturació i pax mínims.
 * Funció pura: sense I/O. Els % entren com a ratio 0–1.
 */

export type PeMode = 'pots' | 'pctGestio'

export type PeInputs = {
  /** Facturació de referència del bucket (€). */
  billing: number
  /** Cost variable operatiu absolut (€). */
  cvOperatiu: number
  /** Food cost — ratio 0–1. */
  pctCompres: number
  /** % Gestió Opsia — ratio 0–1 (només entra si mode = pctGestio). */
  pctGestio: number
  /** Fix salarial imputat al bucket (€). */
  fixDirecte: number
  /** Personal indirecte imputat (€). */
  fixIndirecte: number
  /** Mode A = pots; Mode B = % Gestió al MC% (sense fix indirecte a la fórmula). */
  mode: PeMode
  /** Pax del bucket. */
  numPax?: number
  /**
   * Preu mitjà €/pax (opcional). Si no ve, = billing / numPax.
   * Permet what-if: “si venc a X €/pax, quants pax calen?”
   */
  preuMitjaPax?: number | null
}

export type PeStatus = 'ok' | 'no_margin' | 'no_price' | 'no_fixed' | 'no_data'

export type PeResult = {
  cvOperatiuPct: number | null
  pctCompresInFormula: number
  pctGestioInFormula: number
  mcPct: number | null
  mcEuro: number | null
  fixos: number
  peEuro: number | null
  cobertura: number | null
  pePax: number | null
  /** Preu mitjà usat al càlcul (€/pax). */
  preuMitjaPax: number | null
  /** Cost variable operatiu per pax (€). */
  cvOperatiuPerPax: number | null
  /** Compres (+ gestió si mode B) per pax (€). */
  cvPctPerPax: number | null
  /** Cost variable total per pax (€). */
  costVariablePerPax: number | null
  /** El que queda de cada pax per cobrir fixos (€). */
  margePerPax: number | null
  status: PeStatus
  /** Frase curta per a la UI (català). */
  headline: string
  warnings: string[]
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function clampRatio(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function fmtEuroPlain(n: number) {
  return n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

function fmtPaxPlain(n: number) {
  return Math.ceil(n).toLocaleString('ca-ES')
}

/**
 * Calcula PE€ = Fixos ÷ MC% i PE pax = Fixos ÷ marge/pax
 * (equivalent si el preu/pax és el de la facturació observada).
 */
export function peFromInputs(raw: PeInputs): PeResult {
  const billing = Math.max(0, Number(raw.billing) || 0)
  const cvOperatiu = Math.max(0, Number(raw.cvOperatiu) || 0)
  const pctCompres = clampRatio(Number(raw.pctCompres) || 0)
  const pctGestio = clampRatio(Number(raw.pctGestio) || 0)
  const fixDirecte = Math.max(0, Number(raw.fixDirecte) || 0)
  const fixIndirecte = Math.max(0, Number(raw.fixIndirecte) || 0)
  const mode: PeMode = raw.mode === 'pctGestio' ? 'pctGestio' : 'pots'
  const numPax = Math.max(0, Number(raw.numPax) || 0)

  const warnings: string[] = []
  const cvOperatiuPct = billing > 0 ? round4(cvOperatiu / billing) : null
  const pctGestioInFormula = mode === 'pctGestio' ? pctGestio : 0
  const pctCompresInFormula = pctCompres
  const fixos =
    mode === 'pctGestio'
      ? round2(fixDirecte)
      : round2(fixDirecte + fixIndirecte)

  if (mode === 'pctGestio' && fixIndirecte > 0) {
    warnings.push(
      'Mode % Gestió: el fix indirecte no entra a la fórmula (evita doble comptatge).'
    )
  }

  let preuMitjaPax: number | null = null
  if (raw.preuMitjaPax != null && Number(raw.preuMitjaPax) > 0) {
    preuMitjaPax = round2(Number(raw.preuMitjaPax))
  } else if (numPax > 0 && billing > 0) {
    preuMitjaPax = round2(billing / numPax)
  }

  const cvOperatiuPerPax =
    numPax > 0 ? round2(cvOperatiu / numPax) : null

  let mcPct: number | null = null
  if (cvOperatiuPct != null) {
    mcPct = round4(1 - cvOperatiuPct - pctCompresInFormula - pctGestioInFormula)
  } else if (preuMitjaPax != null && preuMitjaPax > 0 && cvOperatiuPerPax != null) {
    // What-if amb preu editat i CV/pax històric
    const cvRatio = cvOperatiuPerPax / preuMitjaPax
    mcPct = round4(1 - cvRatio - pctCompresInFormula - pctGestioInFormula)
  }

  const cvPctPerPax =
    preuMitjaPax != null
      ? round2(preuMitjaPax * (pctCompresInFormula + pctGestioInFormula))
      : null

  const costVariablePerPax =
    cvOperatiuPerPax != null && cvPctPerPax != null
      ? round2(cvOperatiuPerPax + cvPctPerPax)
      : null

  const margePerPax =
    preuMitjaPax != null && costVariablePerPax != null
      ? round2(preuMitjaPax - costVariablePerPax)
      : null

  const mcEuro =
    preuMitjaPax != null &&
    numPax > 0 &&
    margePerPax != null
      ? round2(margePerPax * numPax)
      : billing > 0 && mcPct != null
        ? round2(billing * mcPct)
        : null

  let peEuro: number | null = null
  let pePax: number | null = null
  let status: PeStatus = 'ok'
  let headline = ''

  if (preuMitjaPax == null || preuMitjaPax <= 0) {
    status = 'no_price'
    headline =
      'Falten facturació i pax per saber el preu mitjà de venda.'
    warnings.push(headline)
  } else if (margePerPax == null || margePerPax <= 0 || (mcPct != null && mcPct <= 0)) {
    status = 'no_margin'
    const preuTxt = fmtEuroPlain(preuMitjaPax)
    const costTxt =
      costVariablePerPax != null ? fmtEuroPlain(costVariablePerPax) : '—'
    headline = `A ${preuTxt}/pax els costos variables (${costTxt}/pax) ja es mengen tot el preu. No hi ha punt d’equilibri: cal pujar el preu o baixar el cost variable.`
    warnings.push(headline)
  } else if (fixos <= 0) {
    status = 'no_fixed'
    peEuro = 0
    pePax = 0
    headline = `A ${fmtEuroPlain(preuMitjaPax)}/pax ja cubriu variables; sense fixos imputats el PE és 0 pax.`
    warnings.push('Fixos = 0 (no hi ha pot imputat o s’ha editat a zero).')
  } else {
    pePax = round2(fixos / margePerPax)
    peEuro = round2(pePax * preuMitjaPax)
    // Coherència amb MC% si el tenim
    if (mcPct != null && mcPct > 0) {
      peEuro = round2(fixos / mcPct)
      pePax = round2(peEuro / preuMitjaPax)
    }
    headline = `Normalment veneu a ${fmtEuroPlain(preuMitjaPax)}/pax. Per assolir el PE us calen com a mínim ${fmtPaxPlain(pePax)} pax (facturació mínima ${fmtEuroPlain(peEuro)}).`
  }

  if (billing <= 0 && (raw.preuMitjaPax == null || Number(raw.preuMitjaPax) <= 0)) {
    if (status === 'ok') status = 'no_data'
  }

  const cobertura =
    peEuro != null && peEuro > 0 && billing > 0
      ? round4(billing / peEuro)
      : pePax != null && pePax > 0 && numPax > 0
        ? round4(numPax / pePax)
        : null

  return {
    cvOperatiuPct,
    pctCompresInFormula,
    pctGestioInFormula,
    mcPct,
    mcEuro,
    fixos,
    peEuro,
    cobertura,
    pePax,
    preuMitjaPax,
    cvOperatiuPerPax,
    cvPctPerPax,
    costVariablePerPax,
    margePerPax,
    status,
    headline,
    warnings,
  }
}

/** Converteix % emmagatzemat com 18.5 → ratio 0.185. */
export function pctPointsToRatio(points: number | null | undefined): number {
  if (points == null || !Number.isFinite(Number(points))) return 0
  const n = Number(points)
  if (n > 0 && n <= 1.5) return clampRatio(n)
  return clampRatio(n / 100)
}

export function ratioToPctPoints(ratio: number): number {
  return round4(clampRatio(ratio) * 100)
}
