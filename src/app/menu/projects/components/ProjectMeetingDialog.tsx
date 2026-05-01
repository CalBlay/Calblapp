'use client'

import { useEffect, useMemo, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ResponsibleOption } from './project-workspace-helpers'

type MeetingTarget = {
  scope: 'block' | 'task'
  blockId: string
  taskId?: string
  title: string
  subtitle?: string
  options: ResponsibleOption[]
  defaultSelectedKeys: string[]
}

type Props = {
  open: boolean
  sending?: boolean
  target: MeetingTarget | null
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
    attendees: Array<{
      key: string
      department: string
      userId: string
      name: string
      email: string
    }>
  }) => Promise<void> | void
}

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

const attendeeKey = (option: ResponsibleOption) =>
  option.id ? `user:${option.id}` : `email:${option.email.trim().toLowerCase()}`

export default function ProjectMeetingDialog({
  open,
  sending = false,
  target,
  onOpenChange,
  onSubmit,
}: Props) {
  const [date, setDate] = useState(todayKey())
  const [startTime, setStartTime] = useState('09:00')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [notes, setNotes] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [manualAttendees, setManualAttendees] = useState<
    Array<{ key: string; department: string; userId: string; name: string; email: string }>
  >([])

  useEffect(() => {
    if (!open || !target) return
    setDate(todayKey())
    setStartTime('09:00')
    setDurationMinutes('60')
    setNotes('')
    setManualEmail('')
    setAttachments([])
    setManualAttendees([])
    setSelectedKeys(target.defaultSelectedKeys)
  }, [open, target])

  const allAttendees = useMemo(() => {
    const base = (target?.options || []).map((option) => ({
      key: attendeeKey(option),
      department: String(option.department || '').trim(),
      userId: String(option.id || '').trim(),
      name: String(option.name || '').trim(),
      email: String(option.email || '').trim().toLowerCase(),
    }))
    return [...base, ...manualAttendees].filter(
      (item, index, array) =>
        item.email.includes('@') &&
        array.findIndex((candidate) => candidate.key === item.key) === index
    )
  }, [manualAttendees, target])

  const selectedAttendees = useMemo(
    () => allAttendees.filter((item) => selectedKeys.includes(item.key)),
    [allAttendees, selectedKeys]
  )

  const toggleAttendee = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )
  }

  const addManualAttendee = () => {
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    const key = `email:${email}`
    if (allAttendees.some((item) => item.key === key)) {
      setManualEmail('')
      setSelectedKeys((current) => (current.includes(key) ? current : [...current, key]))
      return
    }
    setManualAttendees((current) => [
      ...current,
      {
        key,
        department: 'Manual',
        userId: '',
        name: email,
        email,
      },
    ])
    setSelectedKeys((current) => [...current, key])
    setManualEmail('')
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
    Number(durationMinutes) > 0 &&
    selectedAttendees.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[94vw] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
          <DialogTitle className="text-base font-semibold text-slate-900">
            Convocar reunió
          </DialogTitle>
          {target?.title ? (
            <div className="text-sm text-slate-500">
              {target.scope === 'task' ? 'Tasca' : 'Bloc'}: {target.title}
              {target.subtitle ? ` · ${target.subtitle}` : ''}
            </div>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-[150px_140px_140px]">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora inici</Label>
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Durada</Label>
              <Input
                type="number"
                min="15"
                step="15"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-[96px]"
              placeholder="Ordre del dia, punts a revisar, bloquejos, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Fitxers</Label>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                <Paperclip className="h-4 w-4" />
                Adjuntar fitxers
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    appendAttachments(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              {attachments.length > 0 ? (
                <span className="text-sm text-slate-500">
                  {attachments.length} fitxer{attachments.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            {attachments.length > 0 ? (
              <div className="max-h-28 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {attachments.map((file) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-700">{file.name}</span>
                    <button
                      type="button"
                      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => removeAttachment(file)}
                      aria-label="Eliminar fitxer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label>Afegir correu manual</Label>
                <Input
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="nom@empresa.com"
                />
              </div>
              <Button type="button" variant="outline" onClick={addManualAttendee}>
                Afegir
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Assistents</Label>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {allAttendees.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                    No hi ha assistents disponibles.
                  </div>
                ) : (
                  allAttendees.map((attendee) => {
                    const selected = selectedKeys.includes(attendee.key)
                    return (
                      <button
                        key={attendee.key}
                        type="button"
                        onClick={() => toggleAttendee(attendee.key)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? 'border-violet-300 bg-violet-50 text-violet-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{attendee.name || attendee.email}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {attendee.department || 'Sense departament'} · {attendee.email}
                          </span>
                        </span>
                        <span className="ml-3 text-xs font-semibold">
                          {selected ? 'Inclòs' : 'Fora'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-sm text-slate-500">
            {selectedAttendees.length} assistent{selectedAttendees.length === 1 ? '' : 's'} seleccionat
            {selectedAttendees.length === 1 ? '' : 's'}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel·lar
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || sending}
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                if (!target || !canSubmit) return
                void onSubmit({
                  scope: target.scope,
                  blockId: target.blockId,
                  taskId: target.taskId,
                  date,
                  startTime,
                  durationMinutes: Number(durationMinutes),
                  notes,
                  attachments,
                  attendees: selectedAttendees,
                })
              }}
            >
              {sending ? 'Enviant...' : 'Enviar convocatòria'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
