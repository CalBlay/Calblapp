'use client'

import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { MailPlus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type KickoffAttendee, type ProjectData } from './project-shared'
import { projectEmptyStateClass, projectSectionTitleClass } from './project-ui'

type Props = {
  project: ProjectData
  manualKickoffEmail: string
  kickoffReady: boolean
  sendingKickoff: boolean
  onKickoffFieldChange: <K extends keyof ProjectData['kickoff']>(
    field: K,
    value: ProjectData['kickoff'][K]
  ) => void
  onManualKickoffEmailChange: (value: string) => void
  onAddManualKickoffEmail: () => void
  onSendKickoff: () => void
  onReopenKickoff?: () => void
  onRemoveKickoffAttendee: (key: string) => void
  showSendButton?: boolean
  headerAction?: ReactNode
}

export default function ProjectKickoffTab({
  project,
  manualKickoffEmail,
  kickoffReady,
  sendingKickoff,
  onKickoffFieldChange,
  onManualKickoffEmailChange,
  onAddManualKickoffEmail,
  onSendKickoff,
  onReopenKickoff,
  onRemoveKickoffAttendee,
  showSendButton = true,
  headerAction,
}: Props) {
  const kickoffMinDate =
    typeof project.createdAt === 'number' && project.createdAt > 0
      ? new Date(project.createdAt).toISOString().slice(0, 10)
      : undefined
  const kickoffDateValue = String(project.kickoff.date || '').trim()
  const kickoffSelectedDate =
    kickoffDateValue && /^\d{4}-\d{2}-\d{2}$/.test(kickoffDateValue)
      ? parseISO(kickoffDateValue)
      : undefined
  const formattedKickoffDate = kickoffSelectedDate
    ? format(kickoffSelectedDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: ca })
    : ''
  const kickoffLocked = Boolean(
    String(project.kickoff.status || '').trim() || String(project.kickoff.graphWebLink || '').trim()
  )

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-[24px] bg-white/75 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <h2 className={projectSectionTitleClass}>Reunió d'arrencada</h2>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {headerAction}
            {kickoffLocked && onReopenKickoff ? (
              <Button type="button" variant="outline" size="icon" onClick={onReopenKickoff}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : null}
            {showSendButton && !kickoffLocked ? (
              <Button
                type="button"
                onClick={onSendKickoff}
                disabled={!kickoffReady || sendingKickoff}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <MailPlus className="mr-2 h-4 w-4" />
                Enviar convocatòria
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_0.9fr_0.9fr]">
          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={kickoffDateValue}
              min={kickoffMinDate}
              onChange={(event) => onKickoffFieldChange('date', event.target.value)}
              disabled={kickoffLocked}
              className="h-14 rounded-2xl"
            />
            {kickoffSelectedDate ? (
              <div className="px-1 text-xs text-slate-500 capitalize">{formattedKickoffDate}</div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Hora</Label>
            <Input
              type="time"
              value={project.kickoff.startTime}
              onChange={(event) => onKickoffFieldChange('startTime', event.target.value)}
              disabled={kickoffLocked}
              className="h-14 rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Durada</Label>
            <select
              value={String(project.kickoff.durationMinutes || 60)}
              onChange={(event) => onKickoffFieldChange('durationMinutes', Number(event.target.value))}
              disabled={kickoffLocked}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-violet-400"
            >
              {[30, 45, 60, 90, 120].map((value) => (
                <option key={value} value={String(value)}>
                  {value} min
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-2 rounded-[24px] bg-white/75 p-5">
          <Label>Notes de la convocatòria</Label>
          <Textarea
            value={project.kickoff.notes}
            onChange={(event) => onKickoffFieldChange('notes', event.target.value)}
            readOnly={kickoffLocked}
            className="min-h-[220px] rounded-2xl"
            placeholder="Context, abast i punts a revisar"
          />
        </div>

        <div className="space-y-4 rounded-[24px] bg-slate-50/80 p-5">
          <h2 className={projectSectionTitleClass}>Assistents</h2>

          <div className="rounded-[22px] bg-white/90 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Convocats</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.kickoff.attendees.length > 0 ? (
                project.kickoff.attendees.map((item: KickoffAttendee) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700"
                  >
                    <span className="max-w-[240px] truncate">
                      {item.name} - {item.email}
                    </span>
                    {!kickoffLocked ? (
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => onRemoveKickoffAttendee(item.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                ))
              ) : (
                <span className={projectEmptyStateClass}>Encara no hi ha assistents.</span>
              )}
            </div>
          </div>

          <div className="rounded-[22px] bg-white/90 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Afegir correu electrònic</div>
            <div className="mt-3 flex gap-3">
              <Input
                value={manualKickoffEmail}
                onChange={(event) => onManualKickoffEmailChange(event.target.value)}
                placeholder="nom@empresa.com"
                disabled={kickoffLocked}
                className="rounded-2xl"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onAddManualKickoffEmail}
                disabled={kickoffLocked}
              >
                Afegir
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
