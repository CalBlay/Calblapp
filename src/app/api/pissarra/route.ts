import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador', 'comercial', 'observer', 'usuari'])

const normalizeLabel = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const isPhaseActive = (status?: string | null) => {
  const normalized = normalizeLabel(status)
  if (!normalized) return true
  return ['confirmed', 'draft', 'pending', 'event'].includes(normalized)
}

const normalizeDay = (value?: string | null) => {
  if (!value) return null
  const cleaned = String(value).trim()
  const parsed = new Date(cleaned)
  if (!Number.isNaN(parsed.getTime())) return format(parsed, 'yyyy-MM-dd')
  const match = cleaned.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

const getDayRange = (startDay?: string | null, endDay?: string | null) => {
  const normalizedStart = normalizeDay(startDay)
  const normalizedEnd = normalizeDay(endDay) || normalizedStart
  if (!normalizedStart || !normalizedEnd) return []

  try {
    const start = parseISO(normalizedStart)
    const end = parseISO(normalizedEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [normalizedStart]

    const totalDays = Math.max(differenceInCalendarDays(end, start), 0)
    return Array.from({ length: totalDays + 1 }, (_, index) =>
      format(addDays(start, index), 'yyyy-MM-dd')
    )
  } catch {
    return [normalizedStart]
  }
}

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }

  const role = normalizeRole(String((token as any)?.role || 'treballador'))
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return { token, role }
}

async function loadStageVerdDocsInRange(start: string, end: string) {
  const col = db.collection('stage_verd')
  const byId = new Map<string, any>()

  for (const field of ['DataInici', 'startDate', 'date', 'dataInici', 'DataInicio']) {
    try {
      const snap = await col.where(field, '>=', start).where(field, '<=', end).get()
      snap.docs.forEach((doc) => byId.set(doc.id, doc))
    } catch {
      // ignore non-indexed/missing field query
    }
  }

  if (byId.size > 0) return Array.from(byId.values())
  const full = await col.get()
  return full.docs
}

type QuadrantCandidate = {
  normalizedCandidate: string
  phaseLabel: string
  phaseDate?: string
  responsableName?: string
}

async function loadQuadrantsIndex(start: string, end: string) {
  const col = db.collection('quadrantsServeis')
  let snap
  try {
    snap = await col.where('startDate', '>=', start).where('startDate', '<=', end).get()
  } catch {
    snap = await col.get()
  }

  const byEventId = new Map<string, QuadrantCandidate[]>()
  const byCode = new Map<string, QuadrantCandidate[]>()

  snap.docs.forEach((doc: any) => {
    const data = doc.data() as any
    if (!isPhaseActive(data?.status)) return

    const candidate =
      data?.phaseLabel ||
      data?.phaseType ||
      data?.phaseKey ||
      data?.phase ||
      data?.fase ||
      data?.phaseName ||
      data?.label ||
      ''

    const normalizedCandidate = normalizeLabel(candidate)
    if (!normalizedCandidate) return

    const dateValue =
      data?.phaseDate || data?.date || data?.startDate || data?.phaseStart || data?.phase_day || ''

    const info: QuadrantCandidate = {
      normalizedCandidate,
      phaseLabel: String(candidate).trim(),
      phaseDate: normalizeDay(dateValue) || (dateValue ? String(dateValue) : undefined),
      responsableName: data?.responsableName || data?.responsable?.name,
    }

    const eventId = String(data?.eventId || '').trim()
    const code = String(data?.code || '').trim()

    if (eventId) byEventId.set(eventId, [...(byEventId.get(eventId) || []), info])
    if (code) byCode.set(code, [...(byCode.get(code) || []), info])
  })

  return { byEventId, byCode }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten parametres start i end' }, { status: 400 })
    }

    const [stageDocs, quadrants] = await Promise.all([
      loadStageVerdDocsInRange(start, end),
      loadQuadrantsIndex(start, end),
    ])

    const events: any[] = []

    for (const doc of stageDocs) {
      const d = doc.data() as any
      if (!d.code) continue

      const rawStart =
        d.startDate || d.date || d.start || d.DataInici || d.dataInici || d.DataInicio || d.start_time || null
      const rawEnd =
        d.endDate || d.DataFi || d.dataFi || d.DataFinal || d.end || d.end_time || rawStart

      const startDate = normalizeDay(rawStart)
      if (!startDate) continue
      const dayRange = getDayRange(rawStart, rawEnd).filter((day) => day >= start && day <= end)
      if (dayRange.length === 0) continue

      let responsableName: string | undefined
      let phaseLabel: string | undefined
      let phaseDate: string | undefined

      const code = String(d.code || '').trim()
      const candidates = [
        ...(quadrants.byEventId.get(doc.id) || []),
        ...(code ? quadrants.byCode.get(code) || [] : []),
      ]

      if (candidates.length > 0) {
        const eventCandidate = candidates.find((info) => info.normalizedCandidate === 'event')
        const isMuntatge = (value: string) => ['muntatge', 'montatge', 'montaje'].some((w) => value.includes(w))
        const muntatgeCandidate = candidates.find((info) => isMuntatge(info.normalizedCandidate))

        if (eventCandidate?.responsableName) responsableName = eventCandidate.responsableName
        if (muntatgeCandidate) {
          phaseLabel = muntatgeCandidate.phaseLabel
          phaseDate = muntatgeCandidate.phaseDate
        }
      }

      dayRange.forEach((day) => {
        events.push({
          id: `${doc.id}__${day}`,
          code,
          LN: d.LN || d.ln || d.lineaNegoci || '',
          eventName: d.eventName || d.NomEvent || d.title || '',
          startDate: day,
          startTime: d.startTime || d.HoraInici || '',
          location: d.location || d.Ubicacio || '',
          pax: Number(d.pax || d.NumPax || 0),
          servei: d.servei || d.Servei || '',
          comercial: d.comercial || d.Comercial || '',
          responsableName,
          phaseLabel,
          phaseDate,
        })
      })
    }

    return NextResponse.json({ items: events }, { status: 200 })
  } catch (err) {
    console.error('[api/pissarra] GET error', err)
    return NextResponse.json({ error: 'Error intern del servidor' }, { status: 500 })
  }
}
