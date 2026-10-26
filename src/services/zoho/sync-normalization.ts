import { extractZohoClientNameFromDeal } from '@/services/spaces/zohoClients'
import type { NormalizedDeal, ZohoDeal, ZohoNamedValue } from '@/services/zoho/sync-types'
import { menuTastingIsoDay } from '@/lib/calendar/menuTastingOccurrences'

export type StageCollection = 'groc' | 'taronja' | 'verd'

export function businessLineFromPipeline(
  raw: ZohoDeal['Pipeline']
): string | null {
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : raw && typeof raw === 'object'
        ? String(raw.name || '').trim()
        : ''
  if (!value) return null

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (normalized.includes('boda') || normalized.includes('casament')) {
    return 'Casaments'
  }
  if (normalized.includes('corporativ') || normalized.includes('empresa')) {
    return 'Empresa'
  }
  if (
    normalized.includes('foodlovers') ||
    normalized.includes('food lovers') ||
    normalized.includes('fires') ||
    normalized.includes('festivals')
  ) {
    return 'Foodlovers'
  }
  if (normalized.includes('restaurant')) return 'Grups Restaurants'
  if (normalized.includes('comida preparada') || normalized.includes('menjar preparat')) {
    return 'Menjar Preparat'
  }
  if (normalized.includes('agenda')) return 'Agenda'

  return value
}

export type FincaMatch = {
  id: string
  code: string
  ln?: string
} | null

type NormalizeZohoDealsDeps = {
  parseZohoDate: (raw?: string | null) => string | null
  parseZohoTime: (raw?: string | null) => string | null
  getLN: (ownerId?: string) => Promise<string>
  lnForMartaGranatoCommercial: (ln: string, commercial?: string | null) => string
  stripCode: (value: string) => string
  normalizeIncomingZohoCode: (value?: string | null) => string | null
  extractCodeFromName: (value: string) => string | null
  isBadCode: (code?: string | null) => boolean
  hasRestaurantKeyword: (value: string) => boolean
  findFincaForUbicacio: (
    ubicacions: (string | null | undefined)[],
    lnHint?: string
  ) => FincaMatch
  extractZohoDisplayName: (
    value?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
  ) => string | null
  operativeResponsableFromZohoDeal: (deal: ZohoDeal & Record<string, unknown>) => string
  fincaLnForDeal: (
    ln: string,
    commercial: string | null | undefined,
    forceGrupsRestaurants: boolean,
    fincaLN?: string
  ) => string
}

export function classifyStage(stage: string): StageCollection | null {
  const s = stage.toLowerCase()
  const compact = s.replace(/[\s_-]+/g, '')
  if (s.includes('calentet') || compact.includes('prereserva')) return 'taronja'
  if (s.includes('pagament') || s.includes('cerrada ganada') || s.includes('rq')) {
    return 'verd'
  }
  if (
    s.includes('pendent') ||
    s.includes('proposta') ||
    s.includes('propuesta') ||
    s.includes('pressupost') ||
    s.includes('seguiment 1') ||
    s.includes('seguiment 2')
  ) {
    return 'groc'
  }

  return null
}

