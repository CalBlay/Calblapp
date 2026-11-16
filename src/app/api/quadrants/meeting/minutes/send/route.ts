import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireQuadrantsMeetingMinutes } from '@/lib/server/quadrantsReadAuth'
import { QUADRANTS_MEETING_MINUTES_COLLECTION } from '@/lib/quadrantsWeeklyMeeting'
import type { WeeklyMeetingRow } from '@/lib/quadrantsWeeklyMeeting'
import {
  normalizeMeetingAttendance,
  type IncidentMeetingAttendee,
} from '@/lib/incidentMeetingSession'
import { sendOutlookTextMail } from '@/services/graph/calendar'

export const runtime = 'nodejs'

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

function formatDay(value: string) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function parseAttendees(raw: unknown): IncidentMeetingAttendee[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const item = row as Record<string, unknown>
    return {
      key: String(item.key || ''),
      userId: String(item.userId || ''),
      name: String(item.name || item.email || ''),
      email: String(item.email || '').trim().toLowerCase(),
      department: String(item.department || ''),
      attendance: normalizeMeetingAttendance(item),
      absenceReason: String(item.absenceReason || ''),
      receiveEmail: item.receiveEmail === false ? false : true,
    }
  })
}

function attendanceLabel(attendee: IncidentMeetingAttendee) {
  if (attendee.attendance === 'in_person') return 'Presencial'
  if (attendee.attendance === 'online') return 'En línia'
  if (attendee.attendance === 'absent') {
    return `Absent${attendee.absenceReason ? ` · ${attendee.absenceReason}` : ''}`
  }
  return 'Pendent'
}

function departmentComment(row: WeeklyMeetingRow, department: 'serveis' | 'logistica' | 'cuina') {
  const stored = row.departmentComments?.[department]
  if (stored?.text) return stored.text
  if (department === 'serveis') return row.meetingComment || ''
  return ''
}

function decisionLabel(row: WeeklyMeetingRow, department: 'logistica' | 'cuina') {
  const decision = row[department]
  if (!decision?.required) return 'NO VA'
  return decision.arrivalTime || 'SÍ · hora pendent'
}

