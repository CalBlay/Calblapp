import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  QUADRANTS_MEETING_DECISIONS_COLLECTION,
  QUADRANTS_MEETING_EVENT_NOTES_COLLECTION,
  type MeetingDecision,
  type MeetingEventNote,
} from '@/lib/quadrantsWeeklyMeeting'

const normalizeEventId = (value: unknown) =>
  String(value || '').trim().split('__')[0].trim()

export async function listMeetingDecisions(
  start: string,
  end: string
): Promise<MeetingDecision[]> {
  const snap = await firestoreAdmin
    .collection(QUADRANTS_MEETING_DECISIONS_COLLECTION)
    .where('eventDay', '>=', start)
    .where('eventDay', '<=', end)
    .get()
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>
    return {
      id: doc.id,
      eventId: normalizeEventId(data.eventId),
      eventCode: String(data.eventCode || ''),
      eventDay: String(data.eventDay || '').slice(0, 10),
      department: data.department === 'cuina' ? 'cuina' : 'logistica',
      required: data.required !== false,
      arrivalTime: String(data.arrivalTime || ''),
      updatedAt: String(data.updatedAt || ''),
      updatedByName: String(data.updatedByName || ''),
    }
  })
}

export async function listMeetingEventNotes(
  start: string,
  end: string
): Promise<MeetingEventNote[]> {
  const snap = await firestoreAdmin
    .collection(QUADRANTS_MEETING_EVENT_NOTES_COLLECTION)
    .where('eventDay', '>=', start)
    .where('eventDay', '<=', end)
    .get()
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>
    const scheduleNotes = String(data.scheduleNotes || '')
    const storedEntries = Array.isArray(data.scheduleEntries)
      ? data.scheduleEntries.map((entry, index) => {
          const value = (entry || {}) as Record<string, unknown>
          return {
            id: String(value.id || `schedule-${index + 1}`),
            time: String(value.time || ''),
            label: String(value.label || ''),
          }
        })
      : []
    const legacyEntries = scheduleNotes
      .split(/\r?\n/)
      .map((line, index) => {
        const match = line.trim().match(/^(\d{2}:\d{2})\s*(.*)$/)
        return {
          id: `legacy-${index + 1}`,
          time: match?.[1] || '',
          label: match?.[2] || line.trim(),
        }
      })
      .filter((entry) => entry.time || entry.label)
    return {
      id: doc.id,
      eventId: normalizeEventId(data.eventId),
      eventCode: String(data.eventCode || ''),
      eventDay: String(data.eventDay || '').slice(0, 10),
      scheduleNotes,
      scheduleEntries: storedEntries.length ? storedEntries : legacyEntries,
      meetingComment: String(data.meetingComment || ''),
      meetingCommentSaved: Object.prototype.hasOwnProperty.call(data, 'meetingComment'),
      updatedAt: String(data.updatedAt || ''),
      updatedByName: String(data.updatedByName || ''),
    }
  })
}
