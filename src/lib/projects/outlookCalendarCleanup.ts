export type ProjectOutlookCalendarRef = {
  email: string
  eventId: string
}

const trimText = (value: unknown) => String(value || '').trim()

function pushCalendarRef(
  out: ProjectOutlookCalendarRef[],
  seen: Set<string>,
  email: unknown,
  eventId: unknown
) {
  const nextEmail = trimText(email)
  const nextEventId = trimText(eventId)
  if (!nextEmail || !nextEventId) return

  const key = `${nextEmail.toLowerCase()}::${nextEventId}`
  if (seen.has(key)) return
  seen.add(key)
  out.push({ email: nextEmail, eventId: nextEventId })
}

function collectMeetingCalendarRefs(
  meetings: unknown,
  out: ProjectOutlookCalendarRef[],
  seen: Set<string>
) {
  if (!Array.isArray(meetings)) return
  for (const meeting of meetings) {
    if (!meeting || typeof meeting !== 'object') continue
    const record = meeting as Record<string, unknown>
    pushCalendarRef(out, seen, record.organizerEmail, record.graphEventId)
  }
}

export function collectProjectOutlookCalendarRefs(
  project: Record<string, unknown> | null | undefined
): ProjectOutlookCalendarRef[] {
  const out: ProjectOutlookCalendarRef[] = []
  const seen = new Set<string>()
  if (!project || typeof project !== 'object') return out

  const kickoff = project.kickoff
  if (kickoff && typeof kickoff === 'object') {
    const record = kickoff as Record<string, unknown>
    pushCalendarRef(out, seen, record.organizerEmail, record.graphEventId)
  }

  const blocks = Array.isArray(project.blocks) ? project.blocks : []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    pushCalendarRef(out, seen, record.outlookEventEmail, record.outlookEventId)
    collectMeetingCalendarRefs(record.meetings, out, seen)

    const tasks = Array.isArray(record.tasks) ? record.tasks : []
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue
      const taskRecord = task as Record<string, unknown>
      pushCalendarRef(out, seen, taskRecord.outlookEventEmail, taskRecord.outlookEventId)
      collectMeetingCalendarRefs(taskRecord.meetings, out, seen)
    }
  }

  return out
}
