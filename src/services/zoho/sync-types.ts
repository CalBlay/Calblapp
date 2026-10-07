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
  /** Camp Zoho «Hora esdeveniment» (hora sola, p.ex. "12:00 h"). */
  Hora_esdeveniment?: string | null
  Hora_Fi_Boda?: string | null
  Hora_Fi_Evento?: string | null
  Duraci_n_del_evento?: number | string | null
  C_digo?: string | null
  Owner: ZohoOwner
  Responsable?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Comercial_Interna?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  Data_1_Prova_Men?: string | null
  Auto_data_1a_part?: string | boolean | null
  Otros?: string | null
  Data_enviament_Forms?: string | null
  Formulari_Enviat?: string | boolean | null
  Formulari_Respost1?: string | boolean | null
  Comensals?: number | string | null
  Al_l_rgies?: string | null
  Data_2a_Part_Tast?: string | null
  Auto_Data_2a_Part?: string | boolean | null
  Hora?: string | null
  Otros_2a_Part?: string | null
  Enviament_Forms?: string | null
  Forms_Enviat?: string | boolean | null
  Al_l_rgies_2a_Part?: string | null
  Observacions_2a_Part?: string | null
  Comensals_2a?: number | string | null
  Deco?: string | boolean | null
  Postres?: string | null
  Celler_Vi_Blanc?: string | null
  Celler_Vi_Negre?: string | null
  Celler_Cava?: string | null
  Celler_Extra?: string | null
  Fecha_de_petici_n?: string | null
  Precio_Total?: number | string | null
  Amount?: number | string | null
  Observacions?: string | null
  Description?: string | null
  Fulla_d_enc_rrec?: unknown
  Full_de_Tast?: unknown
  Full_de_modificacions?: unknown
  Full_modificacions?: unknown
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
  Data_1_Prova_Men?: string | null
  Auto_data_1a_part?: string | boolean | null
  Otros?: string | null
  Data_enviament_Forms?: string | null
  Formulari_Enviat?: string | boolean | null
  Formulari_Respost1?: string | boolean | null
  Comensals?: number | string | null
  Al_l_rgies?: string | null
  Data_2a_Part_Tast?: string | null
  Auto_Data_2a_Part?: string | boolean | null
  Hora?: string | null
  Otros_2a_Part?: string | null
  Enviament_Forms?: string | null
  Forms_Enviat?: string | boolean | null
  Al_l_rgies_2a_Part?: string | null
  Observacions_2a_Part?: string | null
  Comensals_2a?: number | string | null
  Deco?: string | boolean | null
  Postres?: string | null
  Celler_Vi_Blanc?: string | null
  Celler_Vi_Negre?: string | null
  Celler_Cava?: string | null
  Celler_Extra?: string | null
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
