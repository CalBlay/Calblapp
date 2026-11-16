import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { requireQuadrantsMeetingMinutes } from '@/lib/server/quadrantsReadAuth'
import { QUADRANTS_MEETING_MINUTES_COLLECTION } from '@/lib/quadrantsWeeklyMeeting'
import {
  meetingAttendeesForFirestore,
  normalizeMeetingAttendance,
  type IncidentMeetingAttendee,
} from '@/lib/incidentMeetingSession'
import {
  loadDefaultQuadrantsMeetingAttendees,
  refreshQuadrantsMeetingAttendees,
} from '@/lib/server/quadrantsMeetingMinutesData'

export const runtime = 'nodejs'

function serialize(id: string, data: Record<string, unknown>) {
  const attendees = Array.isArray(data.attendees)
    ? data.attendees.map((row) => {
        const item = row as Record<string, unknown>
        return {
          key: String(item.key || `user:${item.userId || item.email || ''}`).trim(),
          userId: String(item.userId || '').trim(),
          name: String(item.name || item.email || '').trim(),
          email: String(item.email || '').trim().toLowerCase(),
          department: String(item.department || '').trim(),
          attendance: normalizeMeetingAttendance(item) || 'in_person',
          absenceReason: String(item.absenceReason || '').trim(),
          receiveEmail: item.receiveEmail === false ? false : true,
        } satisfies IncidentMeetingAttendee
      })
    : []
  return {
    id,
    weekStart: String(data.weekStart || ''),
    weekEnd: String(data.weekEnd || ''),
    status: data.status === 'finalized' ? 'finalized' : 'draft',
    notes: String(data.notes || ''),
    rows: Array.isArray(data.rows) ? data.rows : [],
    attendees,
    additionalEmails: Array.isArray(data.additionalEmails)
      ? data.additionalEmails.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [],
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || ''),
    createdByName: String(data.createdByName || ''),
    finalizedAt: String(data.finalizedAt || ''),
    finalizedByName: String(data.finalizedByName || ''),
    emailSentAt: String(data.emailSentAt || ''),
    emailSentByName: String(data.emailSentByName || ''),
  }
}

function parseAttendees(raw: unknown): IncidentMeetingAttendee[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .map((row) => {
      const item = row as Record<string, unknown>
      const key = String(item.key || '').trim()
      const name = String(item.name || '').trim()
      if (!key || !name) return null
      return {
        key,
        userId: String(item.userId || '').trim(),
        name,
        email: String(item.email || '').trim().toLowerCase(),
        department: String(item.department || '').trim(),
        attendance: normalizeMeetingAttendance(item) || 'in_person',
        absenceReason: String(item.absenceReason || '').trim(),
        receiveEmail: item.receiveEmail === false ? false : true,
      } satisfies IncidentMeetingAttendee
    })
    .filter(Boolean) as IncidentMeetingAttendee[]
}

