export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import {
  createKickoffCalendarEvent,
  sendKickoffNotificationEmail,
} from '@/services/graph/calendar'
import { deriveProjectPhase } from '@/app/menu/projects/components/project-shared'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
  email?: string | null
}

type KickoffAttendeeInput = {
  key?: string
  department?: string
  userId?: string
  name?: string
  email?: string
}

function combineDateTime(date: string, time: string, durationMinutes: number) {
  const start = new Date(`${date}T${time}:00`)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  return {
    startDateTime: `${date}T${time}:00`,
    endDateTime: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
      end.getDate()
    ).padStart(2, '0')}T${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}:00`,
  }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = session.user as SessionUser
  if (!canAccessProjects(user)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const body = (await req.json()) as {
      date?: string
      startTime?: string
      durationMinutes?: number
      notes?: string
      excludedKeys?: string[]
      attendees?: KickoffAttendeeInput[]
    }

    const date = String(body.date || '').trim()
    const startTime = String(body.startTime || '').trim()
    const durationMinutes = Number(body.durationMinutes || 0)
    const notes = String(body.notes || '').trim()
    const attendees = (Array.isArray(body.attendees) ? body.attendees : [])
      .map((item) => ({
        key: String(item?.key || '').trim(),
        department: String(item?.department || '').trim(),
        userId: String(item?.userId || '').trim(),
        name: String(item?.name || '').trim(),
        email: String(item?.email || '').trim().toLowerCase(),
      }))
      .filter((item) => item.email.includes('@'))
    const excludedKeys = Array.isArray(body.excludedKeys)
      ? body.excludedKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : Array.isArray(currentKickoff.excludedKeys)
        ? currentKickoff.excludedKeys.map((item) => String(item || '').trim()).filter(Boolean)
        : []

    if (!date || !startTime || !durationMinutes) {
      return NextResponse.json({ error: 'Falten data, hora o duracio del kickoff' }, { status: 400 })
    }

    if (attendees.length === 0) {
      return NextResponse.json({ error: 'No hi ha assistents seleccionats' }, { status: 400 })
    }

    const projectSnap = await db.collection('projects').doc(id).get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const project = projectSnap.data() as Record<string, unknown>
    const currentKickoff =
      project.kickoff && typeof project.kickoff === 'object'
        ? (project.kickoff as Record<string, unknown>)
        : {}
    const organizerSnap = await db.collection('users').doc(auth.user.id).get()
    const organizerData = organizerSnap.exists ? (organizerSnap.data() as Record<string, unknown>) : {}
    const organizerEmail = String(organizerData.email || auth.user.email || '').trim()

    if (!organizerEmail) {
      return NextResponse.json(
        { error: 'L usuari que crea la convocatoria no te email corporatiu' },
        { status: 400 }
      )
    }

    const { startDateTime, endDateTime } = combineDateTime(date, startTime, durationMinutes)
    const projectName = String(project.name || 'Projecte')

    const event = await createKickoffCalendarEvent({
      organizerEmail,
      subject: `Kickoff · ${projectName}`,
      startDateTime,
      endDateTime,
      notes,
      attendees: attendees.map((item) => ({
        email: item.email,
        name: item.name,
      })),
      projectName,
    })

    let emailWarning = ''
    try {
      await sendKickoffNotificationEmail({
        organizerEmail,
        recipients: attendees.map((item) => ({
          email: item.email,
          name: item.name,
        })),
        subject: `Convocatoria Kickoff · ${projectName}`,
        projectName,
        startDateTime,
        endDateTime,
        notes,
      })
    } catch (err: unknown) {
      emailWarning =
        err instanceof Error ? err.message : 'No s ha pogut enviar el correu de convocatoria'
    }

    const kickoff = {
      date,
      startTime,
      durationMinutes,
      notes,
      minutes: String(currentKickoff.minutes || ''),
      minutesStatus:
        currentKickoff.minutesStatus === 'closed' ? 'closed' : 'open',
      minutesAuthor: String(currentKickoff.minutesAuthor || ''),
      minutesClosedAt: String(currentKickoff.minutesClosedAt || ''),
      minutesUpdatedAt: String(currentKickoff.minutesUpdatedAt || ''),
      excludedKeys,
      attendees,
      organizerEmail,
      invitedAt: Date.now(),
      graphEventId: event.id,
      graphWebLink: event.webLink,
      graphJoinUrl: event.joinUrl,
      status: 'scheduled',
      emailNotificationStatus: emailWarning ? 'failed' : 'sent',
      emailNotificationError: emailWarning,
    }

    await db.collection('projects').doc(id).set(
      {
        kickoff,
        status: '',
        phase: deriveProjectPhase({
          launchDate: String(project.launchDate || ''),
          kickoff,
          blocks: Array.isArray(project.blocks) ? project.blocks : [],
        }),
        updatedAt: Date.now(),
        updatedById: auth.user.id,
        updatedByName: auth.user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({ success: true, kickoff, warning: emailWarning })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
