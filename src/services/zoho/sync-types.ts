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
  /** Camp alternatiu de Zoho; Pipeline/Canal té prioritat per resoldre la LN. */
  Tipo_de_lead?: string | ZohoNamedValue | null
  Pipeline?: string | ZohoNamedValue | null
  Servicio_texto?: string | null
  Men_texto?: string | null
  N_mero_de_invitados?: number | string | null
  N_mero_de_personas_del_evento?: number | string | null
  Finca_2?: string[] | null
  Espai_2?: string[] | null
  Fecha_del_evento?: string | null
  Fecha_y_hora_del_evento?: string | null
  /** Camp Zoho «Hora esdeveniment» (hora sola, p.ex. "12:00 h"). */
  Hora_esdeveniment?: string | null
  Hora_Fi_Boda?: string | null
  Hora_Fi_Evento?: string | null
  Duraci_n_del_evento?: number | string | null
  C_digo?: string | null
  Owner: ZohoOwner
  Responsable?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Comercial_Interna?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Data_i_hora?: string | null
  Ubicaci?: string | null
  Ubicaci_1a_Part?: string | null
  Ubicaci_2a_part?: string | null
  Pax?: number | string | null
  Data_1_Prova_Men?: string | null
  Auto_data_1a_part?: string | boolean | null
  Data_enviament_Forms?: string | null
  Comensals?: number | string | null
  Data_2a_Part_Tast?: string | null
  Auto_Data_2a_Part?: string | boolean | null
  Hora?: string | null
  Observacions_2a_Part?: string | null
  Comensals_2a?: number | string | null
  Fecha_de_petici_n?: string | null
  Precio_Total?: number | string | null
  Amount?: number | string | null
  Observacions?: string | null
  Description?: string | null
  Fulla_d_enc_rrec?: unknown
  Full_de_Tast?: unknown
  Full_de_modificacions?: unknown
  Full_modificacions?: unknown
  Arxiu_PM?: unknown
  Arxiu_TM?: unknown
  Arxiu_TM2?: unknown
}

export interface NormalizedDeal {
  idZoho: string
  NomEvent: string
  NomClient?: string
  Stage: string
  Pipeline?: string | null
  LN: string
  Servei: string
  Comercial: string
  ComercialIntern?: string
  Responsable: string
  Data_i_hora?: string | null
  Ubicaci?: string | null
  Ubicaci_1a_Part?: string | null
  Ubicaci_2a_part?: string | null
  Pax?: number | string | null
  MenuTasting1Date?: string | null
  MenuTasting2Date?: string | null
  MenuTastingCompanyDate?: string | null
  Data_1_Prova_Men?: string | null
  Auto_data_1a_part?: string | boolean | null
  Data_enviament_Forms?: string | null
  Comensals?: number | string | null
  Data_2a_Part_Tast?: string | null
  Auto_Data_2a_Part?: string | boolean | null
  Hora?: string | null
  Observacions_2a_Part?: string | null
  Comensals_2a?: number | string | null
  DataInici: string | null
  DataFi: string | null
  HoraInici?: string | null
  HoraFi?: string | null
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
