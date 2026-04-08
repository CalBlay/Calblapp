import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'

const padHhMm = (raw: unknown): string | null => {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(s) ? s : null
}

export async function computeCalendarEventsInRange(
  start: string,
  end: string
): Promise<{ events: Record<string, unknown>[] }> {
  if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
    return { events: [] }
  }

  const collections = ['stage_verd', 'stage_taronja']
  const base: Record<string, unknown>[] = []
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${end}T23:59:59.999Z`).getTime()

  for (const coll of collections) {
    const docs = await queryStageCollectionDocsInDateRange(db, coll, start, end)

    for (const doc of docs) {
      const d = doc.data() as FirebaseFirestore.DocumentData

      const dateStart =
        typeof d.DataInici === 'string' ? d.DataInici.slice(0, 10) : null
      const dateEnd =
        typeof d.DataFi === 'string' && d.DataFi.trim()
          ? d.DataFi.slice(0, 10)
          : dateStart

      if (!dateStart) continue

      const tStart =
        padHhMm(d.HoraInici ?? d.horaInici ?? d.Hora ?? d.hora) || '12:00'
      const hasExplicitStart = Boolean(
        padHhMm(d.HoraInici ?? d.horaInici ?? d.Hora ?? d.hora)
      )
      const tEnd =
        padHhMm(d.HoraFi ?? d.horaFi) ||
        (hasExplicitStart ? '23:59' : '12:00')

      const startISO = `${dateStart}T${tStart}:00`
      const endISO = `${dateEnd}T${tEnd}:00`

      const eventStartMs = new Date(startISO).getTime()
      const eventEndMs = new Date(endISO || startISO).getTime()
      if (Number.isNaN(eventStartMs) || Number.isNaN(eventEndMs)) continue
      if (eventEndMs < startMs || eventStartMs > endMs) continue

      const rawSummary =
        typeof d.NomEvent === 'string' ? d.NomEvent : '(Sense titol)'

      const summary = rawSummary.split('/')[0].trim()

      const location = (d.Ubicacio ?? '')
        .split('(')[0]
        .split('/')[0]
        .replace(/^ZZ\s*/i, '')
        .trim()

      const lnValue = typeof d.LN === 'string' ? d.LN : 'Altres'

      const fileFields: Record<string, string> = {}
      Object.entries(d).forEach(([k, v]) => {
        if (
          k.toLowerCase().startsWith('file') &&
          typeof v === 'string' &&
          v.length > 0
        ) {
          fileFields[k] = v
        }
      })

      base.push({
        id: doc.id,
        ...fileFields,

        summary,
        start: startISO,
        end: endISO,
        day: dateStart || d.DataInici || '',

        location,
        lnKey: lnValue.toLowerCase(),
        lnLabel: lnValue,
        collection: coll,

        code: d.code || d.Code || d.codi || '',
        codeConfirmed:
          typeof d.codeConfirmed === 'boolean' ? d.codeConfirmed : undefined,
        codeMatchScore:
          typeof d.codeMatchScore === 'number' ? d.codeMatchScore : undefined,

        comercial: d.Comercial || d.comercial || '',
        servei: d.Servei || d.servei || '',

        numPax:
          d.NumPax ??
          d.numPax ??
          d.PAX ??
          null,

        ObservacionsZoho:
          d.ObservacionsZoho ??
          d.observacionsZoho ??
          d.Observacions ??
          d.observacions ??
          '',

        stageGroup: d.StageGroup || d.stageGroup || '',
        HoraInici: d.HoraInici || d.horaInici || '',
        HoraFi: d.HoraFi || d.horaFi || '',
      })
    }
  }

  return { events: base }
}
