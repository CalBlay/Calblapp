import admin from 'firebase-admin'
import type { Query } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import type { MeetingMinutesFilters } from '@/lib/incidentsMeetingMinutes'
import type { IncidentMeetingAttendee } from '@/lib/incidentMeetingSession'
import { mergeMeetingAttendees, resolveCoreMeetingAttendees } from '@/lib/incidentMeetingAttendees'
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

  const incidents = raw.map((inc) => {
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

  return incidents
}
