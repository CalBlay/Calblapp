import { extractZohoClientNameFromDeal } from '@/services/spaces/zohoClients'
import type { NormalizedDeal, ZohoDeal, ZohoNamedValue } from '@/services/zoho/sync-types'

export type StageCollection = 'groc' | 'taronja' | 'verd'

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
  if (s.includes('calentet')) return 'taronja'
  if (s.includes('pagament') || s.includes('cerrada ganada') || s.includes('rq')) {
    return 'verd'
  }
  if (
    s.includes('pendent') ||
    s.includes('prereserva') ||
    s.includes('proposta') ||
    s.includes('propuesta') ||
    s.includes('pressupost enviat')
  ) {
    return 'groc'
  }

  return null
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
      StageGroup: 'Pressupost / Proposta / Pendent',
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
    const hora = deps.parseZohoTime(deal.Fecha_y_hora_del_evento)

    let dataFiISO = dateISO
    const duracio = Number(deal.Duraci_n_del_evento ?? 1)
    if (dateISO && !Number.isNaN(duracio) && duracio > 1) {
      const fi = new Date(dateISO)
      fi.setDate(fi.getDate() + (duracio - 1))
      dataFiISO = fi.toISOString().slice(0, 10)
    }

    const ownerCommercial = deal.Owner?.name?.trim() || '-'
    let ln = await deps.getLN(deal.Owner?.id)
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
      LN: ln,
      Servei: deal.Servicio_texto || deal.Men_texto || '',
      Comercial: comercial,
      ComercialIntern: comercialIntern,
      Responsable: responsableZoho,
      DataInici: dateISO,
      DataFi: dataFiISO,
      ObservacionsZoho: deal.Description || deal.Observacions || null,
      HoraInici: hora,
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
