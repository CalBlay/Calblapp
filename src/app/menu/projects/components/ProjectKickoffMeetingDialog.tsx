'use client'

import { type ProjectData } from './project-shared'
import type { ResponsibleOption } from './project-workspace-helpers'
import ProjectConvokeMeetingDialog from './ProjectConvokeMeetingDialog'

type Props = {
  open: boolean
  project: ProjectData
  kickoffAttendeeOptions: ResponsibleOption[]
  manualKickoffEmail: string
  kickoffReady: boolean
  sendingKickoff: boolean
  onOpenChange: (open: boolean) => void
  onKickoffFieldChange: <K extends keyof ProjectData['kickoff']>(
    field: K,
    value: ProjectData['kickoff'][K]
  ) => void
  onManualKickoffEmailChange: (value: string) => void
  onAddManualKickoffEmail: () => void
  onAddKickoffAttendeeFromUser: (user: {
    id: string
    name: string
    email: string
    department?: string
  }) => void
  onSendKickoff: () => Promise<boolean> | boolean
  onReopenKickoff?: () => void
  onRemoveKickoffAttendee: (key: string) => void
}

export default function ProjectKickoffMeetingDialog({
  open,
  project,
  kickoffAttendeeOptions,
  manualKickoffEmail,
  kickoffReady,
  sendingKickoff,
  onOpenChange,
  onKickoffFieldChange,
  onManualKickoffEmailChange,
  onAddManualKickoffEmail,
  onAddKickoffAttendeeFromUser,
  onSendKickoff,
  onRemoveKickoffAttendee,
}: Props) {
  const kickoffLocked = Boolean(
    String(project.kickoff.status || '').trim() || String(project.kickoff.graphWebLink || '').trim()
  )

  const kickoffMinDate =
    typeof project.createdAt === 'number' && project.createdAt > 0
      ? new Date(project.createdAt).toISOString().slice(0, 10)
      : undefined

  return (
    <ProjectConvokeMeetingDialog
      open={open}
      onOpenChange={onOpenChange}
      sending={sendingKickoff}
      canSend={kickoffReady}
      locked={kickoffLocked}
      minDate={kickoffMinDate}
      dialogTitle={kickoffLocked ? 'Reunió del projecte' : 'Crear reunió'}
      dialogSubtitle={`${project.name || 'Projecte'}${
        kickoffLocked ? ' · Convocatòria enviada' : ' · Reunió general del projecte'
      }`}
      attendeesHint="Assistents del projecte afegits automàticament. Pots treure o afegir-ne més."
      date={project.kickoff.date}
      startTime={project.kickoff.startTime}
      durationMinutes={project.kickoff.durationMinutes || 60}
      notes={project.kickoff.notes}
      attendees={project.kickoff.attendees}
      attendeeSearchOptions={kickoffAttendeeOptions}
      manualEmail={manualKickoffEmail}
      onDateChange={(value) => onKickoffFieldChange('date', value)}
      onStartTimeChange={(value) => onKickoffFieldChange('startTime', value)}
      onDurationChange={(value) => onKickoffFieldChange('durationMinutes', value)}
      onNotesChange={(value) => onKickoffFieldChange('notes', value)}
      onManualEmailChange={onManualKickoffEmailChange}
      onAddManualEmail={onAddManualKickoffEmail}
      onAddAttendeeFromUser={(user) =>
        onAddKickoffAttendeeFromUser({
          id: user.id,
          name: user.name,
          email: user.email,
          department: user.department,
        })
      }
      onRemoveAttendee={onRemoveKickoffAttendee}
      onSend={onSendKickoff}
    />
  )
}
