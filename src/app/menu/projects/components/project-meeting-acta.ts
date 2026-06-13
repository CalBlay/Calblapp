import type { KickoffData, ProjectData, ProjectMeetingRecord } from './project-shared'

export type MeetingActaUser = {
  id?: string
  name?: string
  email?: string
}

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase()

export function isUserMeetingOrganizer(
  user: MeetingActaUser,
  record?: Pick<ProjectMeetingRecord, 'organizerUserId' | 'organizerEmail'> | Pick<KickoffData, 'organizerUserId' | 'organizerEmail'>
) {
  if (!record) return false
  const userId = String(user.id || '').trim()
  const userEmail = normalizeEmail(user.email)
  const organizerUserId = String(record.organizerUserId || '').trim()
  const organizerEmail = normalizeEmail(record.organizerEmail)

  if (userId && organizerUserId && userId === organizerUserId) return true
  if (userEmail && organizerEmail && userEmail === organizerEmail) return true
  return false
}

export function isKickoffOrganizer(user: MeetingActaUser, kickoff: KickoffData) {
  const hasKickoffMeeting = Boolean(
    String(kickoff.graphWebLink || kickoff.graphEventId || kickoff.status || '').trim()
  )
  if (!hasKickoffMeeting) return false
  if (isUserMeetingOrganizer(user, kickoff)) return true

  const author = String(user.name || '').trim()
  const minutesAuthor = String(kickoff.minutesAuthor || '').trim()
  return Boolean(author && minutesAuthor && author === minutesAuthor)
}

export function canOpenMeetingActaInBlocks(user: MeetingActaUser, project: ProjectData) {
  if (isKickoffOrganizer(user, project.kickoff)) return true
  return project.blocks.some((block) =>
    (block.meetings || []).some((meeting) => isUserMeetingOrganizer(user, meeting))
  )
}

export function canOpenMeetingActaInTasks(user: MeetingActaUser, project: ProjectData) {
  return project.blocks.some((block) =>
    (block.tasks || []).some((task) =>
      (task.meetings || []).some((meeting) => isUserMeetingOrganizer(user, meeting))
    )
  )
}

export function canOpenMeetingActaForScope(
  user: MeetingActaUser,
  project: ProjectData,
  scope: 'kickoff' | 'block' | 'task',
  options?: { blockId?: string; taskId?: string; meetingId?: string }
) {
  if (scope === 'kickoff') return isKickoffOrganizer(user, project.kickoff)

  if (scope === 'block' && options?.blockId) {
    const block = project.blocks.find((item) => item.id === options.blockId)
    const meetings = block?.meetings || []
    if (options.meetingId) {
      const meeting = meetings.find((item) => item.id === options.meetingId)
      return isUserMeetingOrganizer(user, meeting)
    }
    return meetings.some((meeting) => isUserMeetingOrganizer(user, meeting))
  }

  if (scope === 'task' && options?.blockId && options?.taskId) {
    const block = project.blocks.find((item) => item.id === options.blockId)
    const task = block?.tasks.find((item) => item.id === options.taskId)
    const meetings = task?.meetings || []
    if (options.meetingId) {
      const meeting = meetings.find((item) => item.id === options.meetingId)
      return isUserMeetingOrganizer(user, meeting)
    }
    return meetings.some((meeting) => isUserMeetingOrganizer(user, meeting))
  }

  return false
}
