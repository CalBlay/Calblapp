import { NextRequest, NextResponse } from 'next/server'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { computeQuadrantsGet } from '@/lib/api/quadrantsGetRange'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import { listQuadrantEventsInRange } from '@/lib/quadrantEvents'
import { requireQuadrantsModuleRead } from '@/lib/server/quadrantsReadAuth'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import {
  QUADRANTS_MEETING_DECISIONS_COLLECTION,
  QUADRANTS_MEETING_EVENT_NOTES_COLLECTION,
  decisionMap,
  meetingDecisionKey,
  meetingEventKey,
  type MeetingDepartment,
  type WeeklyMeetingRow,
} from '@/lib/quadrantsWeeklyMeeting'
import {
  listMeetingDecisions,
  listMeetingEventNotes,
} from '@/lib/server/quadrantsWeeklyMeetingStore'

export const runtime = 'nodejs'

const normalizeEventId = (value: unknown) =>
  String(value || '').trim().split('__')[0].trim()

const normalizeTime = (value: unknown) => {
  const time = String(value || '').trim().slice(0, 5)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : ''
}

function parseScheduleEntries(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).map((entry, index) => {
    const row = (entry || {}) as Record<string, unknown>
    return {
      id: String(row.id || `schedule-${index + 1}`).slice(0, 80),
      time: normalizeTime(row.time),
      label: String(row.label || '').trim().slice(0, 160),
    }
  })
}

