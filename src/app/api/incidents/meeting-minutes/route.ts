import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  defaultMeetingIncidentFilters,
  meetingAttendeesForFirestore,
  meetingFiltersForFirestore,
  normalizeMeetingAttendance,
  serializeMeetingSession,
  type IncidentMeetingAttendee,
  type IncidentMeetingSession,
} from '@/lib/incidentMeetingSession'
import { requireIncidentsMeetingMinutes } from '@/lib/server/incidentsApiAuth'
import {
  loadDefaultMeetingAttendees,
  refreshMeetingSessionAttendees,
} from '@/lib/server/incidentMeetingMinutesData'
import type { MeetingMinutesFilters } from '@/lib/incidentsMeetingMinutes'

export const runtime = 'nodejs'

const COLLECTION = 'incident_meeting_sessions'

function parseAttendees(raw: unknown): IncidentMeetingAttendee[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .map((row) => {
      const item = row as Record<string, unknown>
      const key = String(item.key || '').trim()
      const email = String(item.email || '').trim().toLowerCase()
      if (!email.includes('@') && !key.startsWith('core:')) return null
      const name = String(item.name || email || key).trim()
      return {
        key: key || `user:${item.userId || email}`,
        userId: String(item.userId || '').trim(),
        name,
        email,
        department: String(item.department || '').trim(),
        attendance: normalizeMeetingAttendance(item),
        absenceReason: String(item.absenceReason || '').trim(),
        receiveEmail: item.receiveEmail === false ? false : true,
      } satisfies IncidentMeetingAttendee
    })
    .filter(Boolean) as IncidentMeetingAttendee[]
}

function parseFilters(raw: unknown): MeetingMinutesFilters | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  return defaultMeetingIncidentFilters({
    from: String(f.from || '').trim() || undefined,
    to: String(f.to || '').trim() || undefined,
    department: String(f.department || '').trim() || undefined,
    importance: String(f.importance || 'all'),
    categoryLabel: String(f.categoryLabel || 'all'),
    status: (f.status as MeetingMinutesFilters['status']) || 'all',
  })
}

async function loadSessionById(id: string): Promise<IncidentMeetingSession | null> {
  const snap = await firestoreAdmin.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return serializeMeetingSession(snap.id, snap.data() as Record<string, unknown>)
}

function pickLatestDoc(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (!docs.length) return null
  const doc = docs
    .slice()
    .sort((a, b) =>
      String(b.data().updatedAt || '').localeCompare(String(a.data().updatedAt || ''))
    )[0]
  return serializeMeetingSession(doc.id, doc.data() as Record<string, unknown>)
}

async function loadLatestDraft(): Promise<IncidentMeetingSession | null> {
  const snap = await firestoreAdmin.collection(COLLECTION).where('status', '==', 'draft').limit(20).get()
  return pickLatestDoc(snap.docs)
}

async function loadMeetingHistory(limit = 50): Promise<IncidentMeetingSession[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200))
  const snap = await firestoreAdmin
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(safeLimit)
    .get()
  return snap.docs.map((doc) => serializeMeetingSession(doc.id, doc.data() as Record<string, unknown>))
}

/** Esborrany actiu o, si no n’hi ha, l’última acta finalitzada (pendent de tancament/enviament). */
async function loadActiveSession(): Promise<IncidentMeetingSession | null> {
  const draft = await loadLatestDraft()
  if (draft) return draft
  const snap = await firestoreAdmin
    .collection(COLLECTION)
    .where('status', '==', 'finalized')
    .limit(20)
    .get()
  return pickLatestDoc(snap.docs)
}

