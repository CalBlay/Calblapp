import { useMemo } from 'react'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { FiltersState } from '@/components/layout/FiltersBar'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type { QuadrantStatus, UnifiedEvent } from '@/app/menu/quadrants/types'

interface UseQuadrantsPageDataParams {
  events: QuadrantEvent[]
  quadrants: QuadrantDraft[]
  filters: FiltersState
}

type QuadrantEventLike = QuadrantEvent & {
  eventId?: string
  name?: string
  ln?: string | null
  lnLabel?: string | null
}

type QuadrantPerson = {
  id?: string | null
  name?: string | null
  meetingPoint?: string | null
  plate?: string | null
  vehicleType?: string | null
  arrivalTime?: string | null
}

type QuadrantGroup = {
  id?: string | null
  serviceDate?: string | null
  meetingPoint?: string | null
  startTime?: string | null
  endTime?: string | null
  workers?: number | null
  drivers?: number | null
  needsDriver?: boolean | null
  driverId?: string | null
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

type QuadrantDraft = {
  id?: string
  eventId?: string
  eventCode?: string
  code?: string
  eventName?: string
  eventDate?: string
  eventStartDate?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  status?: string
  phaseType?: string
  phaseLabel?: string
  phaseDate?: string
  department?: string
  location?: unknown
  ln?: unknown
  service?: unknown
  commercial?: string | null
  numPax?: number | null
  responsableId?: string | null
  responsableName?: string | null
  totalWorkers?: number | null
  numDrivers?: number | null
  meetingPoint?: string | null
  groups?: QuadrantGroup[]
  conductors?: QuadrantPerson[]
  treballadors?: QuadrantPerson[]
  vestimentModel?: string | null
}

export interface QuadrantsPageCounts {
  pending: number
  draft: number
  confirmed: number
}

export interface UseQuadrantsPageDataResult {
  eventsWithStatus: UnifiedEvent[]
  counts: QuadrantsPageCounts
  filteredEvents: UnifiedEvent[]
  grouped: [string, UnifiedEvent[]][]
  phasesByEventId: Record<string, Set<string>>
}

const normalize = (value?: string) =>
  (value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()

const normalizeDepartment = (value?: unknown) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const cleanText = (value?: unknown) => {
  const s = (value || '').toString().trim()
  if (!s) return ''
  const bad = new Set([
    '--',
    '-',
    'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â',
    'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ',
    'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ',
    'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â',
  ])
  return bad.has(s) ? '' : s
}

const getEventKey = (item: QuadrantDraft) =>
  String(item?.id || item?.eventId || item?.eventCode || item?.code || '').trim()

const normalizeNameKey = (value?: unknown) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const timeToMinutes = (value?: string | null) => {
  if (!value) return null
  const [hours, minutes] = String(value).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

const hhMmFromFirestore = (raw?: unknown): string | null => {
  if (raw == null) return null
  const s = String(raw).trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(s) ? s : null
}

const pickEdgeTime = (
  values: Array<string | undefined | null>,
  mode: 'min' | 'max'
) => {
  let bestText: string | undefined
  let bestValue: number | null = null
  values.forEach((candidate) => {
    const minutes = timeToMinutes(candidate)
    if (minutes === null || !candidate) return
    if (bestValue === null) {
      bestText = candidate
      bestValue = minutes
      return
    }
    if (mode === 'min' ? minutes < bestValue : minutes > bestValue) {
      bestText = candidate
      bestValue = minutes
    }
  })
  return bestText
}

const mergePeople = (groups: QuadrantPerson[][]) => {
  const merged: QuadrantPerson[] = []
  const seen = new Set<string>()
  groups.flat().forEach((person) => {
    if (!person?.name) return
    const key = `${normalizeNameKey(person.name)}__${normalizeNameKey(person.meetingPoint)}`
    if (seen.has(key)) return
    seen.add(key)
    merged.push(person)
  })
  return merged
}

const isQuadrantDraft = (value: unknown): value is QuadrantDraft =>
  typeof value === 'object' && value !== null

const mergeServiceEntries = (items: UnifiedEvent[]): UnifiedEvent[] => {
  const grouped = new Map<string, UnifiedEvent[]>()

  items.forEach((item) => {
    const isServiceDraft =
      item.draft &&
      normalizeNameKey((item.draft as QuadrantDraft | undefined)?.department || item.department) === 'serveis' &&
      normalizeNameKey(item.phaseKey || item.phaseType || item.phaseLabel || 'event') === 'event'

    if (!isServiceDraft) {
      // IMPORTANT:
      // Si expandim events per dia (multi-day), poden compartir el mateix `id`.
      // Cal evitar que el Map els col·lapsi i així perdre dies intermedis.
      const dateKey = item.phaseDate || (item.start ? String(item.start).slice(0, 10) : '')
      grouped.set(`single:${item.id}:${dateKey}`, [item])
      return
    }

    const dateKey = item.phaseDate || (item.start ? String(item.start).slice(0, 10) : '')
    const key = `service:${String(item.eventId || item.code || item.id)}:${dateKey}`
    const list = grouped.get(key) || []
    list.push(item)
    grouped.set(key, list)
  })

  return Array.from(grouped.values()).map((entries) => {
    if (entries.length === 1) return entries[0]

    const base = entries[0]
    const baseDraft: QuadrantDraft = isQuadrantDraft(base.draft) ? base.draft : {}
    const drafts = entries.map((entry) => entry.draft).filter(isQuadrantDraft)
    const mergedStatus: QuadrantStatus =
      entries.every((entry) => entry.quadrantStatus === 'confirmed')
        ? 'confirmed'
        : entries.some((entry) => entry.quadrantStatus === 'draft')
        ? 'draft'
        : entries.some((entry) => entry.quadrantStatus === 'confirmed')
        ? 'draft'
        : 'pending'
    const mergedGroups = drafts.flatMap((draft) => {
      const groups = Array.isArray(draft?.groups) ? draft.groups : []
      if (groups.length > 0) {
        return groups.map((group) => ({
          ...group,
          driverName:
            group?.driverName ||
            (Array.isArray(draft?.conductors) ? draft.conductors[0]?.name : null) ||
            null,
          responsibleId: group?.responsibleId || draft?.responsableId || null,
          responsibleName:
            group?.responsibleName || draft?.responsableName || null,
        }))
      }

      return [
        {
          id: draft?.id || null,
          serviceDate: draft?.startDate || null,
          meetingPoint: draft?.meetingPoint || '',
          startTime: draft?.startTime || '',
          endTime: draft?.endTime || '',
          workers: Number(draft?.totalWorkers || 0),
          drivers: Number(draft?.numDrivers || 0),
          needsDriver: Number(draft?.numDrivers || 0) > 0,
          driverId: draft?.conductors?.[0]?.id || null,
          driverName: draft?.conductors?.[0]?.name || null,
          responsibleId: draft?.responsableId || null,
          responsibleName: draft?.responsableName || null,
        },
      ]
    })
    const startTime = pickEdgeTime(entries.map((entry) => entry.displayStartTime || entry.startTime), 'min')
    const endTime = pickEdgeTime(entries.map((entry) => entry.displayEndTime || entry.endTime), 'max')
    const mergedDraft = {
      ...baseDraft,
      id: String(base.eventId || base.id || ''),
      startTime: startTime || baseDraft.startTime || '',
      endTime: endTime || baseDraft.endTime || '',
      conductors: mergePeople(drafts.map((draft) => (Array.isArray(draft?.conductors) ? draft.conductors : []))),
      treballadors: mergePeople(drafts.map((draft) => (Array.isArray(draft?.treballadors) ? draft.treballadors : []))),
      groups: mergedGroups,
      totalWorkers: drafts.reduce((sum: number, draft) => sum + Number(draft?.totalWorkers || 0), 0),
      numDrivers: drafts.reduce((sum: number, draft) => sum + Number(draft?.numDrivers || 0), 0),
      responsableId:
        drafts.find((draft) => String(draft?.responsableId || '').trim())?.responsableId ||
        baseDraft.responsableId ||
        '',
      responsableName:
        drafts.find((draft) => String(draft?.responsableName || '').trim())?.responsableName ||
        baseDraft.responsableName ||
        '',
    }

    return {
      ...base,
      id: String(base.eventId || base.id || ''),
      draft: mergedDraft,
      quadrantStatus: mergedStatus,
      workersSummary: buildWorkersSummary(mergedDraft),
      displayStartTime: startTime || base.displayStartTime,
      displayEndTime: endTime || base.displayEndTime,
      horariLabel: `${startTime || '--:--'} - ${endTime || '--:--'}`,
    }
  })
}

const buildWorkersSummary = (q: QuadrantDraft) => {
  const normalizeName = (value?: unknown) =>
    (value || '').toString().trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')

  const responsibleName = normalizeName(q?.responsableName)
  const names: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(q?.conductors)) {
    q.conductors
      .map((c) => c?.name)
      .filter(Boolean)
      .forEach((name: string) => {
        const key = normalizeName(name)
        if (!key || key === responsibleName || seen.has(key)) return
        seen.add(key)
        names.push(name)
      })
  }
  if (Array.isArray(q?.treballadors)) {
    q.treballadors
      .map((t) => t?.name)
      .filter((n) => Boolean(n) && String(n) !== 'Extra')
      .forEach((name: string) => {
        const key = normalizeName(name)
        if (!key || key === responsibleName || seen.has(key)) return
        seen.add(key)
        names.push(name)
      })
  }
  return names.join(', ')
}

export function useQuadrantsPageData({
  events,
  quadrants,
  filters,
}: UseQuadrantsPageDataParams): UseQuadrantsPageDataResult {
  const eventsWithStatus = useMemo<UnifiedEvent[]>(() => {
    const out: UnifiedEvent[] = []
    const eventsById = new Map<string, QuadrantEventLike>()
    const eventsByCode = new Map<string, QuadrantEventLike>()
    const quadrantsByEvent = new Map<string, QuadrantDraft[]>()

    events.forEach((ev) => {
      const event = ev as QuadrantEventLike
      const id = String(event.id || event.eventId || event.code || '').trim()
      if (id) eventsById.set(id, event)
      const code = normalize(event.code || event.eventCode || '')
      if (code) eventsByCode.set(code, event)
    })

    quadrants.forEach((q) => {
      const id = String(q.eventId || q.code || q.eventCode || '').trim()
      if (!id) return
      const list = quadrantsByEvent.get(id) || []
      list.push(q)
      quadrantsByEvent.set(id, list)
    })

    quadrants.forEach((q) => {
      const ev =
        (q.eventId && eventsById.get(String(q.eventId))) ||
        eventsById.get(getEventKey(q)) ||
        eventsByCode.get(normalize(q.code || q.eventCode || '')) ||
        null

      const eventDateBase =
        (ev?.start ? String(ev.start).slice(0, 10) : '') ||
        (q?.eventDate ? String(q.eventDate).slice(0, 10) : '') ||
        (q?.eventStartDate ? String(q.eventStartDate).slice(0, 10) : '') ||
        ''
      const eventStartDate = eventDateBase || q.startDate
      const eventStartTime =
        ev?.horaInici || (ev?.start ? String(ev.start).slice(11, 16) : null)
      const eventEndTime =
        hhMmFromFirestore(ev?.horaFi) ||
        (ev?.end ? String(ev.end).slice(11, 16) : null)
      const displayDate = q.phaseDate || q.startDate || eventStartDate

      const s = String(q?.status || '').toLowerCase()
      let quadrantStatus: QuadrantStatus = 'pending'
      if (s === 'draft') quadrantStatus = 'draft'
      else if (s === 'confirmed') quadrantStatus = 'confirmed'

      const displayStartTime = q.startTime || eventStartTime || undefined
      const displayEndTime = q.endTime || eventEndTime || undefined
      const horariLabel = `${displayStartTime || '--:--'} - ${
        displayEndTime || '--:--'
      }`

      const phaseType = (q.phaseType || q.phaseLabel || '')
        .toString()
        .trim()
        .toLowerCase()
      const phaseLabelRaw = (q.phaseLabel || q.phaseType || '').toString().trim()
      const phaseKeyValue = normalize(phaseType || phaseLabelRaw)
      const rawEventDate = eventDateBase || eventStartDate || ''
      const eventDateLabel = rawEventDate
        ? format(parseISO(rawEventDate), 'dd/MM')
        : ''
      let phaseBadgeLabel = ''
      if (phaseLabelRaw) {
        if (phaseType === 'event') {
          phaseBadgeLabel = phaseLabelRaw.toUpperCase()
        } else if (eventDateLabel) {
          phaseBadgeLabel = `${phaseLabelRaw.toUpperCase()} (${eventDateLabel})`
        } else {
          phaseBadgeLabel = phaseLabelRaw.toUpperCase()
        }
      }
      const phaseDate = displayDate ? String(displayDate).slice(0, 10) : undefined

      const baseEvent = (ev || {}) as Partial<QuadrantEventLike>
      const mergedEvent: UnifiedEvent = {
        ...baseEvent,
        id: q.id || q.eventId || q.code || '',
        eventId: String(q.eventId || ev?.id || ev?.eventId || q.code || ''),
        summary: ev?.summary || ev?.name || q.eventName || '-',
        originalStart: ev?.originalStart || ev?.start || undefined,
        originalEnd: ev?.originalEnd || ev?.end || undefined,
        start: `${displayDate}T${q.startTime || '00:00'}:00`,
        end: `${(q.endDate || displayDate)}T${q.endTime || '00:00'}:00`,
        code: q.code || q.eventCode || '',
        location: cleanText(q.location || ev?.location || ''),
        ln: cleanText(ev?.ln || ev?.lnLabel || q.ln || '') || null,
        responsable: cleanText(q.responsableName || ev?.responsable || ''),
        numPax: ev?.numPax ?? q?.numPax ?? null,
        service: cleanText(q.service || ev?.service || '') || null,
        commercial: ev?.commercial || null,
        workersSummary: buildWorkersSummary(q),
        displayStartTime,
        displayEndTime,
        quadrantStatus,
        horariLabel,
        phaseBadgeLabel,
        phaseType: phaseType || undefined,
        phaseLabel: phaseLabelRaw || undefined,
        phaseKey: phaseKeyValue || undefined,
        phaseDate,
        eventDateLabel,
        eventDateRaw: rawEventDate || undefined,
        draft: q,
      }
      out.push(mergedEvent)
    })

    events.forEach((ev) => {
      const event = ev as QuadrantEventLike
      const eventId = String(event.id || event.eventId || event.code || '').trim()
      if (!eventId) return
      const existing = quadrantsByEvent.get(eventId) || []
      const desiredDay = event.start ? String(event.start).slice(0, 10) : ''
      const hasEventDoc = existing.some((q) => {
        const rawPhase = (q.phaseType || q.phaseLabel || '').toString().trim().toLowerCase()
        const phaseNormKey = normalize((q.phaseType || q.phaseLabel || '').toString())
        const dept = (q.department || '').toString().trim().toLowerCase()

        const candidateDate = String(q.phaseDate || q.startDate || '').slice(0, 10)
        if (desiredDay && candidateDate && candidateDate !== desiredDay) return false

        // Event phase (normal).
        if (rawPhase === 'event' || phaseNormKey === 'event') return true

        // Cuina treballa amb una sola fase (event) i pot tenir docs antics sense phaseType.
        if (dept === 'cuina' && !rawPhase) return true

        // Serveis: muntatge/recollida… (mateix dia) — sense això queda «pendent» encara que el borrador existeixi.
        if (normalizeDepartment(dept) === 'serveis' && desiredDay && candidateDate === desiredDay) {
          const auxPhases = new Set(
            ['muntatge', 'montatge', 'recollida', 'desmuntatge', 'trasllat', 'entrega'].map(normalize)
          )
          if (auxPhases.has(phaseNormKey)) return true
        }

        // Serveis pot tenir fases/grups sense document "event" pur.
        if (normalizeDepartment(dept) === 'serveis' && !rawPhase) return true

        return false
      })
      if (hasEventDoc) return

      const eventStartDate = event.start ? String(event.start).slice(0, 10) : ''
      const eventStartTime =
        event.horaInici || (event.start ? String(event.start).slice(11, 16) : null)
      const eventEndTime =
        hhMmFromFirestore(event.horaFi) ||
        (event.end ? String(event.end).slice(11, 16) : null)
      const eventDateLabel = eventStartDate
        ? format(parseISO(eventStartDate), 'dd/MM')
        : ''

      const pendingEvent: UnifiedEvent = {
        ...event,
        id: String(event.id || event.eventId || event.code || ''),
        eventId: String(event.id || event.eventId || event.code || ''),
        summary: event.summary || event.name || '-',
        originalStart: event.originalStart || event.start || undefined,
        originalEnd: event.originalEnd || event.end || undefined,
        start: event.start || '',
        end: event.end || '',
        code: event.code || '',
        location: cleanText(event.location || ''),
        ln: cleanText(event.ln || event.lnLabel || '') || null,
        responsable: cleanText(event.responsable || ''),
        numPax: event.numPax ?? null,
        service: cleanText(event.service || '') || null,
        commercial: event.commercial || null,
        workersSummary: '',
        displayStartTime: eventStartTime || undefined,
        displayEndTime: eventEndTime || undefined,
        quadrantStatus: 'pending',
        horariLabel: `${eventStartTime || '--:--'} - ${eventEndTime || '--:--'}`,
        phaseBadgeLabel: '',
        phaseType: undefined,
        phaseLabel: undefined,
        phaseKey: 'event',
        phaseDate: eventStartDate || undefined,
        eventDateLabel,
        eventDateRaw: eventStartDate || undefined,
        draft: null,
      }
      out.push(pendingEvent)
    })

    const merged = mergeServiceEntries(out)

    const expanded: UnifiedEvent[] = []

    merged.forEach((ev) => {
      const phaseKey = (ev.phaseKey || ev.phaseType || ev.phaseLabel || '').toString().toLowerCase()
      const isEventPhase = phaseKey === 'event'

      if (!isEventPhase) {
        expanded.push(ev)
        return
      }

      const startIso = ev.start ? String(ev.start).slice(0, 10) : ''
      const endIso = ev.end ? String(ev.end).slice(0, 10) : startIso

      if (!startIso || !endIso) {
        expanded.push(ev)
        return
      }

      let startDate: Date
      let endDate: Date

      try {
        startDate = parseISO(startIso)
        endDate = parseISO(endIso)
      } catch {
        expanded.push(ev)
        return
      }

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        expanded.push(ev)
        return
      }

      const daySpan = differenceInCalendarDays(endDate, startDate)

      if (daySpan <= 0) {
        expanded.push(ev)
        return
      }

      for (let i = 0; i <= daySpan; i += 1) {
        const current = addDays(startDate, i)
        const iso = format(current, 'yyyy-MM-dd')
        expanded.push({
          ...ev,
          originalStart: ev.originalStart || ev.start,
          originalEnd: ev.originalEnd || ev.end,
          start: `${iso}T${ev.displayStartTime || '00:00'}:00`,
          end: `${iso}T${ev.displayEndTime || '00:00'}:00`,
          phaseDate: iso,
        })
      }
    })

    return expanded
  }, [events, quadrants])

  const phasesByEventId = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const ev of eventsWithStatus) {
      if (!ev.draft) continue
      const eventId = String(ev.eventId || ev.eventCode || ev.code || ev.id || '')
        .trim()
      if (!eventId) continue
      const phase = (ev.phaseKey || ev.phaseType || ev.phaseLabel || '')
        .toString()
        .toLowerCase()
        .trim()
      if (!phase) continue
      if (!map[eventId]) map[eventId] = new Set<string>()
      map[eventId].add(phase)
    }
    return map
  }, [eventsWithStatus])

  const counts = useMemo<QuadrantsPageCounts>(() => {
    let pending = 0
    let draft = 0
    let confirmed = 0

    for (const ev of eventsWithStatus) {
      if (ev.quadrantStatus === 'draft') draft++
      else if (ev.quadrantStatus === 'confirmed') confirmed++
      else pending++
    }

    return { pending, draft, confirmed }
  }, [eventsWithStatus])

  const filteredEvents = useMemo<UnifiedEvent[]>(() => {
    return eventsWithStatus.filter((ev) => {
      const evLn = (ev.ln || '').toString().trim().toLowerCase()
      const evResp = (ev.responsable || '').toString().trim().toLowerCase()
      const evLoc = (ev.location || '').toString().trim().toLowerCase()

      const fLn = (filters.ln || '').toLowerCase()
      const fResp = (filters.responsable || '').toLowerCase()
      const fLoc = (filters.location || '').toLowerCase()

      if (filters.status !== '__all__' && ev.quadrantStatus !== filters.status)
        return false

      if (filters.ln !== '__all__' && fLn !== evLn) return false

      if (filters.responsable !== '__all__' && !evResp.includes(fResp))
        return false

      if (filters.location !== '__all__' && fLoc !== evLoc) return false

      return true
    })
  }, [eventsWithStatus, filters])

  const grouped = useMemo<[string, UnifiedEvent[]][]>(() => {
    const map: Record<string, UnifiedEvent[]> = {}
    for (const ev of filteredEvents) {
      const day = ev.start.slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(ev)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredEvents])

  return {
    eventsWithStatus,
    counts,
    filteredEvents,
    grouped,
    phasesByEventId,
  }
}
