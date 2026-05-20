/** Paràmetres del model d'aprenentatge continu. */
export const ML_CONFIG = {
  /** Mostres recents guardades al doc d'estat (per mediana/P90). */
  recentBufferMax: 120,
  /** Mostra mínima per confiança mitjana. */
  confidenceMediumSamples: 5,
  /** Mostra mínima per confiança alta. */
  confidenceHighSamples: 20,
  /** Factor EMA (0–1): més alt = més pes a la darrera producció. */
  emaAlpha: 0.25,
  /** Llindar eficiència baixa (real/teòric). */
  lowEfficiencyThreshold: 0.85,
  /** Desviació % respecte teòric per alerta. */
  deviationAlertPct: 15,
  /** Finestra rolling (dies). */
  window7d: 7,
  window30d: 30,
} as const

export const modelStateDocId = (articleId: string, machineId: string) =>
  `${articleId}__${machineId}`

export const dateKeyFromIso = (iso: string) => iso.slice(0, 10)
