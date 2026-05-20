/** Col·leccions Firestore del mòdul Cuina central (prefix únic, escalable). */
export const CUINA_CENTRAL_COLLECTIONS = {
  articles: 'cuinaCentral_articles',
  machines: 'cuinaCentral_machines',
  shifts: 'cuinaCentral_shifts',
  machineArticleRates: 'cuinaCentral_machineArticleRates',
  productionLogs: 'cuinaCentral_productionLogs',
  productionPlans: 'cuinaCentral_productionPlans',
  /** Mostres per entrenament / auditoria ML (1 per registre de producció). */
  learningSamples: 'cuinaCentral_learningSamples',
  /** Estat del model per parell article·màquina (aprenentatge continu). */
  modelStates: 'cuinaCentral_modelStates',
  /** Informes diaris precomputats per decisions operatives. */
  dailyReports: 'cuinaCentral_dailyReports',
} as const

export type CuinaCentralCollectionKey = keyof typeof CUINA_CENTRAL_COLLECTIONS
