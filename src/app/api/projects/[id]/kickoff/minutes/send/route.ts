export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import { buildProjectMeetingMinutesHtml } from '@/lib/projectMeetingMinutes'
import { getCalBlayLogoDataUrl } from '@/lib/server/calBlayLogo'
import { sendOutlookTextMail } from '@/services/graph/calendar'
import { formatDateString } from '@/lib/formatDate'
import type { KickoffAttendee, KickoffData, ProjectData } from '@/app/menu/projects/components/project-shared'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
  email?: string | null
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = session.user as SessionUser
  if (!canAccessProjects({ role: user.role, department: user.department ?? undefined })) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

async function findUserEmail(userId: string) {
  const directSnap = await db.collection('users').doc(userId).get()
  if (directSnap.exists) {
    const email = String(directSnap.data()?.email || '').trim()
    if (email.includes('@')) return email
  }
  return ''
}

function attendanceSummary(attendees: KickoffAttendee[]) {
  if (!attendees.length) return 'Sense assistents'
  return attendees
    .map((attendee) => {
      const label =
        attendee.attended === false
          ? 'No ha assistit'
          : attendee.attended === true
            ? 'Ha assistit'
            : 'Sense registrar'
      return `· ${attendee.name || attendee.email}: ${label}`
    })
    .join('\n')
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const projectSnap = await db.collection('projects').doc(id).get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const raw = projectSnap.data() as Record<string, unknown>
    const kickoff =
      raw.kickoff && typeof raw.kickoff === 'object' ? (raw.kickoff as KickoffData) : ({} as KickoffData)

    if (kickoff.minutesStatus !== 'closed') {
      return NextResponse.json({ error: "Cal finalitzar l'acta abans d'enviar" }, { status: 400 })
    }

    const minutes = String(kickoff.minutes || '').trim()
    if (!minutes) {
      return NextResponse.json({ error: "L'acta no té contingut" }, { status: 400 })
    }

    const attendees = Array.isArray(kickoff.attendees) ? kickoff.attendees : []
    const recipients = attendees
      .map((attendee) => ({
        email: String(attendee.email || '').trim().toLowerCase(),
        name: String(attendee.name || attendee.email || '').trim(),
      }))
      .filter((item) => item.email.includes('@'))

    if (!recipients.length) {
      return NextResponse.json({ error: 'No hi ha destinataris amb correu' }, { status: 400 })
    }

    const senderEmail =
      String(auth.user.email || '').trim() || (await findUserEmail(String(auth.user.id || '')))
    if (!senderEmail.includes('@')) {
      return NextResponse.json({ error: "No s'ha trobat el correu de l'usuari que envia" }, { status: 400 })
    }

    const project = {
      name: String(raw.name || ''),
      launchDate: String(raw.launchDate || ''),
      kickoff,
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    } as Pick<ProjectData, 'name' | 'launchDate' | 'kickoff' | 'blocks'>

    const now = new Date().toISOString()
    const generatedByLabel = String(auth.user.name || auth.user.email || '').trim()
    const logoSrc = getCalBlayLogoDataUrl() || '/logo.png'
    const html = buildProjectMeetingMinutesHtml({
      project,
      meetingNotes: minutes,
      generatedAtIso: now,
      generatedByLabel,
      logoSrc,
    })

    const meetingDate = kickoff.date
      ? formatDateString(kickoff.date) ?? kickoff.date
      : 'Sense data'

    const body = [
      `Acta de reunió · ${project.name || 'Projecte'}`,
      '',
      `Data reunió: ${meetingDate}`,
      '',
      'Notes de la reunió:',
      minutes,
      '',
      'Assistència:',
      attendanceSummary(attendees),
      '',
      "Trobaràs adjunt el recull de blocs i tasques en format HTML (obrir i imprimir com a PDF des del navegador).",
    ].join('\n')

    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients: recipients,
      subject: `Acta reunió · ${project.name || 'Projecte'}`,
      bodyText: body,
      attachments: [
        {
          name: `acta-projecte-${id}.html`,
          contentType: 'text/html',
          contentBytesBase64: Buffer.from(html, 'utf8').toString('base64'),
        },
      ],
    })

    return NextResponse.json({ ok: true, recipients: recipients.length })
  } catch (e) {
    console.error('[projects/kickoff/minutes/send POST]', e)
    return NextResponse.json({ error: "No s'ha pogut enviar l'acta" }, { status: 500 })
  }
}
