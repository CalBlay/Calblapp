export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessProjects, sessionToAccessUser } from '@/lib/projectAccess'
import { canConvokeProjectMeeting } from '@/lib/projectMeetingAccess'
import type {
  ProjectBlock,
  ProjectDocument,
  ProjectMeetingAttendee,
  ProjectMeetingRecord,
  ProjectTask,
} from '@/app/menu/projects/components/project-shared'
import {
  createProjectMeetingCalendarEvent,
  sendProjectMeetingNotificationEmail,
} from '@/services/graph/calendar'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
  email?: string | null
}

type MeetingAttendeeInput = {
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
  if (!canAccessProjects(sessionToAccessUser(user))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

function normalizeAttendees(input: MeetingAttendeeInput[]): ProjectMeetingAttendee[] {
  const seen = new Set<string>()
  const normalized: ProjectMeetingAttendee[] = []

  for (const item of input) {
    const email = String(item?.email || '').trim().toLowerCase()
    if (!email.includes('@')) continue
    const key = String(item?.key || `email:${email}`).trim() || `email:${email}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({
      key,
      department: String(item?.department || '').trim(),
      userId: String(item?.userId || '').trim(),
      name: String(item?.name || email).trim() || email,
      email,
    })
  }

  return normalized
}

async function uploadMeetingAttachment(file: File, projectId: string, scope: 'block' | 'task') {
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileName = file.name || `attachment-${Date.now()}`
  const safeName = fileName.replace(/\s+/g, '_')
  const path = `projects/${projectId}/meetings/${scope}/${Date.now()}-${safeName}`

  const bucket = storageAdmin.bucket()
  const fileRef = bucket.file(path)
  await fileRef.save(bytes, {
    contentType: file.type || 'application/octet-stream',
    resumable: false,
  })

  const [url] = await fileRef.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
  })

  return {
    id: `meeting-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: 'other',
    label: file.name || 'Adjunt',
    name: file.name || '',
    path,
    url,
    size: file.size,
    type: file.type || 'application/octet-stream',
  } satisfies Exclude<ProjectDocument, null>
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { id } = await params
    const form = await req.formData()
    const body = {
      scope: String(form.get('scope') || '').trim() as 'block' | 'task',
      blockId: String(form.get('blockId') || '').trim(),
      taskId: String(form.get('taskId') || '').trim(),
      date: String(form.get('date') || '').trim(),
      startTime: String(form.get('startTime') || '').trim(),
      durationMinutes: Number(form.get('durationMinutes') || 0),
      notes: String(form.get('notes') || '').trim(),
      attendees: (() => {
        try {
          const raw = String(form.get('attendees') || '[]')
          return JSON.parse(raw) as MeetingAttendeeInput[]
        } catch {
          return []
        }
      })(),
    }

    const projectSnap = await db.collection('projects').doc(id).get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Projecte no trobat' }, { status: 404 })
    }

    const project = projectSnap.data() as {
      name?: string
      owner?: string
      ownerUserId?: string
      sponsor?: string
      createdById?: string
      blocks?: ProjectBlock[]
    }
    const scope = body.scope === 'task' ? 'task' : 'block'
    const blockId = String(body.blockId || '').trim()
    const taskId = String(body.taskId || '').trim()
    const date = String(body.date || '').trim()
    const startTime = String(body.startTime || '').trim()
    const durationMinutes = Number(body.durationMinutes || 0)
    const notes = String(body.notes || '').trim()
    const attendees = normalizeAttendees(Array.isArray(body.attendees) ? body.attendees : [])
    const uploadedAttachments = (
      await Promise.all(
        form
          .getAll('attachments')
          .filter((entry): entry is File => entry instanceof File && entry.size > 0)
          .map((file) => uploadMeetingAttachment(file, id, scope))
      )
    ).filter(Boolean)

    if (!blockId || !date || !startTime || durationMinutes <= 0) {
      return NextResponse.json({ error: 'Falten dades de la convocatoria' }, { status: 400 })
    }

    if (scope === 'task' && !taskId) {
      return NextResponse.json({ error: 'Falta la tasca de la convocatoria' }, { status: 400 })
    }

    if (attendees.length === 0) {
      return NextResponse.json({ error: 'No hi ha assistents seleccionats' }, { status: 400 })
    }

    const blocks = Array.isArray(project.blocks) ? project.blocks : []
    const block = blocks.find((item) => String(item.id || '').trim() === blockId)
    if (!block) {
      return NextResponse.json({ error: 'Bloc no trobat' }, { status: 404 })
    }

    const task =
      scope === 'task'
        ? (Array.isArray(block.tasks)
            ? block.tasks.find((item) => String(item.id || '').trim() === taskId)
            : null) || null
        : null

    if (scope === 'task' && !task) {
      return NextResponse.json({ error: 'Tasca no trobada' }, { status: 404 })
    }

    if (
      !canConvokeProjectMeeting(auth.user, project, scope, blockId, scope === 'task' ? taskId : undefined)
    ) {
      return NextResponse.json(
        { error: 'No tens permisos per convocar aquesta reunio' },
        { status: 403 }
      )
    }

    const organizerSnap = await db.collection('users').doc(auth.user.id).get()
    const organizerData = organizerSnap.exists
      ? (organizerSnap.data() as Record<string, unknown>)
      : {}
    const organizerEmail = String(organizerData.email || auth.user.email || '').trim()

    if (!organizerEmail) {
      return NextResponse.json(
        { error: 'L usuari que crea la convocatoria no te email corporatiu' },
        { status: 400 }
      )
    }

    const { startDateTime, endDateTime } = combineDateTime(date, startTime, durationMinutes)
    const projectName = String(project.name || 'Projecte').trim() || 'Projecte'
    const blockName = String(block.name || 'Bloc').trim() || 'Bloc'
    const scopeName =
      scope === 'task'
        ? String((task as ProjectTask).title || 'Tasca').trim() || 'Tasca'
        : blockName

    const subject =
      scope === 'task'
        ? `Reunio tasca · ${scopeName} · ${projectName}`
        : `Reunio bloc · ${scopeName} · ${projectName}`

    const event = await createProjectMeetingCalendarEvent({
      organizerEmail,
      subject,
      startDateTime,
      endDateTime,
      notes,
      attendees: attendees.map((item) => ({
        email: item.email,
        name: item.name,
      })),
      projectName,
      scope,
      scopeName,
      blockName: scope === 'task' ? blockName : undefined,
      attachments: uploadedAttachments.map((item) => ({
        name: item.name || item.label || 'Adjunt',
        path: item.path || '',
        contentType: item.type || null,
      })),
    })

    let emailWarning = ''
    try {
      await sendProjectMeetingNotificationEmail({
        organizerEmail,
        recipients: attendees.map((item) => ({
          email: item.email,
          name: item.name,
        })),
        subject: `Convocatoria reunio · ${scopeName} · ${projectName}`,
        projectName,
        startDateTime,
        endDateTime,
        notes,
        scope,
        scopeName,
        blockName: scope === 'task' ? blockName : undefined,
        attachments: uploadedAttachments.map((item) => ({
          name: item.name || item.label || 'Adjunt',
          path: item.path || '',
          contentType: item.type || null,
        })),
      })
    } catch (err: unknown) {
      emailWarning =
        err instanceof Error ? err.message : 'No s ha pogut enviar el correu de convocatoria'
    }

    const meeting: ProjectMeetingRecord = {
      id: `meeting-${Date.now()}`,
      scope,
      title: scopeName,
      date,
      startTime,
      durationMinutes,
      notes,
      attendees,
      organizerEmail,
      organizerUserId: auth.user.id,
      attachments: uploadedAttachments,
      invitedAt: Date.now(),
      graphEventId: event.id,
      graphWebLink: event.webLink,
      graphJoinUrl: event.joinUrl,
      status: 'scheduled',
      emailNotificationStatus: emailWarning ? 'failed' : 'sent',
      emailNotificationError: emailWarning,
    }

    const nextBlocks = blocks.map((currentBlock) => {
      if (String(currentBlock.id || '').trim() !== blockId) return currentBlock

      if (scope === 'block') {
        return {
          ...currentBlock,
          meetings: [...(Array.isArray(currentBlock.meetings) ? currentBlock.meetings : []), meeting],
        }
      }

      return {
        ...currentBlock,
        tasks: (Array.isArray(currentBlock.tasks) ? currentBlock.tasks : []).map((currentTask) =>
          String(currentTask.id || '').trim() === taskId
            ? {
                ...currentTask,
                meetings: [...(Array.isArray(currentTask.meetings) ? currentTask.meetings : []), meeting],
              }
            : currentTask
        ),
      }
    })

    await db.collection('projects').doc(id).set(
      {
        blocks: nextBlocks,
        updatedAt: Date.now(),
        updatedById: auth.user.id,
        updatedByName: auth.user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({
      success: true,
      meeting,
      blocks: nextBlocks,
      warning: emailWarning,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
