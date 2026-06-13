'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ResponsibleOption } from './project-workspace-helpers'
import type { ProjectMeetingTarget } from './useProjectMeetings'
import ProjectConvokeMeetingDialog, {
  type ConvokeMeetingAttendee,
} from './ProjectConvokeMeetingDialog'

type Props = {
  open: boolean
  sending?: boolean
  target: ProjectMeetingTarget | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: {
    scope: 'block' | 'task'
    blockId: string
    taskId?: string
    date: string
    startTime: string
    durationMinutes: number
    notes: string
    attachments?: File[]
    attendees: ConvokeMeetingAttendee[]
  }) => Promise<boolean> | boolean
}

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

const attendeeKey = (option: ResponsibleOption) =>
  option.id ? `user:${option.id}` : `email:${option.email.trim().toLowerCase()}`

const attendeeFromOption = (option: ResponsibleOption): ConvokeMeetingAttendee => ({
  key: attendeeKey(option),
  department: String(option.department || '').trim(),
  userId: String(option.id || '').trim(),
  name: String(option.name || '').trim(),
  email: String(option.email || '').trim().toLowerCase(),
})

export default function ProjectMeetingDialog({
  open,
  sending = false,
  target,
  onOpenChange,
  onSubmit,
}: Props) {
  const [date, setDate] = useState(todayKey())
  const [startTime, setStartTime] = useState('09:00')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [notes, setNotes] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [attendees, setAttendees] = useState<ConvokeMeetingAttendee[]>([])
  const [attachments, setAttachments] = useState<File[]>([])

  useEffect(() => {
    if (!open || !target) return
    setDate(todayKey())
    setStartTime('09:00')
    setDurationMinutes(60)
    setNotes('')
    setManualEmail('')
    setAttachments([])
    setAttendees(
      target.options
        .filter((option) => target.defaultSelectedKeys.includes(attendeeKey(option)))
        .map(attendeeFromOption)
    )
  }, [open, target])

  const attendeeSearchOptions = useMemo(() => {
    const keys = new Set(attendees.map((item) => item.key))
    const emails = new Set(attendees.map((item) => item.email))
    return (target?.options || []).filter((option) => {
      const key = attendeeKey(option)
      const email = String(option.email || '').trim().toLowerCase()
      return !keys.has(key) && !emails.has(email)
    })
  }, [attendees, target])

  const addAttendeeFromUser = (user: ResponsibleOption) => {
    const item = attendeeFromOption(user)
    setAttendees((current) => {
      if (current.some((entry) => entry.key === item.key || entry.email === item.email)) {
        return current
      }
      return [...current, item]
    })
  }

  const addManualEmail = () => {
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    const key = `email:${email}`
    setAttendees((current) => {
      if (current.some((entry) => entry.key === key || entry.email === email)) return current
      return [
        ...current,
        {
          key,
          department: 'Manual',
          userId: '',
          name: email,
          email,
        },
      ]
    })
    setManualEmail('')
  }

  const removeAttendee = (key: string) => {
    setAttendees((current) => current.filter((item) => item.key !== key))
  }

  const appendAttachments = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setAttachments((current) => {
      const next = [...current]
      Array.from(files).forEach((file) => {
        const exists = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        )
        if (!exists) next.push(file)
      })
      return next
    })
  }

  const removeAttachment = (targetFile: File) => {
    setAttachments((current) =>
      current.filter(
        (file) =>
          !(
            file.name === targetFile.name &&
            file.size === targetFile.size &&
            file.lastModified === targetFile.lastModified
          )
      )
    )
  }

  const canSubmit =
    Boolean(target) &&
    Boolean(date) &&
    Boolean(startTime) &&
    durationMinutes > 0 &&
    attendees.length > 0

  const dialogSubtitle = target
    ? `${target.scope === 'task' ? 'Tasca' : 'Bloc'}: ${target.title}${
        target.subtitle ? ` · ${target.subtitle}` : ''
      }`
    : ''

  const attendeesHint =
    target?.scope === 'task'
      ? 'Responsables de la tasca i participants del bloc convocats per defecte. Pots treure o afegir-ne més.'
      : 'Responsables del bloc i participants convocats per defecte. Pots treure o afegir-ne més.'

  return (
    <ProjectConvokeMeetingDialog
      open={open}
      onOpenChange={onOpenChange}
      sending={sending}
      canSend={canSubmit}
      dialogTitle="Crear reunió"
      dialogSubtitle={dialogSubtitle}
      attendeesHint={attendeesHint}
      date={date}
      startTime={startTime}
      durationMinutes={durationMinutes}
      notes={notes}
      attendees={attendees}
      attendeeSearchOptions={attendeeSearchOptions}
      manualEmail={manualEmail}
      onDateChange={setDate}
      onStartTimeChange={setStartTime}
      onDurationChange={setDurationMinutes}
      onNotesChange={setNotes}
      onManualEmailChange={setManualEmail}
      onAddManualEmail={addManualEmail}
      onAddAttendeeFromUser={addAttendeeFromUser}
      onRemoveAttendee={removeAttendee}
      showAttachments
      attachments={attachments}
      onAppendAttachments={appendAttachments}
      onRemoveAttachment={removeAttachment}
      closeLabel="Cancel·lar"
      onSend={async () => {
        if (!target || !canSubmit) return false
        return onSubmit({
          scope: target.scope,
          blockId: target.blockId,
          taskId: target.taskId,
          date,
          startTime,
          durationMinutes,
          notes,
          attachments,
          attendees,
        })
      }}
    />
  )
}
