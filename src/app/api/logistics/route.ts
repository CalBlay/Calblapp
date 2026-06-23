import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { subDays, isMonday } from 'date-fns'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { listWarehousePrepTasksForUser } from '@/lib/logistics/warehousePrepTasks.server'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador'])

type RawEvent = {
  code?: string
  Code?: string
  C_digo?: string
  codi?: string
  Codi?: string
  NomEvent?: string
  eventName?: string
  Ubicacio?: string
  finca?: string
  NumPax?: number
  numPax?: number
  Pax?: number
  DataInici?: unknown
  HoraInici?: string
  PreparacioData?: string
  PreparacioHora?: string
  PreparacioFeta?: boolean
  PreparacioFetaPerUserId?: string
  PreparacioFetaPerNom?: string
  PreparacioFetaAt?: string
}

type LogisticsEvent = {
  id: string
  EventCode: string
  NomEvent: string
  Ubicacio: string
  NumPax: number
  DataInici: string
  DataVisual: string
  HoraInici: string
  PreparacioData: string
  PreparacioHora: string
  PreparacioFeta: boolean
  PreparacioFetaPerUserId: string
  PreparacioFetaPerNom: string
  PreparacioFetaAt: string
}

const isIsoDate = (value?: string | null) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())

const dateToIso = (value: Date) => value.toISOString().slice(0, 10)

const parseDateOnly = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatEventName = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.split('/')[0].trim()
}

const firstEventCode = (event: RawEvent) => {
  const candidates = [event.code, event.Code, event.C_digo, event.codi, event.Codi]
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value) return value
  }
  return ''
}

const normalizeDataInici = (value: unknown) => {
  if (!value) return ''

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (isIsoDate(trimmed)) return trimmed
    const parsed = new Date(trimmed.replace(' ', 'T'))
    return Number.isNaN(parsed.getTime()) ? '' : dateToIso(parsed)
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : dateToIso(value)
  }

  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(parsed.getTime()) ? '' : dateToIso(parsed)
  }

  return ''
}

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  const userId = String(token.sub || '').trim()
  if (!userId) {
    return { error: NextResponse.json({ ok: false, error: 'Usuari no vàlid' }, { status: 401 }) }
  }

  return { role, userId }
}

async function queryByStringRange(start: string, end: string) {
  return db
    .collection('stage_verd')
    .where('DataInici', '>=', start)
    .where('DataInici', '<=', end)
    .get()
}

async function queryByDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T23:59:59.999Z`)

  return db
    .collection('stage_verd')
    .where('DataInici', '>=', startDate)
    .where('DataInici', '<=', endDate)
    .get()
}

async function queryByPreparationRange(start: string, end: string) {
  return db
    .collection('stage_verd')
    .where('PreparacioData', '>=', start)
    .where('PreparacioData', '<=', end)
    .get()
}

async function loadStageVerdRange(start: string, end: string, filterByPreparation: boolean) {
  if (filterByPreparation) {
    const preparationSnap = await Promise.allSettled([queryByPreparationRange(start, end)])
    const preparationDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

    if (preparationSnap[0].status === 'fulfilled') {
      preparationSnap[0].value.forEach((doc) => preparationDocs.set(doc.id, doc))
    }

    if (preparationDocs.size > 0) return Array.from(preparationDocs.values())

    const fullSnap = await db.collection('stage_verd').get()
    return fullSnap.docs.filter((doc) => {
      const ev = doc.data() as RawEvent
      return isPreparationDateInRange(ev.PreparacioData, start, end)
    })
  }

  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()
  const [stringSnap, dateSnap] = await Promise.allSettled([
    queryByStringRange(start, end),
    queryByDateRange(start, end),
  ])

  if (stringSnap.status === 'fulfilled') {
    stringSnap.value.forEach((doc) => docs.set(doc.id, doc))
  }

  if (dateSnap.status === 'fulfilled') {
    dateSnap.value.forEach((doc) => docs.set(doc.id, doc))
  }

  if (docs.size > 0) return Array.from(docs.values())

  const fullSnap = await db.collection('stage_verd').get()
  return fullSnap.docs.filter((doc) => {
    const ev = doc.data() as RawEvent
    const iso = normalizeDataInici(ev.DataInici)
    return Boolean(iso) && iso >= start && iso <= end
  })
}

function isPreparationDateInRange(preparacioData: string | undefined, start: string, end: string) {
  const value = String(preparacioData ?? '').trim()
  return Boolean(value) && isIsoDate(value) && value >= start && value <= end
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const filterByPreparation = searchParams.get('filterByPreparation') === '1'

    if (!isIsoDate(start) || !isIsoDate(end)) {
      return NextResponse.json(
        { ok: false, error: 'Cal indicar start i end en format YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const startStr = String(start)
    const endStr = String(end)
    const docs = await loadStageVerdRange(startStr, endStr, filterByPreparation)
    const events: LogisticsEvent[] = []

    docs.forEach((doc) => {
      const ev = doc.data() as RawEvent
      const eventCode = firstEventCode(ev)
      if (!eventCode) return

      const dataIniciIso = normalizeDataInici(ev.DataInici)
      const preparationMatches = isPreparationDateInRange(ev.PreparacioData, startStr, endStr)

      if (filterByPreparation) {
        if (!preparationMatches) return
      } else if (!dataIniciIso || dataIniciIso < startStr || dataIniciIso > endStr) {
        return
      }

      if (!dataIniciIso) return

      const dataInici = parseDateOnly(dataIniciIso)
      if (!dataInici) return

      const horaInici = String(ev.HoraInici || '')
      let dataVisual = dataInici
      if (isMonday(dataInici) && horaInici && horaInici < '10:00') {
        dataVisual = subDays(dataInici, 7)
      }

      events.push({
        id: doc.id,
        EventCode: eventCode,
        NomEvent: formatEventName(ev.NomEvent ?? ev.eventName ?? ''),
        Ubicacio: ev.Ubicacio ?? ev.finca ?? '',
        NumPax: Number(ev.NumPax ?? ev.numPax ?? ev.Pax ?? 0) || 0,
        DataInici: dataIniciIso,
        DataVisual: dateToIso(dataVisual),
        HoraInici: horaInici,
        PreparacioData: ev.PreparacioData ?? '',
        PreparacioHora: ev.PreparacioHora ?? '',
        PreparacioFeta: Boolean(ev.PreparacioFeta),
        PreparacioFetaPerUserId: String(ev.PreparacioFetaPerUserId ?? '').trim(),
        PreparacioFetaPerNom: String(ev.PreparacioFetaPerNom ?? '').trim(),
        PreparacioFetaAt: String(ev.PreparacioFetaAt ?? '').trim(),
      })
    })

    events.sort((a, b) => {
      if (a.DataInici !== b.DataInici) return a.DataInici.localeCompare(b.DataInici)
      return (a.HoraInici || '').localeCompare(b.HoraInici || '')
    })

    const warehouseTasks = await listWarehousePrepTasksForUser({
      userId: auth.userId,
      role: auth.role,
      rangeStart: startStr,
      rangeEnd: endStr,
    })

    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
      warehouseTasks,
    })
  } catch (err) {
    console.error('Error /api/logistics:', err)
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    )
  }
}
