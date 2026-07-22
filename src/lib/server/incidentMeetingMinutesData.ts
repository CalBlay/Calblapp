import admin from 'firebase-admin'
import type { Query } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import type { MeetingMinutesFilters } from '@/lib/incidentsMeetingMinutes'
import type { IncidentMeetingAttendee } from '@/lib/incidentMeetingSession'
import { mergeMeetingAttendees, resolveCoreMeetingAttendees } from '@/lib/incidentMeetingAttendees'
import { normalizeIncidentActionStatus } from '@/lib/incidentPolicy'
import { loadAllAppUsers } from '@/lib/server/incidentMeetingUsers'

function normalizeTimestamp(ts: unknown): string {
  if (
    ts &&
    typeof ts === 'object' &&
    'toDate' in ts &&
    typeof (ts as { toDate?: unknown }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().toISOString()
  }
  if (typeof ts === 'string') return ts
  return ''
}

function formatActionStatusLabel(raw: unknown) {
  const status = normalizeIncidentActionStatus(String(raw || 'open'))
  if (status === 'done') return 'Tancada'
  if (status === 'in_progress') return 'En curs'
  return 'Oberta'
}

function formatActionSummary(action: Record<string, unknown>) {
  const title = String(action.title || '').trim()
  const description = String(action.description || '').trim()
  const assignedToName = String(action.assignedToName || '').trim()
  const parts = [title || description || 'Acció sense títol']
  if (assignedToName) parts.push(`Responsable: ${assignedToName}`)
  parts.push(`Estat: ${formatActionStatusLabel(action.status)}`)
  return parts.join(' · ')
}

export async function loadDefaultMeetingAttendees(): Promise<IncidentMeetingAttendee[]> {
  const users = await loadAllAppUsers(true)
  return resolveCoreMeetingAttendees(users)
}

/** Re-aplica convocats fixos actuals (p. ex. Sonia Albet) sobre dades guardades. */
export async function refreshMeetingSessionAttendees(
  attendees: IncidentMeetingAttendee[]
): Promise<IncidentMeetingAttendee[]> {
  const core = await loadDefaultMeetingAttendees()
  return mergeMeetingAttendees(attendees, core)
}

export async function fetchIncidentsForMeetingMinutes(filters: MeetingMinutesFilters) {
  const from = String(filters.from || '').trim()
  const to = String(filters.to || '').trim()
  if (!from || !to) return []

  const ref: Query = firestoreAdmin
    .collection('incidents')
    .where('eventDate', '>=', from)
    .where('eventDate', '<=', to)
    .orderBy('eventDate', 'desc')

  const snap = await ref.limit(1000).get()
  const raw = snap.docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      ...d,
      createdAt: normalizeTimestamp(d.createdAt),
    }
  }) as Array<Record<string, unknown>>

  const eventIds = [...new Set(raw.map((i) => String(i.eventId || '')).filter(Boolean))]
  const eventsMap = new Map<string, FirebaseFirestore.DocumentData>()
  if (eventIds.length) {
    const chunkSize = 10
    for (let i = 0; i < eventIds.length; i += chunkSize) {
      const chunk = eventIds.slice(i, i + chunkSize)
      const evSnap = await firestoreAdmin
        .collection('stage_verd')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get()
      evSnap.docs.forEach((doc) => eventsMap.set(doc.id, doc.data()))
    }
  }

  const incidents = raw.map((inc): Record<string, unknown> => {
    const ev = eventsMap.get(String(inc.eventId || '')) || {}
    return {
      ...inc,
      ln: ev.LN || '',
      serviceType: ev.Servei || '',
      pax: ev.NumPax || '',
      eventCode: ev.code || ev.Code || ev.C_digo || ev.codi || '',
      eventTitle: ev.NomEvent || '',
      eventLocation: ev.Ubicacio || '',
      eventCommercial: ev.Comercial || ev.comercial || '',
      fincaId: ev.FincaId || ev.FincaCode || '',
      eventDate: inc.eventDate || '',
    }
  })

  const incidentIds = incidents.map((inc) => String(inc.id || '').trim()).filter(Boolean)
  const actionsByIncident = new Map<string, string[]>()
  const chunkSize = 30

  for (let i = 0; i < incidentIds.length; i += chunkSize) {
    const chunk = incidentIds.slice(i, i + chunkSize)
    const actionsSnap = await firestoreAdmin
      .collection('incident_actions')
      .where('incidentId', 'in', chunk)
      .get()

    actionsSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const incidentId = String(data.incidentId || '').trim()
      if (!incidentId) return
      const current = actionsByIncident.get(incidentId) || []
      current.push(formatActionSummary(data))
      actionsByIncident.set(incidentId, current)
    })
  }

  return incidents.map((incident) => {
    const actionLines = actionsByIncident.get(String(incident.id || '').trim()) || []
    return {
      ...incident,
      meetingMinutesActionsText: actionLines.join('\n'),
    }
  })
}
