import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  INCIDENT_MEETING_COMMENT_MAX_LENGTH,
  serializeIncidentMeetingComments,
  type IncidentMeetingComment,
} from '@/lib/incidentMeetingSession'
import { requireIncidentsMeetingMinutes } from '@/lib/server/incidentsApiAuth'

export const runtime = 'nodejs'

const COLLECTION = 'incident_meeting_sessions'

export async function PATCH(req: Request) {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as { sessionId?: string; incidentId?: string; text?: string }
    const sessionId = String(body.sessionId || '').trim()
    const incidentId = String(body.incidentId || '').trim()
    const text = String(body.text || '').slice(0, INCIDENT_MEETING_COMMENT_MAX_LENGTH)
    if (!sessionId || !incidentId) {
      return NextResponse.json({ error: 'Falta la sessió o la incidència' }, { status: 400 })
    }

    const ref = firestoreAdmin.collection(COLLECTION).doc(sessionId)
    let savedComment: IncidentMeetingComment | null = null
    await firestoreAdmin.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new Error('ACTA_NOT_FOUND')
      const data = snap.data() as Record<string, unknown>
      if (data.status === 'finalized') throw new Error('ACTA_FINALIZED')

      const comments = serializeIncidentMeetingComments(data.incidentComments)
      const now = new Date().toISOString()
      if (text.trim()) {
        savedComment = {
          incidentId,
          text,
          updatedAt: now,
          updatedById: auth.user.id,
          updatedByName: String(auth.user.name || auth.user.email || '').trim(),
        }
        comments[incidentId] = savedComment
      } else {
        delete comments[incidentId]
      }
      tx.update(ref, { incidentComments: comments, updatedAt: now })
    })

    return NextResponse.json({ comment: savedComment }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error intern'
    if (message === 'ACTA_NOT_FOUND') {
      return NextResponse.json({ error: 'Acta no trobada' }, { status: 404 })
    }
    if (message === 'ACTA_FINALIZED') {
      return NextResponse.json({ error: 'L’acta està finalitzada i no es pot editar' }, { status: 409 })
    }
    console.error('[incidents/meeting-minutes/comments PATCH]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
