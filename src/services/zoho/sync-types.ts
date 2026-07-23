export interface ZohoOwner {
  id: string
  name: string
  email?: string
}

export interface ZohoNamedValue {
  id?: string
  name?: string
}

export interface ZohoDeal {
  id: string
  Deal_Name: string
  Modified_Time?: string | null
  Account_Name?: string | ZohoNamedValue | null
  Stage: string
  Servicio_texto?: string | null
  Men_texto?: string | null
  N_mero_de_invitados?: number | string | null
  N_mero_de_personas_del_evento?: number | string | null
  Finca_2?: string[] | null
  Espai_2?: string[] | null
  Fecha_del_evento?: string | null
  Fecha_y_hora_del_evento?: string | null
  Duraci_n_del_evento?: number | string | null
  C_digo?: string | null
  Owner: ZohoOwner
  Responsable?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Comercial_Interna?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Fecha_de_petici_n?: string | null
  Precio_Total?: number | string | null
  Amount?: number | string | null
  Observacions?: string | null
  Description?: string | null
  Fulla_d_enc_rrec?: unknown
  Full_de_Tast?: unknown
}

export interface NormalizedDeal {
  idZoho: string
  NomEvent: string
  NomClient?: string
  Stage: string
  LN: string
  Servei: string
  Comercial: string
  ComercialIntern?: string
  Responsable: string
  DataInici: string | null
  DataFi: string | null
  HoraInici?: string | null
  NumPax: number | string | null
  ObservacionsZoho?: string | null
  Ubicacio: string
  FincaId?: string
  FincaCode?: string
  FincaLN?: string
  UbicacioCode?: string | null
  Color: string
  StageDot: string
  StageGroup: string
  origen: string
  editable: boolean
  updatedAt: string
  collection: 'taronja' | 'taronja' | 'verd' | string
  DataPeticio?: string | null
  PreuMenu?: number | string | null
  Import?: number | string | null
}

export function cleanUndefined(obj: NormalizedDeal): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value
    }
  }
  return clean
}
