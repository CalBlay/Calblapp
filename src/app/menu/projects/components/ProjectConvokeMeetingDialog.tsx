'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { MailPlus, Paperclip, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { KickoffAttendee } from './project-shared'
import { projectEmptyStateClass } from './project-ui'
import type { ResponsibleOption } from './project-workspace-helpers'
import KickoffAttendeeSearchCombobox from './KickoffAttendeeSearchCombobox'

export type ConvokeMeetingAttendee = KickoffAttendee

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sending: boolean
  canSend: boolean
  locked?: boolean
  minDate?: string
  dialogTitle: string
  dialogSubtitle: string
  attendeesHint: string
  date: string
  startTime: string
  durationMinutes: number
  notes: string
  attendees: ConvokeMeetingAttendee[]
  attendeeSearchOptions: ResponsibleOption[]
  manualEmail: string
  onDateChange: (value: string) => void
  onStartTimeChange: (value: string) => void
  onDurationChange: (value: number) => void
  onNotesChange: (value: string) => void
  onManualEmailChange: (value: string) => void
  onAddManualEmail: () => void
  onAddAttendeeFromUser: (user: ResponsibleOption) => void
  onRemoveAttendee: (key: string) => void
  onSend: () => Promise<boolean> | boolean
  showAttachments?: boolean
  attachments?: File[]
  onAppendAttachments?: (files: FileList | null) => void
  onRemoveAttachment?: (file: File) => void
  closeLabel?: string
}

export default function ProjectConvokeMeetingDialog({
  open,
  onOpenChange,
  sending,
  canSend,
  locked = false,
  minDate,
  dialogTitle,
  dialogSubtitle,
  attendeesHint,
  date,
  startTime,
  durationMinutes,
  notes,
  attendees,
  attendeeSearchOptions,
  manualEmail,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  onNotesChange,
  onManualEmailChange,
  onAddManualEmail,
  onAddAttendeeFromUser,
  onRemoveAttendee,
  onSend,
  showAttachments = false,
  attachments = [],
  onAppendAttachments,
  onRemoveAttachment,
  closeLabel = 'Tancar',
}: Props) {
  const dateValue = String(date || '').trim()
  const selectedDate =
    dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? parseISO(dateValue) : undefined
  const formattedDate = selectedDate
    ? format(selectedDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: ca })
    : ''

  const convocats = useMemo(
    () =>
      [...attendees].sort((left, right) =>
        (left.name || left.email).localeCompare(right.name || right.email, 'ca', {
          sensitivity: 'base',
        })
      ),
    [attendees]
  )

  const renderConvocat = (item: ConvokeMeetingAttendee) => (
    <div
      key={item.key}
      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{item.name || item.email}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {item.department || 'Sense departament'} · {item.email}
        </p>
      </div>
      {!locked ? (
        <button
          type="button"
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          onClick={() => onRemoveAttendee(item.key)}
          aria-label={`Treure ${item.name || item.email}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,80rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4">
          <DialogTitle className="text-base font-semibold text-slate-900">{dialogTitle}</DialogTitle>
          {dialogSubtitle ? <div className="text-sm text-slate-500">{dialogSubtitle}</div> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)]">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={dateValue}
                  min={minDate}
                  onChange={(event) => onDateChange(event.target.value)}
                  disabled={locked}
                />
                {formattedDate ? (
                  <p className="px-1 text-xs capitalize text-slate-500">{formattedDate}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(event) => onStartTimeChange(event.target.value)}
                  disabled={locked}
                />
              </div>
              <div className="space-y-2">
                <Label>Durada</Label>
                <select
                  value={String(durationMinutes || 60)}
                  onChange={(event) => onDurationChange(Number(event.target.value))}
                  disabled={locked}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400"
                >
                  {[30, 45, 60, 90, 120].map((value) => (
                    <option key={value} value={String(value)}>
                      {value} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Notes de la convocatòria</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => onNotesChange(event.target.value)}
                    readOnly={locked}
                    className="min-h-[280px] resize-y"
                    placeholder="Context, abast i punts a revisar"
                  />
                </div>

                {showAttachments && !locked ? (
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
                            onAppendAttachments?.(event.target.files)
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
                              onClick={() => onRemoveAttachment?.(file)}
                              aria-label="Eliminar fitxer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div>
                  <Label>Convocats</Label>
                  <p className="mt-1 text-xs text-slate-500">{attendeesHint}</p>
                </div>

                <div className="max-h-[min(34vh,280px)] space-y-2 overflow-y-auto">
                  {convocats.length > 0 ? (
                    convocats.map(renderConvocat)
                  ) : (
                    <p className={projectEmptyStateClass}>Encara no hi ha assistents convocats.</p>
                  )}
                </div>

                {!locked ? (
                  <>
                    <div className="space-y-2 border-t border-slate-200 pt-4">
                      <Label>Afegir assistent</Label>
                      <KickoffAttendeeSearchCombobox
                        options={attendeeSearchOptions}
                        onPick={onAddAttendeeFromUser}
                      />
                    </div>

                    <div className="space-y-2 border-t border-slate-200 pt-4">
                      <Label>Afegir correu electrònic</Label>
                      <div className="flex gap-2">
                        <Input
                          value={manualEmail}
                          onChange={(event) => onManualEmailChange(event.target.value)}
                          placeholder="nom@empresa.com"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={onAddManualEmail}
                        >
                          Afegir
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            {convocats.length} assistent{convocats.length === 1 ? '' : 's'} convocat
            {convocats.length === 1 ? '' : 's'}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {closeLabel}
            </Button>
            {!locked ? (
              <Button
                type="button"
                disabled={!canSend || sending}
                className="bg-violet-600 text-white hover:bg-violet-700"
                onClick={async () => {
                  const result = await onSend()
                  if (result === true) onOpenChange(false)
                }}
              >
                <MailPlus className="mr-2 h-4 w-4" />
                {sending ? 'Enviant...' : 'Enviar convocatòria'}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
