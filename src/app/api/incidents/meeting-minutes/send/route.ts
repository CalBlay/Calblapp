import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { buildIncidentsMeetingMinutesHtml } from '@/lib/incidentsMeetingMinutes'
import type { Incident } from '@/hooks/useIncidents'
import {
  activeMeetingAttendees,
  isMeetingEmailRecipient,
  serializeMeetingSession,
} from '@/lib/incidentMeetingSession'
import { requireIncidentsMeetingMinutes } from '@/lib/server/incidentsApiAuth'
import { getCalBlayLogoDataUrl } from '@/lib/server/calBlayLogo'
import { fetchIncidentsForMeetingMinutes } from '@/lib/server/incidentMeetingMinutesData'
import { sendOutlookTextMail } from '@/services/graph/calendar'
import { formatDateString } from '@/lib/formatDate'

export const runtime = 'nodejs'

const COLLECTION = 'incident_meeting_sessions'

async function findUserEmail(userId: string) {
  const directSnap = await firestoreAdmin.collection('users').doc(userId).get()
  if (directSnap.exists) {
    const email = String(directSnap.data()?.email || '').trim()
    if (email.includes('@')) return email
  }
  const byUserIdSnap = await firestoreAdmin.collection('users').where('userId', '==', userId).limit(1).get()
  if (!byUserIdSnap.empty) {
    const email = String(byUserIdSnap.docs[0].data()?.email || '').trim()
    if (email.includes('@')) return email
  }
  return ''
}

function buildEmailBody(input: {
  notes: string
  filtersFrom?: string
  filtersTo?: string
  attendanceSummary: string
}) {
  const period =
    input.filtersFrom && input.filtersTo
      ? `${formatDateString(input.filtersFrom) ?? input.filtersFrom} – ${formatDateString(input.filtersTo) ?? input.filtersTo}`
      : 'Sense període definit'

  return [
    'Acta de reunió d incidències',
    '',
    `Període del recull adjunt: ${period}`,
    '',
    'Notes de la reunió:',
    input.notes.trim() || '(sense notes)',
    '',
    'Assistència:',
    input.attendanceSummary,
    '',
    'Trobaràs adjunt el recull d incidències en format HTML (obrir i imprimir com a PDF des del navegador).',
  ].join('\n')
}

export async function POST(req: Request) {
  try {
    const auth = await requireIncidentsMeetingMinutes()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as { id?: string }
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const snap = await firestoreAdmin.collection(COLLECTION).doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Acta no trobada' }, { status: 404 })
    }

    const session = serializeMeetingSession(id, snap.data() as Record<string, unknown>)
    if (session.status !== 'finalized') {
      return NextResponse.json({ error: 'Cal finalitzar l acta abans d enviar' }, { status: 400 })
    }

    const from = String(session.incidentFilters.from || '').trim()
    const to = String(session.incidentFilters.to || '').trim()
    if (!from || !to) {
      return NextResponse.json({ error: 'Cal definir el període del recull' }, { status: 400 })
    }

    const recipients = session.attendees
      .filter(isMeetingEmailRecipient)
      .map((a) => ({
        email: a.email.trim().toLowerCase(),
        name: a.name.trim() || a.email,
      }))
      .filter((r) => r.email.includes('@'))

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No hi ha destinataris amb correu' }, { status: 400 })
    }

    const senderEmail =
      String(auth.user.email || '').trim() || (await findUserEmail(String(auth.user.id || '')))
    if (!senderEmail.includes('@')) {
      return NextResponse.json({ error: 'No s ha trobat el correu de l usuari que envia' }, { status: 400 })
    }

    const incidents = await fetchIncidentsForMeetingMinutes(session.incidentFilters)
    const now = new Date().toISOString()
    const generatedByLabel = String(auth.user.name || auth.user.email || '').trim()

    const logoSrc = getCalBlayLogoDataUrl() || '/logo.png'
    const html = buildIncidentsMeetingMinutesHtml({
      incidents: incidents as Incident[],
      filters: session.incidentFilters,
      meetingNotes: session.notes,
      generatedAtIso: now,
      generatedByLabel,
      logoSrc,
      attendance: activeMeetingAttendees(session.attendees).map((a) => ({
        name: a.name,
        email: a.email,
        attendance: a.attendance,
        absenceReason: a.absenceReason,
      })),
    })

    const actaAttendees = activeMeetingAttendees(session.attendees)
    const present = actaAttendees.filter((a) => a.attendance === 'in_person').map((a) => a.name)
    const online = actaAttendees.filter((a) => a.attendance === 'online').map((a) => a.name)
    const absent = actaAttendees
      .filter((a) => a.attendance === 'absent')
      .map((a) => `${a.name}${a.absenceReason ? ` (${a.absenceReason})` : ''}`)
    const attendanceSummary = [
      present.length ? `Present: ${present.join(', ')}` : '',
      online.length ? `Online: ${online.join(', ')}` : '',
      absent.length ? `Absent: ${absent.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const attachmentName = `acta-incidencies-${from}-${to}.html`
    const subject = `Acta reunió incidències (${formatDateString(from) ?? from} – ${formatDateString(to) ?? to})`

    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients: recipients,
      subject,
      bodyText: buildEmailBody({
        notes: session.notes,
        filtersFrom: from,
        filtersTo: to,
        attendanceSummary,
      }),
      attachments: [
        {
          name: attachmentName,
          contentType: 'text/html',
          contentBytesBase64: Buffer.from(html, 'utf8').toString('base64'),
        },
      ],
    })

    await firestoreAdmin.collection(COLLECTION).doc(id).update({
      emailSentAt: now,
      emailSentById: auth.user.id,
      emailSentByName: generatedByLabel,
      updatedAt: now,
    })

    return NextResponse.json(
      {
        ok: true,
        recipients: recipients.length,
        incidents: incidents.length,
        emailSentAt: now,
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[incidents/meeting-minutes/send POST]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error intern' },
      { status: 500 }
    )
  }
}