export async function GET(req: Request) {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const wantsHistory = searchParams.get('history') === '1'
    if (wantsHistory) {
      const limit = Number.parseInt(String(searchParams.get('limit') || '50'), 10)
      const sessions = await loadMeetingHistory(Number.isFinite(limit) ? limit : 50)
      return NextResponse.json({ sessions }, { status: 200 })
    }

    const id = String(searchParams.get('id') || '').trim()
    const raw = id ? await loadSessionById(id) : await loadActiveSession()
    const session = raw
      ? { ...raw, attendees: await refreshMeetingSessionAttendees(raw.attendees) }
      : null
    return NextResponse.json({ session }, { status: 200 })
  } catch (e) {
    console.error('[incidents/meeting-minutes GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as {
      notes?: string
      incidentFilters?: unknown
      attendees?: unknown
      forceNew?: boolean
    }

    if (!body.forceNew) {
      const existing = await loadLatestDraft()
      if (existing) {
        return NextResponse.json({ session: existing }, { status: 200 })
      }
    }

    const now = new Date().toISOString()
    const user = auth.user
    const defaultAttendees = await loadDefaultMeetingAttendees()
    const parsed = parseAttendees(body.attendees)
    const parsedAttendees = parsed && parsed.length > 0 ? parsed : defaultAttendees
    const incidentFilters =
      parseFilters(body.incidentFilters) || defaultMeetingIncidentFilters()

    const payload = {
      status: 'draft',
      notes: String(body.notes || ''),
      incidentFilters: meetingFiltersForFirestore(incidentFilters),
      attendees: meetingAttendeesForFirestore(parsedAttendees),
      incidentComments: {},
      createdAt: now,
      updatedAt: now,
      createdById: user.id,
      createdByName: String(user.name || user.email || '').trim(),
      finalizedAt: null,
      finalizedById: null,
      finalizedByName: null,
      emailSentAt: null,
      emailSentById: null,
      emailSentByName: null,
    }

    const docRef = await firestoreAdmin.collection(COLLECTION).add(payload)
    const session = serializeMeetingSession(docRef.id, payload)
    return NextResponse.json({ session }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error intern'
    console.error('[incidents/meeting-minutes POST]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as {
      id?: string
      action?: 'save' | 'finalize' | 'reopen'
      notes?: string
      incidentFilters?: unknown
      attendees?: unknown
    }

    const id = String(body.id || '').trim()
    const action = body.action || 'save'
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const ref = firestoreAdmin.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Acta no trobada' }, { status: 404 })
    }

    const current = serializeMeetingSession(id, snap.data() as Record<string, unknown>)
    const now = new Date().toISOString()
    const user = auth.user
    const patch: Record<string, unknown> = { updatedAt: now }

    if (action === 'reopen') {
      if (current.status !== 'finalized') {
        return NextResponse.json({ error: 'Només es pot reobrir una acta finalitzada' }, { status: 400 })
      }
      patch.status = 'draft'
      patch.finalizedAt = null
      patch.finalizedById = null
      patch.finalizedByName = null
    } else if (action === 'finalize') {
      if (current.status !== 'draft') {
        return NextResponse.json({ error: 'L acta ja està finalitzada' }, { status: 400 })
      }
      patch.status = 'finalized'
      patch.finalizedAt = now
      patch.finalizedById = user.id
      patch.finalizedByName = String(user.name || user.email || '').trim()
      if (typeof body.notes === 'string') patch.notes = body.notes
      const attendees = parseAttendees(body.attendees)
      if (attendees) patch.attendees = meetingAttendeesForFirestore(attendees)
      const filters = parseFilters(body.incidentFilters)
      if (filters) patch.incidentFilters = meetingFiltersForFirestore(filters)
    } else {
      if (current.status === 'finalized') {
        if (typeof body.notes === 'string') patch.notes = body.notes
        const attendees = parseAttendees(body.attendees)
        if (attendees) patch.attendees = meetingAttendeesForFirestore(attendees)
        const filters = parseFilters(body.incidentFilters)
        if (filters) patch.incidentFilters = meetingFiltersForFirestore(filters)
      } else {
        if (typeof body.notes === 'string') patch.notes = body.notes
        const attendees = parseAttendees(body.attendees)
        if (attendees) patch.attendees = meetingAttendeesForFirestore(attendees)
        const filters = parseFilters(body.incidentFilters)
        if (filters) patch.incidentFilters = meetingFiltersForFirestore(filters)
      }
    }

    await ref.update(patch)
    const updated = await loadSessionById(id)
    return NextResponse.json({ session: updated }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error intern'
    console.error('[incidents/meeting-minutes PATCH]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