function buildMinutesHtml(input: {
  weekStart: string
  weekEnd: string
  notes: string
  rows: WeeklyMeetingRow[]
  attendees: IncidentMeetingAttendee[]
  finalizedByName: string
}) {
  const rowsHtml = input.rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(formatDay(row.eventDay))}</strong>${row.eventCode ? `<br><small>Codi: ${escapeHtml(row.eventCode)}</small>` : ''}${row.servicesResponsible ? `<br><strong>${escapeHtml(row.servicesResponsible)}</strong>` : ''}</td>
      <td><strong>${escapeHtml(row.location || 'Ubicació pendent')}</strong>${row.eventName ? `<br><small>${escapeHtml(row.eventName)}</small>` : ''}${row.servicesSetup ? `<br><strong>Muntatge: ${escapeHtml(row.servicesSetup).replaceAll('\n', '<br>Muntatge: ')}</strong>` : ''}${row.servicesTeam ? `<br><small>${escapeHtml(row.servicesTeam).replaceAll('\n', '<br>')}</small>` : ''}</td>
      <td>${escapeHtml(row.pax)}</td>
      <td>${escapeHtml(row.scheduleNotes || row.eventSchedule).replaceAll('\n', '<br>')}</td>
      <td>${escapeHtml(departmentComment(row, 'serveis')).replaceAll('\n', '<br>')}</td>
      <td>${escapeHtml(departmentComment(row, 'logistica')).replaceAll('\n', '<br>')}<hr>${escapeHtml(decisionLabel(row, 'logistica'))}</td>
      <td>${escapeHtml(departmentComment(row, 'cuina')).replaceAll('\n', '<br>')}<hr>${escapeHtml(decisionLabel(row, 'cuina'))}</td>
    </tr>`).join('')
  const attendanceHtml = input.attendees.map((attendee) => `
    <tr><td>${escapeHtml(attendee.name)}</td><td>${escapeHtml(attendee.department || '—')}</td><td>${escapeHtml(attendanceLabel(attendee))}</td><td>${attendee.receiveEmail === false ? 'No' : 'Sí'}</td></tr>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Acta reunió de quadrants</title>
    <style>body{font-family:Arial,sans-serif;color:#172033;padding:24px;font-size:10px}h1{font-size:20px;margin:0 0 5px}.meta{color:#64748b;margin-bottom:18px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:6px;vertical-align:top}th{background:#111827;color:white;text-align:left}hr{border:0;border-top:1px solid #cbd5e1;margin:7px 0}.section{margin-top:20px}.notes{white-space:pre-wrap;border:1px solid #cbd5e1;padding:12px}@page{size:A4 landscape;margin:12mm}</style>
    </head><body><h1>Acta de reunió setmanal de quadrants</h1>
    <div class="meta">Període del ${escapeHtml(formatDay(input.weekStart))} al ${escapeHtml(formatDay(input.weekEnd))}${input.finalizedByName ? ` · Tancada per ${escapeHtml(input.finalizedByName)}` : ''}</div>
    <table><thead><tr><th>DIA</th><th>LLOC / SERVEIS</th><th>PAX</th><th>HORARI</th><th>OBS. SERVEIS</th><th>LOGÍSTICA</th><th>CUINA</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="section"><h2>Assistència</h2><table><thead><tr><th>Nom</th><th>Departament</th><th>Assistència</th><th>Rep correu</th></tr></thead><tbody>${attendanceHtml}</tbody></table></div>
    <div class="section"><h2>Observacions generals</h2><div class="notes">${escapeHtml(input.notes)}</div></div>
    </body></html>`
}

async function findUserEmail(userId: string) {
  const direct = await firestoreAdmin.collection('users').doc(userId).get()
  const email = direct.exists ? String(direct.data()?.email || '').trim() : ''
  return email.includes('@') ? email : ''
}

export async function POST(req: Request) {
  try {
    const auth = await requireQuadrantsMeetingMinutes()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as { id?: string }
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const ref = firestoreAdmin.collection(QUADRANTS_MEETING_MINUTES_COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Acta no trobada' }, { status: 404 })

    const data = snap.data() as Record<string, unknown>
    if (data.status !== 'finalized') {
      return NextResponse.json({ error: 'Cal finalitzar la reunió abans d’enviar l’acta' }, { status: 400 })
    }

    const attendees = parseAttendees(data.attendees)
    const recipients = attendees
      .filter((attendee) => attendee.receiveEmail !== false)
      .map((attendee) => ({ email: attendee.email, name: attendee.name }))
      .filter((recipient) => recipient.email.includes('@'))
    if (!recipients.length) {
      return NextResponse.json({ error: 'No hi ha destinataris amb correu seleccionats' }, { status: 400 })
    }

    const senderEmail = String(auth.user.email || '').trim() || await findUserEmail(String(auth.user.id || ''))
    if (!senderEmail.includes('@')) {
      return NextResponse.json({ error: 'No s’ha trobat el correu de l’usuari que envia' }, { status: 400 })
    }

    const weekStart = String(data.weekStart || '')
    const weekEnd = String(data.weekEnd || '')
    const html = buildMinutesHtml({
      weekStart,
      weekEnd,
      notes: String(data.notes || ''),
      rows: Array.isArray(data.rows) ? data.rows as WeeklyMeetingRow[] : [],
      attendees,
      finalizedByName: String(data.finalizedByName || ''),
    })
    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients: recipients,
      subject: `Acta reunió de Quadrants (${formatDay(weekStart)} – ${formatDay(weekEnd)})`,
      bodyText: [
        'Acta de reunió setmanal de Quadrants',
        '',
        `Període: ${formatDay(weekStart)} – ${formatDay(weekEnd)}`,
        '',
        'S’adjunta l’acta amb totes les observacions i l’assistència.',
      ].join('\n'),
      attachments: [{
        name: `acta-quadrants-${weekStart}-${weekEnd}.html`,
        contentType: 'text/html',
        contentBytesBase64: Buffer.from(html, 'utf8').toString('base64'),
      }],
    })

    const now = new Date().toISOString()
    await ref.update({
      emailSentAt: now,
      emailSentById: auth.user.id,
      emailSentByName: String(auth.user.name || auth.user.email || ''),
      updatedAt: now,
    })
    return NextResponse.json({ ok: true, recipients: recipients.length, emailSentAt: now })
  } catch (error) {
    console.error('[quadrants/meeting/minutes/send POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut enviar l’acta' },
      { status: 500 }
    )
  }
}