export async function GET(req: NextRequest) {
  const auth = await requireQuadrantsMeetingMinutes()
  if (!auth.ok) return auth.res

  try {
    const { searchParams } = new URL(req.url)
    const wantsHistory = searchParams.get('history') === '1'
    if (wantsHistory) {
      const snap = await firestoreAdmin
        .collection(QUADRANTS_MEETING_MINUTES_COLLECTION)
        .limit(100)
        .get()
      const sessions = snap.docs
        .map((doc) => serialize(doc.id, doc.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return NextResponse.json({ sessions })
    }

    const weekStart = String(searchParams.get('weekStart') || '')
    const weekEnd = String(searchParams.get('weekEnd') || '')
    if (!isIsoDateDayParam(weekStart) || !isIsoDateDayParam(weekEnd)) {
      return NextResponse.json({ error: 'Setmana invàlida' }, { status: 400 })
    }
    const id = Buffer.from(`${weekStart}::${weekEnd}`).toString('base64url')
    const snap = await firestoreAdmin
      .collection(QUADRANTS_MEETING_MINUTES_COLLECTION)
      .doc(id)
      .get()
    const defaultAttendees = await loadDefaultQuadrantsMeetingAttendees()
    if (!snap.exists) {
      return NextResponse.json({ session: null, attendees: defaultAttendees })
    }
    const session = serialize(snap.id, snap.data() as Record<string, unknown>)
    return NextResponse.json({
      session: {
        ...session,
        attendees: await refreshQuadrantsMeetingAttendees(session.attendees),
      },
      attendees: defaultAttendees,
    })
  } catch (error) {
    console.error('[quadrants/meeting/minutes GET]', error)
    return NextResponse.json({ error: 'No s’ha pogut carregar l’acta' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireQuadrantsMeetingMinutes()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const weekStart = String(body.weekStart || '')
    const weekEnd = String(body.weekEnd || '')
    const action = String(body.action || 'save')
    if (!isIsoDateDayParam(weekStart) || !isIsoDateDayParam(weekEnd)) {
      return NextResponse.json({ error: 'Setmana invàlida' }, { status: 400 })
    }
    if (!['save', 'finalize', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'Acció invàlida' }, { status: 400 })
    }

    const id = Buffer.from(`${weekStart}::${weekEnd}`).toString('base64url')
    const ref = firestoreAdmin
      .collection(QUADRANTS_MEETING_MINUTES_COLLECTION)
      .doc(id)
    const existing = await ref.get()
    const current = existing.exists
      ? serialize(existing.id, existing.data() as Record<string, unknown>)
      : null
    const now = new Date().toISOString()
    const userName = String(auth.user.name || auth.user.email || '')
    const parsedAttendees = parseAttendees(body.attendees)
    const additionalEmails = Array.isArray(body.additionalEmails)
      ? [...new Set(body.additionalEmails
          .map((value) => String(value || '').trim().toLowerCase())
          .filter((value) => value.includes('@')))]
      : current?.additionalEmails || []
    const defaultAttendees = await loadDefaultQuadrantsMeetingAttendees()
    const attendees = parsedAttendees && parsedAttendees.length > 0
      ? parsedAttendees
      : current?.attendees?.length
        ? await refreshQuadrantsMeetingAttendees(current.attendees)
        : defaultAttendees

    if (action === 'finalize' && current?.status === 'finalized') {
      return NextResponse.json({ error: 'L’acta ja està finalitzada' }, { status: 400 })
    }
    if (action === 'reopen' && current?.status !== 'finalized') {
      return NextResponse.json({ error: 'L’acta no està finalitzada' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      weekStart,
      weekEnd,
      notes: typeof body.notes === 'string' ? body.notes : current?.notes || '',
      attendees: meetingAttendeesForFirestore(attendees),
      additionalEmails,
      updatedAt: now,
      updatedById: auth.user.id,
      updatedByName: userName,
      ...(!existing.exists
        ? { createdAt: now, createdById: auth.user.id, createdByName: userName }
        : {}),
    }
    if (action === 'finalize') {
      payload.status = 'finalized'
      payload.rows = Array.isArray(body.rows) ? body.rows : []
      payload.finalizedAt = now
      payload.finalizedById = auth.user.id
      payload.finalizedByName = userName
    } else if (action === 'reopen') {
      payload.status = 'draft'
      payload.finalizedAt = null
      payload.finalizedById = null
      payload.finalizedByName = null
    } else {
      payload.status = current?.status || 'draft'
      if (current?.status !== 'finalized' && Array.isArray(body.rows)) {
        payload.rows = body.rows
      }
    }

    await ref.set(payload, { merge: true })
    const updated = await ref.get()
    return NextResponse.json({
      session: serialize(updated.id, updated.data() as Record<string, unknown>),
    })
  } catch (error) {
    console.error('[quadrants/meeting/minutes POST]', error)
    return NextResponse.json({ error: 'No s’ha pogut desar l’acta' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireQuadrantsMeetingMinutes()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as { id?: string }
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const ref = firestoreAdmin
      .collection(QUADRANTS_MEETING_MINUTES_COLLECTION)
      .doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Acta no trobada' }, { status: 404 })
    }

    await ref.delete()
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('[quadrants/meeting/minutes DELETE]', error)
    return NextResponse.json({ error: 'No s’ha pogut eliminar l’acta' }, { status: 500 })
  }
}