function entriesToText(entries: Array<{ time: string; label: string }>) {
  return entries
    .map((entry) => [entry.time, entry.label].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n')
}

function quadrantMatches(
  quadrant: Record<string, unknown>,
  eventId: string,
  eventCode: string,
  eventDay: string
) {
  const quadrantId = normalizeEventId(quadrant.eventId)
  const quadrantCode = String(quadrant.code || quadrant.eventCode || '')
  if (quadrantId !== normalizeEventId(eventId) && (!eventCode || quadrantCode !== eventCode)) {
    return false
  }
  const start = String(quadrant.startDate || quadrant.phaseDate || '').slice(0, 10)
  const end = String(quadrant.endDate || quadrant.phaseDate || start).slice(0, 10)
  return (!start || start <= eventDay) && (!end || end >= eventDay)
}

function personName(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return String(row.name || row.personName || '').trim()
}

function personTime(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return normalizeTime(row.arrivalTime || row.startTime)
}

function buildServicesDetails(quadrants: Record<string, unknown>[]) {
  const relevant = quadrants.filter((quadrant) => {
    const phase = String(quadrant.phaseType || quadrant.phaseLabel || '').toLowerCase()
    return !phase || phase === 'event'
  })
  const source = relevant[0] || quadrants[0]
  if (!source) return { responsible: '', team: '', closing: '' }

  const responsible = String(source.responsableName || '') ||
    personName(source.responsable) ||
    (Array.isArray(source.responsables)
      ? source.responsables.map(personName).filter(Boolean).join(', ')
      : '')

  const people = [
    ...(Array.isArray(source.conductors) ? source.conductors : []),
    ...(Array.isArray(source.treballadors) ? source.treballadors : []),
  ]
  const byTime = new Map<string, string[]>()
  for (const person of people) {
    const name = personName(person)
    if (!name) continue
    const time = personTime(person) || normalizeTime(source.startTime) || 'sense hora'
    byTime.set(time, [...(byTime.get(time) || []), name])
  }
  const team = Array.from(byTime.entries())
    .map(([time, names]) => `${names.join(', ')} · ${time}`)
    .join('\n')
  const closingNames = people
    .filter((person) => personTime(person) && personTime(person) === normalizeTime(source.endTime))
    .map(personName)
    .filter(Boolean)
  const closing = normalizeTime(source.endTime)
    ? `${closingNames.length ? `${closingNames.join(', ')} · ` : ''}${normalizeTime(source.endTime)}`
    : ''
  return { responsible, team, closing }
}

export async function GET(req: NextRequest) {
  const auth = await requireQuadrantsModuleRead()
  if (!auth.ok) return auth.res

  try {
    const { searchParams } = new URL(req.url)
    const start = String(searchParams.get('start') || '')
    const end = String(searchParams.get('end') || '')
    if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
      return NextResponse.json({ error: 'Rang de dates invàlid' }, { status: 400 })
    }

    const [events, servicesResult, logisticsResult, kitchenResult, decisions, eventNotes] =
      await Promise.all([
        listQuadrantEventsInRange(start, end),
        computeQuadrantsGet(start, end, 'serveis'),
        computeQuadrantsGet(start, end, 'logistica'),
        computeQuadrantsGet(start, end, 'cuina'),
        listMeetingDecisions(start, end),
        listMeetingEventNotes(start, end),
      ])
    const decisionsByKey = decisionMap(decisions)
    const notesByKey = new Map(
      eventNotes.map((note) => [meetingEventKey(note.eventId, note.eventDay), note])
    )

    const rows: WeeklyMeetingRow[] = events.map((event) => {
      const eventId = normalizeEventId(event.id)
      const eventDay = event.day
      const matches = (quadrant: Record<string, unknown>) =>
        quadrantMatches(quadrant, eventId, event.code, eventDay)
      const serviceQuadrants = servicesResult.quadrants.filter(matches)
      const logisticsQuadrants = logisticsResult.quadrants.filter(matches)
      const kitchenQuadrants = kitchenResult.quadrants.filter(matches)
      const services = buildServicesDetails(serviceQuadrants)
      const logisticsDecision = decisionsByKey.get(
        meetingDecisionKey(eventId, eventDay, 'logistica')
      )
      const kitchenDecision = decisionsByKey.get(
        meetingDecisionKey(eventId, eventDay, 'cuina')
      )
      const logisticsExisting = logisticsQuadrants.find((q) =>
        ['', 'event'].includes(String(q.phaseType || q.phaseLabel || '').toLowerCase())
      ) || logisticsQuadrants[0]
      const kitchenExisting = kitchenQuadrants[0]
      const schedule = [event.horaInici, event.horaFi].filter(Boolean).join(' – ')
      const eventNote = notesByKey.get(meetingEventKey(eventId, eventDay))
      const defaultScheduleEntries = [{
        id: 'event-start',
        time: event.horaInici,
        label: 'Inici de l’esdeveniment',
      }]
      const scheduleEntries = eventNote?.scheduleEntries.length
        ? eventNote.scheduleEntries
        : defaultScheduleEntries

      return {
        key: meetingEventKey(eventId, eventDay),
        eventId,
        eventCode: event.code,
        eventDay,
        eventName: event.summary,
        location: event.location,
        ln: event.lnLabel,
        pax: event.numPax,
        eventSchedule: schedule,
        scheduleNotes: eventNote
          ? eventNote.scheduleNotes
          : entriesToText(defaultScheduleEntries) || schedule,
        scheduleEntries,
        scheduleNotesSaved: !!eventNote,
        meetingComment: eventNote?.meetingComment || '',
        meetingCommentSaved: eventNote?.meetingCommentSaved || false,
        servicesResponsible: services.responsible,
        servicesTeam: services.team,
        servicesClosing: services.closing,
        logistica: {
          required: logisticsDecision?.required !== false,
          arrivalTime: logisticsDecision?.arrivalTime || normalizeTime(logisticsExisting?.arrivalTime),
          saved: !!logisticsDecision,
        },
        cuina: {
          required: kitchenDecision?.required !== false,
          arrivalTime: kitchenDecision?.arrivalTime || normalizeTime(kitchenExisting?.arrivalTime),
          saved: !!kitchenDecision,
        },
      }
    })

    rows.sort((a, b) =>
      `${a.eventDay}${a.eventSchedule}${a.eventName}`.localeCompare(
        `${b.eventDay}${b.eventSchedule}${b.eventName}`
      )
    )
    return NextResponse.json({ rows })
  } catch (error) {
    console.error('[quadrants/meeting GET]', error)
    return NextResponse.json({ error: 'No s’ha pogut carregar la reunió' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireQuadrantsModuleRead()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const eventId = normalizeEventId(body.eventId)
    const eventCode = String(body.eventCode || '').trim()
    const eventDay = String(body.eventDay || '').slice(0, 10)
    const department: MeetingDepartment | null =
      body.department === 'logistica' || body.department === 'cuina'
        ? body.department
        : null
    const isScheduleUpdate = body.kind === 'schedule'
    const isCommentUpdate = body.kind === 'comment'
    const required = body.required !== false
    const arrivalTime = normalizeTime(body.arrivalTime)
    if (
      !eventId ||
      !isIsoDateDayParam(eventDay) ||
      (!isScheduleUpdate && !isCommentUpdate && !department)
    ) {
      return NextResponse.json({ error: 'Dades de decisió invàlides' }, { status: 400 })
    }

    const now = new Date().toISOString()
    if (isCommentUpdate) {
      const docId = Buffer.from(meetingEventKey(eventId, eventDay)).toString('base64url')
      const payload = {
        eventId,
        eventCode,
        eventDay,
        meetingComment: String(body.meetingComment || '').trim().slice(0, 4000),
        updatedAt: now,
        updatedById: auth.user.id,
        updatedByName: String(auth.user.name || auth.user.email || ''),
      }
      await firestoreAdmin
        .collection(QUADRANTS_MEETING_EVENT_NOTES_COLLECTION)
        .doc(docId)
        .set(payload, { merge: true })
      return NextResponse.json({ eventNote: { ...payload, id: docId } })
    }

    if (isScheduleUpdate) {
      const docId = Buffer.from(meetingEventKey(eventId, eventDay)).toString('base64url')
      const scheduleEntries = parseScheduleEntries(body.scheduleEntries)
      const payload = {
        eventId,
        eventCode,
        eventDay,
        scheduleEntries,
        scheduleNotes: entriesToText(scheduleEntries),
        updatedAt: now,
        updatedById: auth.user.id,
        updatedByName: String(auth.user.name || auth.user.email || ''),
      }
      await firestoreAdmin
        .collection(QUADRANTS_MEETING_EVENT_NOTES_COLLECTION)
        .doc(docId)
        .set(payload, { merge: true })
      return NextResponse.json({ eventNote: { ...payload, id: docId } })
    }

    if (!department) {
      return NextResponse.json({ error: 'Departament invàlid' }, { status: 400 })
    }

    const docId = Buffer.from(meetingDecisionKey(eventId, eventDay, department))
      .toString('base64url')
    const payload = {
      eventId,
      eventCode,
      eventDay,
      department,
      required,
      arrivalTime,
      updatedAt: now,
      updatedById: auth.user.id,
      updatedByName: String(auth.user.name || auth.user.email || ''),
    }
    await firestoreAdmin
      .collection(QUADRANTS_MEETING_DECISIONS_COLLECTION)
      .doc(docId)
      .set(payload, { merge: true })

    const existing = await computeQuadrantsGet(eventDay, eventDay, department)
    const matching = existing.quadrants.filter((quadrant) => {
      if (!quadrantMatches(quadrant, eventId, eventCode, eventDay)) return false
      const phase = String(quadrant.phaseType || quadrant.phaseLabel || '').toLowerCase()
      return !phase || phase === 'event'
    })
    if (matching.length > 0) {
      const collection = await resolveQuadrantCollection(department, { prefer: 'singular' })
      const batch = firestoreAdmin.batch()
      for (const quadrant of matching) {
        const ref = firestoreAdmin.collection(collection).doc(String(quadrant.id))
        const rawSnap = await ref.get()
        const raw = (rawSnap.data() || {}) as Record<string, unknown>
        const withArrival = (value: unknown) => {
          if (!value || typeof value !== 'object') return value
          return { ...(value as Record<string, unknown>), arrivalTime }
        }
        const patch: Record<string, unknown> = {
          weeklyMeetingRequired: required,
          weeklyMeetingUpdatedAt: now,
        }
        if (required) {
          patch.arrivalTime = arrivalTime
          if (raw.responsable) patch.responsable = withArrival(raw.responsable)
          if (Array.isArray(raw.responsables)) {
            patch.responsables = raw.responsables.map(withArrival)
          }
          if (Array.isArray(raw.conductors)) {
            patch.conductors = raw.conductors.map(withArrival)
          }
          if (Array.isArray(raw.treballadors)) {
            patch.treballadors = raw.treballadors.map(withArrival)
          }
          if (Array.isArray(raw.groups)) {
            patch.groups = raw.groups.map((group) => {
              if (!group || typeof group !== 'object') return group
              const value = group as Record<string, unknown>
              return {
                ...value,
                arrivalTime,
                ...(Array.isArray(value.roleLines)
                  ? { roleLines: value.roleLines.map(withArrival) }
                  : {}),
                ...(Array.isArray(value.manualWorkers)
                  ? { manualWorkers: value.manualWorkers.map(withArrival) }
                  : {}),
              }
            })
          }
        }
        batch.update(ref, patch)
      }
      await batch.commit()
      revalidateQuadrantsListCache()
    }

    return NextResponse.json({ decision: { ...payload, id: docId } })
  } catch (error) {
    console.error('[quadrants/meeting PATCH]', error)
    return NextResponse.json({ error: 'No s’ha pogut desar la decisió' }, { status: 500 })
  }
}
