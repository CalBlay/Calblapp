import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

type EventRecord = {
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

function pickTime(value: string | undefined, fallback: string) {
  const trimmed = String(value || '').trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : fallback
}

export async function GET(
  _req: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params

  try {
    const snap = await db.collection('stage_verd').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'No trobat' }, { status: 404 })
    }

    const data = (snap.data() || {}) as EventRecord
    const startDay = String(data.DataInici || '').trim()
    const endDay = String(data.DataFi || data.DataInici || '').trim()
    const startTime = pickTime(
      data.HoraInici ?? data.horaInici ?? data.Hora ?? data.hora,
      '12:00'
    )
    const endTime = pickTime(data.HoraFi ?? data.horaFi, startTime)
    const summary = String(data.NomEvent || '(Sense titol)').split('/')[0].trim()

    return NextResponse.json(
      {
        id: snap.id,
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
        attachments: [],
        code: String(data.code || data.Code || data.C_digo || '').trim(),
        Comercial: String(data.Comercial || data.comercial || '').trim(),
        ComercialIntern: String(
          data.ComercialIntern || data.comercialIntern || data.Comercial_Interna || ''
        ).trim(),
        Responsable: String(data.Responsable || data.responsable || '').trim(),
        Servei: String(data.Servei || data.servei || '').trim(),
        LN: String(data.LN || '').trim(),
        source: 'firestore',
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    console.error('[app/api/events/[id]] error:', err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
