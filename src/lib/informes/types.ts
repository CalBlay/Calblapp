/**
 * Contracte comú per al mòdul Informes: dades de l’app, fitxers/MCP, ERP, o barreges.
 * Creix per domini (RRHH, finances, compres, esdeveniments, …).
 */

export type InformesDataSourceKind = 'app' | 'mcp_file' | 'erp' | 'hybrid'

export type InformesDomainId =
  | 'rrhh'
  | 'transports'
  | 'maintenance'
  | 'finances'
  | 'compres'
  | 'events'

export type InformesDomainMeta = {
  id: InformesDomainId
  label: string
  /** Orígens de dades previstos (per UI i futura traçabilitat). */
  sources: InformesDataSourceKind[]
  /** Domini encara no implementat a la UI. */
  comingSoon?: boolean
}