export function isLostZohoStage(stage: string): boolean {
  const normalized = String(stage || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return (
    /\bperdid(?:a|o|as|os)\b/.test(normalized) ||
    /\bperdu(?:t|da|ts|des)\b/.test(normalized)
  )
}

export function resolveZohoEndTime(
  deal: Pick<ZohoDeal, 'Hora_Fi_Boda' | 'Hora_Fi_Evento'>,
  parseZohoTime: (raw?: string | null) => string | null
): string | null {
  return (
    parseZohoTime(deal.Hora_Fi_Boda) ||
    parseZohoTime(deal.Hora_Fi_Evento)
  )
}

function stagePresentation(group: StageCollection) {
  if (group === 'taronja') {
    return {
      Color: 'border-orange-300 bg-orange-50 text-orange-800',
      StageDot: 'bg-orange-400',
      StageGroup: 'Prereserva / Calentet',
    }
  }

  if (group === 'groc') {
    return {
      Color: 'border-yellow-300 bg-yellow-50 text-yellow-800',
      StageDot: 'bg-yellow-400',
      StageGroup: 'Pressupost / Seguiment / Proposta / Pendent',
    }
  }

  return {
    Color: 'border-green-300 bg-green-50 text-green-800',
    StageDot: 'bg-green-500',
    StageGroup: 'Confirmat',
  }
}

export async function normalizeZohoDeals(
  deals: ZohoDeal[],
  deps: NormalizeZohoDealsDeps
): Promise<NormalizedDeal[]> {
  const normalized: NormalizedDeal[] = []

  for (const deal of deals) {
    const group = classifyStage(deal.Stage)
    if (!group) continue

    const dateISO =
      deps.parseZohoDate(deal.Fecha_del_evento) ||
      deps.parseZohoDate(deal.Fecha_y_hora_del_evento)
    const hora =
      deps.parseZohoTime(deal.Hora_esdeveniment) ||
      deps.parseZohoTime(deal.Fecha_y_hora_del_evento)
    const horaFi = resolveZohoEndTime(deal, deps.parseZohoTime)

    let dataFiISO = dateISO
    const duracio = Number(deal.Duraci_n_del_evento ?? 1)
    if (dateISO && !Number.isNaN(duracio) && duracio > 1) {
      const fi = new Date(dateISO)
      fi.setDate(fi.getDate() + (duracio - 1))
      dataFiISO = fi.toISOString().slice(0, 10)
    }

    const ownerCommercial = deal.Owner?.name?.trim() || '-'
    const pipelineName =
      typeof deal.Pipeline === 'string'
        ? deal.Pipeline.trim()
        : String(deal.Pipeline?.name || '').trim()
    const pipelineLn = businessLineFromPipeline(deal.Pipeline)
    let ln = pipelineLn || await deps.getLN(deal.Owner?.id)
    ln = deps.lnForMartaGranatoCommercial(ln, ownerCommercial)

    const ubicacions = [...(deal.Espai_2 || []), ...(deal.Finca_2 || [])]
    const ubicacioRaw = deal.Finca_2?.[0] || deal.Espai_2?.[0] || ''
    const ubicacioLabel = deps.stripCode(ubicacioRaw).trim()
    const ubicacioCodeRaw = deps.normalizeIncomingZohoCode(
      deps.extractCodeFromName(ubicacioRaw)
    )
    const ubicacioCode =
      ubicacioCodeRaw && !deps.isBadCode(ubicacioCodeRaw) ? ubicacioCodeRaw : null
    const forceGrupsRestaurants =
      (ubicacioCode || '').startsWith('CCR') ||
      ubicacions.some((item) => deps.hasRestaurantKeyword(String(item || ''))) ||
      deps.hasRestaurantKeyword(ubicacioRaw)

    // Regla operativa històrica: els centres CCR/restaurants pertanyen a
    // Grups Restaurants encara que Zoho informi una altra Pipeline.
    if (forceGrupsRestaurants) {
      ln = 'Grups Restaurants'
    }

    const comercial = ownerCommercial
    ln = deps.lnForMartaGranatoCommercial(ln, comercial)

    const fincaMatch = deps.findFincaForUbicacio(ubicacions, ln)
    const comercialIntern = deps.extractZohoDisplayName(deal.Comercial_Interna) || ''
    const responsableZoho = deps.operativeResponsableFromZohoDeal(
      deal as ZohoDeal & Record<string, unknown>
    )
    const nomClient = extractZohoClientNameFromDeal(deal)
    const presentation = stagePresentation(group)

    normalized.push({
      idZoho: String(deal.id),
      NomEvent: deal.Deal_Name || 'Sense nom',
      NomClient: nomClient || undefined,
      Stage: deal.Stage,
      Pipeline: pipelineName || null,
      LN: ln,
      Servei: deal.Servicio_texto || deal.Men_texto || '',
      Comercial: comercial,
      ComercialIntern: comercialIntern,
      Responsable: responsableZoho,
      Data_i_hora: deal.Data_i_hora || null,
      Ubicaci: deal.Ubicaci || null,
      Ubicaci_1a_Part: deal.Ubicaci_1a_Part || null,
      Ubicaci_2a_part: deal.Ubicaci_2a_part || null,
      Pax: deal.Pax ?? null,
      confirmar_prova: deal.confirmar_prova ?? null,
      MenuTasting1Date:
        menuTastingIsoDay(deal.Data_1_Prova_Men) ||
        menuTastingIsoDay(deal.Auto_data_1a_part),
      MenuTasting2Date:
        menuTastingIsoDay(deal.Data_2a_Part_Tast) ||
        menuTastingIsoDay(deal.Auto_Data_2a_Part),
      MenuTastingCompanyDate: menuTastingIsoDay(deal.Data_i_hora),
      Data_1_Prova_Men: deal.Data_1_Prova_Men || null,
      Auto_data_1a_part: deal.Auto_data_1a_part ?? null,
      Otros: deal.Otros ?? null,
      Data_enviament_Forms: deal.Data_enviament_Forms ?? null,
      Formulari_Enviat: deal.Formulari_Enviat ?? null,
      Formulari_Respost1: deal.Formulari_Respost1 ?? null,
      Comensals: deal.Comensals ?? null,
      Al_l_rgies: deal.Al_l_rgies ?? null,
      Data_2a_Part_Tast: deal.Data_2a_Part_Tast || null,
      Auto_Data_2a_Part: deal.Auto_Data_2a_Part ?? null,
      Hora: deal.Hora || null,
      Otros_2a_Part: deal.Otros_2a_Part ?? null,
      Enviament_Forms: deal.Enviament_Forms ?? null,
      Forms_Enviat: deal.Forms_Enviat ?? null,
      Al_l_rgies_2a_Part: deal.Al_l_rgies_2a_Part ?? null,
      Observacions_2a_Part: deal.Observacions_2a_Part ?? null,
      Comensals_2a: deal.Comensals_2a ?? null,
      Deco: deal.Deco ?? null,
      Postres: deal.Postres ?? null,
      Celler_Vi_Blanc: deal.Celler_Vi_Blanc ?? null,
      Celler_Vi_Negre: deal.Celler_Vi_Negre ?? null,
      Celler_Cava: deal.Celler_Cava ?? null,
      Celler_Extra: deal.Celler_Extra ?? null,
      DataInici: dateISO,
      DataFi: dataFiISO,
      ObservacionsZoho: deal.Description || deal.Observacions || null,
      HoraInici: hora,
      HoraFi: horaFi,
      NumPax:
        deal.N_mero_de_invitados ||
        deal.N_mero_de_personas_del_evento ||
        null,
      Ubicacio: ubicacioLabel,
      FincaId: fincaMatch?.id,
      FincaCode: fincaMatch?.code,
      FincaLN: deps.fincaLnForDeal(
        ln,
        comercial,
        forceGrupsRestaurants,
        fincaMatch?.ln
      ),
      UbicacioCode: ubicacioCode,
      Color: presentation.Color,
      StageDot: presentation.StageDot,
      StageGroup: presentation.StageGroup,
      origen: 'zoho',
      editable: group === 'verd',
      updatedAt: new Date().toISOString(),
      collection: group,
      DataPeticio: deal.Fecha_de_petici_n || null,
      PreuMenu: deal.Precio_Total || null,
      Import: deal.Amount || null,
    })
  }

  return normalized
}
