export type StageVerdEventRecord = {
  NomEvent?: string
  DataInici?: string
  DataFi?: string
  HoraInici?: string
  horaInici?: string
  Hora?: string
  hora?: string
  HoraFi?: string
  horaFi?: string
  Ubicacio?: string
  code?: string
  Code?: string
  C_digo?: string
  Comercial?: string
  comercial?: string
  ComercialIntern?: string
  comercialIntern?: string
  Comercial_Interna?: string
  Responsable?: string
  responsable?: string
  Servei?: string
  servei?: string
  LN?: string
}

export function pickEventClockTime(value: string | undefined, fallback: string) {
  const trimmed = String(value || '').trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : fallback
}

/** Public JSON shape for GET /api/events/[id] (authenticated callers only). */
export function buildStageVerdEventByIdResponse(
  id: string,
  data: StageVerdEventRecord
) {
  const startDay = String(data.DataInici || '').trim()
  const endDay = String(data.DataFi || data.DataInici || '').trim()
  const startTime = pickEventClockTime(
    data.HoraInici ?? data.horaInici ?? data.Hora ?? data.hora,
    '12:00'
  )
  const endTime = pickEventClockTime(data.HoraFi ?? data.horaFi, startTime)
  const summary = String(data.NomEvent || '(Sense titol)').split('/')[0].trim()

  return {
    id,
    summary,
    description: null,
    location: String(data.Ubicacio || '').trim(),
    start: {
      dateTime: startDay ? `${startDay}T${startTime}:00` : undefined,
      date: startDay || undefined,
    },
    end: {
      dateTime: endDay ? `${endDay}T${endTime}:00` : undefined,
      date: endDay || undefined,
    },
    attachments: [] as [],
    code: String(data.code || data.Code || data.C_digo || '').trim(),
    Comercial: String(data.Comercial || data.comercial || '').trim(),
    ComercialIntern: String(
      data.ComercialIntern || data.comercialIntern || data.Comercial_Interna || ''
    ).trim(),
    Responsable: String(data.Responsable || data.responsable || '').trim(),
    Servei: String(data.Servei || data.servei || '').trim(),
    LN: String(data.LN || '').trim(),
    source: 'firestore' as const,
  }
}
